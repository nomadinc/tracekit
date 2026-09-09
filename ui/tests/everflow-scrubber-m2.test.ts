import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  processEverflowScrubberRequest,
  ScrubberGatewayError,
  type GatewayDecision,
  type MockForwardOutcome,
  type ScrubberGatewayRepository,
  type ScrubberMockForwarder,
} from "../lib/integrations/everflow-scrubber-gateway.ts";

const token = "source-token-with-more-than-thirty-two-characters";
const payload = (extra: Record<string, unknown> = {}) => JSON.stringify({ transaction_id: "tid-1", oid: 52, affid: 107, order_id: "ORD-1", amount: 25, ...extra });

class MemoryRepository implements ScrubberGatewayRepository {
  authenticated = true;
  scrubbing = true;
  target = 1;
  seen = new Map<string, GatewayDecision>();
  rejections: string[] = [];
  attempts: MockForwardOutcome[] = [];
  eligibleCount = 0;
  passedCount = 0;
  async authenticate() { return this.authenticated ? { id: "source-1", organizationId: "org-1", connectionId: "conn-1", sourceKey: "commas", eligibleEventKeys: ["purchase"] } : null; }
  async recordRejected(input: { reason: string }) { this.rejections.push(input.reason); }
  async decide(input: Parameters<ScrubberGatewayRepository["decide"]>[0]) {
    const prior = this.seen.get(input.idempotencyKey);
    if (prior) return { ...prior, duplicate: true, reason: "DUPLICATE_SUPPRESSED" };
    const eligible = input.eligible && this.scrubbing;
    const pass = !eligible || input.randomUnit < this.target;
    if (eligible) { this.eligibleCount += 1; if (pass) this.passedCount += 1; }
    const result: GatewayDecision = {
      conversionId: `conversion-${this.seen.size + 1}`, decision: pass ? "PASS" : "SCRUB",
      reason: !this.scrubbing ? "PASS_GLOBAL_BYPASS" : !input.eligible ? "PASS_NON_ELIGIBLE_EVENT" : pass ? "PASS_RULE_TARGET" : "SCRUB_RULE_TARGET",
      duplicate: false, forwardStatus: pass ? "pending" : "not_applicable", rulePeriodId: eligible ? "period-1" : null,
      effectivePassRate: eligible ? this.target : !this.scrubbing ? 1 : null,
    };
    this.seen.set(input.idempotencyKey, result);
    return result;
  }
  async recordMockForward(_conversionId: string, outcome: MockForwardOutcome) {
    this.attempts.push(outcome);
    return { forwardStatus: outcome.outcome === "succeeded" ? "succeeded" : "retry", attemptNumber: this.attempts.length, nextRetryAt: outcome.outcome === "retryable_failure" ? outcome.retryAt : null };
  }
}

class Forwarder implements ScrubberMockForwarder {
  calls = 0;
  constructor(private outcome: MockForwardOutcome = { outcome: "succeeded", httpStatus: 204, responseReference: "mock:1" }) {}
  async forward() { this.calls += 1; return this.outcome; }
}

const run = (repo: MemoryRepository, forwarder: Forwarder, body = payload(), requestId = crypto.randomUUID()) => processEverflowScrubberRequest({
  authorization: `Bearer ${token}`, rawBody: body, repository: repo, forwarder, requestId, random: () => .5,
});

test("authenticated ingress rejects missing credentials and records the reason", async () => {
  const repo = new MemoryRepository(); repo.authenticated = false;
  await assert.rejects(() => processEverflowScrubberRequest({ authorization: null, rawBody: payload(), repository: repo, forwarder: new Forwarder() }), (error: unknown) => error instanceof ScrubberGatewayError && error.status === 401);
  assert.deepEqual(repo.rejections, ["REJECT_UNAUTHORIZED_REQUEST"]);
});

test("mock forwarding runs once and duplicate suppression never forwards twice", async () => {
  const repo = new MemoryRepository(); const forwarder = new Forwarder();
  const first = await run(repo, forwarder, payload(), "00000000-0000-4000-8000-000000000001");
  const duplicate = await run(repo, forwarder, payload(), "00000000-0000-4000-8000-000000000002");
  assert.equal(first.forwardStatus, "succeeded");
  assert.equal(duplicate.reason, "DUPLICATE_SUPPRESSED");
  assert.equal(forwarder.calls, 1);
});

test("global bypass passes without changing eligible controller counts", async () => {
  const repo = new MemoryRepository(); repo.scrubbing = false;
  const result = await run(repo, new Forwarder());
  assert.equal(result.reason, "PASS_GLOBAL_BYPASS");
  assert.equal(repo.eligibleCount, 0);
});

test("non-eligible events pass without changing eligible controller counts", async () => {
  const repo = new MemoryRepository();
  const result = await run(repo, new Forwarder(), payload({ event_key: "lead" }));
  assert.equal(result.reason, "PASS_NON_ELIGIBLE_EVENT");
  assert.equal(repo.eligibleCount, 0);
});

test("scrubbed decisions are persisted but never sent to the mock forwarder", async () => {
  const repo = new MemoryRepository(); repo.target = 0; const forwarder = new Forwarder();
  const result = await run(repo, forwarder);
  assert.equal(result.reason, "SCRUB_RULE_TARGET");
  assert.equal(forwarder.calls, 0);
  assert.equal(repo.eligibleCount, 1);
});

test("retryable mock forwarding retains PASS and records retry state", async () => {
  const repo = new MemoryRepository();
  const retryAt = "2026-09-09T18:00:00.000Z";
  const result = await run(repo, new Forwarder({ outcome: "retryable_failure", errorCode: "mock_timeout", retryAt }));
  assert.equal(result.decision, "PASS");
  assert.equal(result.forwardStatus, "retry");
  assert.equal("nextRetryAt" in result ? result.nextRetryAt : null, retryAt);
  assert.equal(repo.attempts.length, 1);
});

test("public ingress route uses bearer authentication and contains no live Everflow forwarder", () => {
  const route = readFileSync(new URL("../app/api/conversion/route.ts", import.meta.url), "utf8");
  assert.match(route, /request\.headers\.get\("authorization"\)/);
  assert.match(route, /M2MockEverflowForwarder/);
  assert.doesNotMatch(route, /api\.eflow\.team|www\.eflow\.team|X-Eflow-Api-Key/);
});

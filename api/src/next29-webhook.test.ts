import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { handleNext29Webhook, parseNext29Webhook, verifyNext29WebhookSignature } from "./connectors/next29/webhook.ts";
import type { Next29EvidenceSink } from "./connectors/next29/types.ts";

const encoder = new TextEncoder();
const secret = "webhook-secret";

function body(eventType = "order.created", object = "order", eventId = "evt-1", data: Record<string, unknown> = { number: "1001" }) {
  return encoder.encode(JSON.stringify({
    object,
    data,
    event_id: eventId,
    event_type: eventType,
    webhook: { id: 39, store: "demo" },
    api_version: "2024-04-01",
  }));
}
function signature(raw: Uint8Array) { return createHmac("sha256", secret).update(raw).digest("hex"); }
function evidence(): Next29EvidenceSink & { writes: any[] } {
  const writes: any[] = [];
  return {
    writes,
    async putImmutable(input) {
      writes.push(input);
      return { storageReference: `memory://${input.sourceObjectId}`, payloadHash: `hash-${input.sourceObjectId}`, byteSize: input.payload.byteLength };
    },
  };
}
function idempotency() {
  const reserved = new Set<string>();
  const calls: any[] = [];
  return {
    calls,
    async reserve(input: any) {
      calls.push(["reserve", input]);
      if (reserved.has(input.eventId)) return { accepted: false };
      reserved.add(input.eventId);
      return { accepted: true };
    },
    async complete(input: any) { calls.push(["complete", input]); },
    async fail(input: any) { calls.push(["fail", input]); },
  };
}

test("29Next webhook signature verification accepts valid HMAC-SHA256 hex and rejects tampering", async () => {
  const raw = body();
  assert.equal(await verifyNext29WebhookSignature({ rawBody: raw, signature: signature(raw), signingSecret: secret }), true);
  const tampered = body("order.updated");
  assert.equal(await verifyNext29WebhookSignature({ rawBody: tampered, signature: signature(raw), signingSecret: secret }), false);
  assert.equal(await verifyNext29WebhookSignature({ rawBody: raw, signature: "bad", signingSecret: secret }), false);
});

test("29Next webhook parser enforces documented envelope and object-event consistency", () => {
  const parsed = parseNext29Webhook(body("subscription.updated", "subscription", "evt-sub", { id: 55 }));
  assert.equal(parsed.event_id, "evt-sub");
  assert.equal(parsed.event_type, "subscription.updated");
  assert.equal(parsed.api_version, "2024-04-01");
  assert.throws(() => parseNext29Webhook(body("customer.created", "customer")), /not supported/);
});

test("29Next webhook handler persists immutable event evidence before routing", async () => {
  const raw = body();
  const sink = evidence();
  const idem = idempotency();
  const calls: string[] = [];
  const result = await handleNext29Webhook({
    organizationId: "org", connectionId: "conn", providerAccountId: "acct",
    rawBody: raw, signature: signature(raw), signingSecret: secret,
    evidenceSink: sink, idempotency: idem,
    handlers: { order: async (input) => { calls.push("order"); assert.equal(input.evidence.payloadHash, "hash-evt-1"); assert.equal(input.data.number, "1001"); } },
    observedAt: "2026-09-01T05:00:00Z",
  });
  assert.equal(result.duplicate, false);
  assert.equal(result.routedObject, "order");
  assert.equal(sink.writes.length, 1);
  assert.equal(sink.writes[0].sourceObjectType, "next29_webhook");
  assert.equal(sink.writes[0].sourceObjectId, "evt-1");
  assert.deepEqual(calls, ["order"]);
  assert.deepEqual(idem.calls.map(([kind]) => kind), ["reserve", "complete"]);
});

test("29Next webhook duplicate event is acknowledged without duplicate evidence or canonical routing", async () => {
  const raw = body();
  const sink = evidence();
  const idem = idempotency();
  let routed = 0;
  const args = {
    organizationId: "org", connectionId: "conn", providerAccountId: "acct",
    rawBody: raw, signature: signature(raw), signingSecret: secret,
    evidenceSink: sink, idempotency: idem,
    handlers: { order: async () => { routed += 1; } },
  };
  const first = await handleNext29Webhook(args);
  const second = await handleNext29Webhook(args);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(routed, 1);
  assert.equal(sink.writes.length, 1);
});

test("29Next webhook routes transaction subscription and dispute events to isolated handlers", async () => {
  for (const route of ["transaction", "subscription", "dispute"] as const) {
    const raw = body(`${route}.created`, route, `evt-${route}`, { id: 7 });
    let observed: string | null = null;
    await handleNext29Webhook({
      organizationId: "org", connectionId: "conn", providerAccountId: "acct",
      rawBody: raw, signature: signature(raw), signingSecret: secret,
      evidenceSink: evidence(), idempotency: idempotency(),
      handlers: { [route]: async (input: any) => { observed = input.eventType; } },
    });
    assert.equal(observed, `${route}.created`);
  }
});

test("29Next webhook fails closed on event/object mismatch and records handler failure after reservation", async () => {
  const mismatch = body("order.created", "transaction");
  await assert.rejects(() => handleNext29Webhook({
    organizationId: "org", connectionId: "conn", providerAccountId: "acct",
    rawBody: mismatch, signature: signature(mismatch), signingSecret: secret,
    evidenceSink: evidence(), idempotency: idempotency(), handlers: {},
  }), /object does not match/);

  const raw = body();
  const idem = idempotency();
  await assert.rejects(() => handleNext29Webhook({
    organizationId: "org", connectionId: "conn", providerAccountId: "acct",
    rawBody: raw, signature: signature(raw), signingSecret: secret,
    evidenceSink: evidence(), idempotency: idem,
    handlers: { order: async () => { throw new Error("downstream failed"); } },
  }), /downstream failed/);
  assert.deepEqual(idem.calls.map(([kind]) => kind), ["reserve", "fail"]);
});

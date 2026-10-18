import assert from "node:assert/strict";
import test from "node:test";
import { pageJourneySnapshot, type TimelineRow } from "./journey-snapshot-page.ts";
const row = (id: string, sequence: number, kind: TimelineRow["kind"] = "purchase"): TimelineRow =>
 ({ id, organizationId: "stem", journeyId: "j1", source: "next29", sourceEventId: id,
    occurredAt: "2026-10-01T00:00:00Z", observedSequence: sequence, kind,
    commerceOrderId: "order-1", parentEventId: null, attributionId: null, evidenceId: "ev-" + id });
const base = { organizationId: "stem", journeyIds: ["j1"], snapshotSequence: 3, pageSize: 2, rows: [row("a", 1), row("b", 2, "upsell"), row("c", 3, "refund")] };
test("snapshot pagination produces stable nonoverlapping pages", () => {
 const first = pageJourneySnapshot(base);
 assert.equal(first.status, "ready");
 if (first.status !== "ready") return;
 const second = pageJourneySnapshot({ ...base, cursor: first.nextCursor! });
 assert.equal(second.status, "ready");
 if (second.status === "ready") assert.deepEqual([...first.rows, ...second.rows].map(r => r.id), ["a", "b", "c"]);
});
test("newly observed event cannot shift a frozen snapshot", () => {
 const first = pageJourneySnapshot(base);
 if (first.status !== "ready") return;
 const extra = { ...row("aa", 4), occurredAt: "2026-09-30T00:00:00Z" };
 const second = pageJourneySnapshot({ ...base, rows: [...base.rows, extra], cursor: first.nextCursor! });
 assert.equal(second.status, "ready");
 if (second.status === "ready") assert.deepEqual(second.rows.map(r => r.id), ["c"]);
});
test("missing cursor fails closed instead of restarting pagination", () => {
 assert.deepEqual(pageJourneySnapshot({ ...base, cursor: "unknown" }), { status: "unavailable", reason: "invalid_cursor" });
});
test("foreign tenant evidence rejected", () => {
 assert.deepEqual(pageJourneySnapshot({ ...base, rows: [...base.rows, { ...row("foreign", 1), organizationId: "other" }] }), { status: "unavailable", reason: "invalid_scope" });
});
test("conflicting duplicate source events rejected", () => {
 assert.deepEqual(pageJourneySnapshot({ ...base, rows: [...base.rows, { ...row("a", 1), kind: "reversal" }] }), { status: "unavailable", reason: "conflicting_event" });
});
test("subscription and rebill events remain separate with parent evidence", () => {
 const subscription = { ...row("subscription", 1, "subscription"), parentEventId: null };
 const rebill = { ...row("rebill", 2, "rebill"), parentEventId: "subscription" };
 const result = pageJourneySnapshot({ ...base, rows: [subscription, rebill] });
 assert.equal(result.status, "ready");
 if (result.status === "ready") assert.deepEqual(result.rows.map(r => [r.kind, r.parentEventId]), [["rebill", "subscription"], ["subscription", null]]);
});

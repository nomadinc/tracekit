import assert from "node:assert/strict";
import test from "node:test";
import { assembleJourneys, type JourneyRecord, type JourneyEvent, type JourneyOrderLink } from "./journey-read-model.ts";
const organizationId = "stem", personId = "person";
const journeys: JourneyRecord[] = [
 { id: "j1", organizationId, personId, startedAt: "2026-10-01T00:00:00Z" },
 { id: "j2", organizationId, personId, startedAt: "2026-10-02T00:00:00Z" },
];
const events: JourneyEvent[] = [
 { id: "e2", organizationId, journeyId: "j1", source: "next29", sourceEventId: "up", occurredAt: "2026-10-01T02:00:00Z", kind: "upsell", commerceOrderId: "order1", parentEventId: "e1", attributionId: null, evidenceId: "ev2" },
 { id: "e1", organizationId, journeyId: "j1", source: "next29", sourceEventId: "purchase", occurredAt: "2026-10-01T01:00:00Z", kind: "purchase", commerceOrderId: "order1", parentEventId: null, attributionId: "ef-click", evidenceId: "ev1" },
 { id: "e3", organizationId, journeyId: "j2", source: "next29", sourceEventId: "rebill", occurredAt: "2026-10-03T01:00:00Z", kind: "rebill", commerceOrderId: "order2", parentEventId: "e1", attributionId: null, evidenceId: "ev3" },
 { id: "e4", organizationId, journeyId: "j1", source: "next29", sourceEventId: "refund", occurredAt: "2026-10-04T01:00:00Z", kind: "refund", commerceOrderId: "order1", parentEventId: "e1", attributionId: null, evidenceId: "ev4" },
];
const links: JourneyOrderLink[] = [{ organizationId, canonicalOrderId: "order1", journeyId: "j1", evidenceId: "link1", status: "verified" }];
const base = { organizationId, personId, journeys, links, events, sourceCurrent: true };
test("single order selects linked journey, not arbitrary first", () => {
 const result = assembleJourneys({ ...base, orderId: "order1" });
 assert.equal(result.status, "ready");
 if (result.status === "ready") assert.deepEqual(result.journeys.map(j => j.journey.id), ["j1"]);
});
test("multiple journeys and purchase before upsell, refunds retained", () => {
 const result = assembleJourneys(base);
 assert.equal(result.status, "ready");
 if (result.status === "ready") {
  assert.equal(result.journeys.length, 2);
  assert.deepEqual(result.journeys[0].events.map(e => e.kind), ["purchase", "upsell", "refund"]);
  assert.equal(result.journeys[1].events[0].kind, "rebill");
 }
});
test("stable pagination retains event identity", () => {
 const first = assembleJourneys({ ...base, pageSize: 2 });
 assert.equal(first.status, "ready");
 if (first.status !== "ready") return;
 assert.ok(first.nextCursor);
 const second = assembleJourneys({ ...base, pageSize: 2, cursor: first.nextCursor! });
 assert.equal(second.status, "ready");
 if (second.status === "ready") assert.equal(second.nextCursor, null);
});
test("unlinked order does not invent a relationship", () => {
 const result = assembleJourneys({ ...base, orderId: "missing" });
 assert.equal(result.status, "ready");
 if (result.status === "ready") assert.deepEqual(result.unresolved, ["missing_order_journey_link"]);
});
test("ambiguous order link fails closed", () => {
 assert.deepEqual(assembleJourneys({ ...base, orderId: "order1", links: [...links, { ...links[0], journeyId: "j2" }] }), { status: "unresolved", reason: "ambiguous_order_link" });
});
test("foreign tenant evidence denied", () => {
 assert.deepEqual(assembleJourneys({ ...base, events: [...events, { ...events[0], organizationId: "foreign" }] }), { status: "unresolved", reason: "invalid_scope" });
});
test("duplicate source event deduplicated and conflicting evidence denied", () => {
 const repeated = assembleJourneys({ ...base, events: [...events, events[0]] });
 assert.equal(repeated.status, "ready");
 assert.deepEqual(assembleJourneys({ ...base, events: [...events, { ...events[0], kind: "reversal" }] }), { status: "unresolved", reason: "conflicting_source_event" });
});
test("missing person and stale source explicit", () => {
 assert.deepEqual(assembleJourneys({ ...base, personId: null }), { status: "unresolved", reason: "missing_person" });
 assert.deepEqual(assembleJourneys({ ...base, sourceCurrent: false }), { status: "unresolved", reason: "stale_source" });
});

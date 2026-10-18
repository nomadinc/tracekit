import assert from "node:assert/strict";
import test from "node:test";
import { inspectCoreCustomerRead } from "./core-read-contract.ts";
const detail = {
 customer: { id: "person-1", workspace_id: "stem" },
 journeys: [{ id: "journey-a", person_id: "person-1", workspace_id: "stem" }, { id: "journey-b", person_id: "person-1", workspace_id: "stem" }],
 orders: [{ canonical_order_id: "order-1", person_id: "person-1", workspace_id: "stem" }],
 summary: { total_journeys: 2, total_orders: 1 },
};
const link = { canonicalOrderId: "order-1", journeyId: "journey-b", workspaceId: "stem", status: "verified" as const, evidenceId: "link-1" };
test("selects explicitly linked second journey, not first array entry", () => {
 const result = inspectCoreCustomerRead({ workspaceId: "stem", detail, links: [link] });
 assert.equal(result.status, "ready");
 if (result.status === "ready") assert.deepEqual(result.orderJourneys, [{ canonicalOrderId: "order-1", journeyId: "journey-b", state: "linked" }]);
});
test("missing link remains unresolved, never guessed by order time", () => {
 const result = inspectCoreCustomerRead({ workspaceId: "stem", detail, links: [] });
 if (result.status === "ready") assert.deepEqual(result.orderJourneys, [{ canonicalOrderId: "order-1", journeyId: null, state: "unresolved" }]);
 else assert.fail("expected gap report");
});
test("foreign workspace customer and link are rejected", () => {
 assert.deepEqual(inspectCoreCustomerRead({ workspaceId: "other", detail, links: [] }), { status: "unavailable", reason: "invalid_scope" });
 assert.deepEqual(inspectCoreCustomerRead({ workspaceId: "stem", detail, links: [{ ...link, workspaceId: "other" }] }), { status: "unavailable", reason: "invalid_scope" });
});
test("ambiguous verified links reject order association", () => {
 const result = inspectCoreCustomerRead({ workspaceId: "stem", detail, links: [link, { ...link, journeyId: "journey-a", evidenceId: "link-2" }] });
 assert.deepEqual(result, { status: "unavailable", reason: "ambiguous_link" });
});
test("summary count larger than page is reported as incomplete", () => {
 const result = inspectCoreCustomerRead({ workspaceId: "stem", detail: { ...detail, summary: { total_journeys: 3, total_orders: 2 } }, links: [link] });
 if (result.status === "ready") assert.deepEqual(result.gaps, ["journey_list_incomplete", "order_list_incomplete"]);
 else assert.fail("expected gap report");
});
test("UI order ID is not substituted for canonical order identity", () => {
 const result = inspectCoreCustomerRead({ workspaceId: "stem", detail: { ...detail, orders: [{ id: "display-only" }] }, links: [link] });
 if (result.status === "ready") assert.deepEqual(result.gaps, ["missing_canonical_order_id"]);
 else assert.fail("expected gap report");
});

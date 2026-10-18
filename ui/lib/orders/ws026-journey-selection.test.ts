import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrderJourney } from "./ws026-journey-selection.ts";
const base = { canonicalOrderId: "order-1", organizationId: "stem", workspaceId: "workspace",
 journeys: [{ id: "journey-first" }, { id: "journey-second" }],
 references: [{ canonical_order_id: "order-1", journey_id: "journey-second", status: "verified" }] };
test("selects verified second journey rather than first", () => assert.deepEqual(resolveOrderJourney(base), { status: "linked", journeyId: "journey-second" }));
test("missing canonical order ID never guesses", () => assert.deepEqual(resolveOrderJourney({ ...base, canonicalOrderId: null }), { status: "unresolved", reason: "missing_order_id" }));
test("missing authoritative links never falls back to first journey", () => assert.deepEqual(resolveOrderJourney({ ...base, references: [] }), { status: "unresolved", reason: "missing_link" }));
test("observed link alone cannot establish an authoritative journey", () => assert.deepEqual(resolveOrderJourney({ ...base, references: [{ ...base.references[0], status: "observed" }] }), { status: "unresolved", reason: "missing_link" }));
test("multiple verified journeys are ambiguous", () => assert.deepEqual(resolveOrderJourney({ ...base, references: [...base.references, { canonical_order_id: "order-1", journey_id: "journey-first", status: "verified" }] }), { status: "unresolved", reason: "ambiguous_link" }));
test("foreign tenant relationship denied", () => assert.deepEqual(resolveOrderJourney({ ...base, references: [{ ...base.references[0], organization_id: "other" }] }), { status: "unresolved", reason: "foreign_scope" }));
test("verified reference to absent journey remains unresolved", () => assert.deepEqual(resolveOrderJourney({ ...base, journeys: [{ id: "journey-first" }] }), { status: "unresolved", reason: "missing_journey" }));

import assert from "node:assert/strict";
import test from "node:test";
import { selectCustomerJourney } from "./ws026-journey-choice.ts";
const ready = (id: string) => ({ id, status: "ready" as const, eventCount: 1, nextCursor: null, explanation: "verified" });
test("single verified journey selected", () => assert.deepEqual(selectCustomerJourney([ready("j1")], null), { selectedId: "j1", reason: "Only verified journey" }));
test("multiple journeys never silently select first", () => assert.deepEqual(selectCustomerJourney([ready("j1"), ready("j2")], null), { selectedId: null, reason: "Select a journey to inspect" }));
test("explicit second journey selection is deterministic", () => assert.deepEqual(selectCustomerJourney([ready("j1"), ready("j2")], "j2"), { selectedId: "j2", reason: "Explicit journey selection" }));
test("unknown or stale journey is unresolved", () => {
 assert.equal(selectCustomerJourney([ready("j1")], "missing").selectedId, null);
 assert.equal(selectCustomerJourney([{ ...ready("j1"), status: "stale" }], "j1").selectedId, null);
});
test("duplicate journey IDs fail closed", () => assert.deepEqual(selectCustomerJourney([ready("j1"), ready("j1")], null), { selectedId: null, reason: "Ambiguous canonical journey records" }));
test("no verified journey produces explicit empty state", () => assert.deepEqual(selectCustomerJourney([], null), { selectedId: null, reason: "No verified canonical journey" }));

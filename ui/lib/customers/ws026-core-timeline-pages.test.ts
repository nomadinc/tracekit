import assert from "node:assert/strict";
import test from "node:test";
import { collectCoreTimelinePages } from "./ws026-core-timeline-pages.ts";
test("collects multiple Core cursor pages", async () => {
 const result = await collectCoreTimelinePages(async cursor => cursor ? { events: [{ id: "b" }], next_cursor: null } : { events: [{ id: "a" }], next_cursor: "next" });
 assert.equal(result.status, "complete");
 if (result.status !== "unavailable") assert.deepEqual(result.events, [{ id: "a" }, { id: "b" }]);
});
test("repeated cursor fails closed", async () => {
 const result = await collectCoreTimelinePages(async () => ({ events: [{ id: "a" }], next_cursor: "same" }));
 assert.deepEqual(result, { status: "unavailable", reason: "cursor_cycle", events: [] });
});
test("duplicate identical event counted once", async () => {
 const result = await collectCoreTimelinePages(async cursor => cursor ? { events: [{ id: "a" }], next_cursor: null } : { events: [{ id: "a" }], next_cursor: "next" });
 if (result.status !== "unavailable") assert.equal(result.events.length, 1);
});
test("conflicting duplicate evidence fails closed", async () => {
 const result = await collectCoreTimelinePages(async cursor => cursor ? { events: [{ id: "a", kind: "refund" }], next_cursor: null } : { events: [{ id: "a", kind: "purchase" }], next_cursor: "next" });
 assert.deepEqual(result, { status: "unavailable", reason: "duplicate_conflict", events: [] });
});
test("page budget returns limited, never complete", async () => {
 const result = await collectCoreTimelinePages(async () => ({ events: [{ id: "a" }], next_cursor: "next" }), 1);
 assert.equal(result.status, "limited");
});
test("malformed event identity is rejected", async () => {
 assert.deepEqual(await collectCoreTimelinePages(async () => ({ events: [{}], next_cursor: null })), { status: "unavailable", reason: "invalid_page", events: [] });
});

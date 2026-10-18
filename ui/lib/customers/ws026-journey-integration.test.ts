import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const repo = readFileSync(fileURLToPath(new URL("./production-repository.ts", import.meta.url)), "utf8");
const ui = readFileSync(fileURLToPath(new URL("../../components/customers/customer-workspace.tsx", import.meta.url)), "utf8");
test("repository selects explicit journey and never uses first array entry", () => {
 assert.match(repo, /selectCustomerJourney\(journeyOptions, requestedJourneyId\)/);
 assert.doesNotMatch(repo, /selectedJourney\s*=\s*journeys\[0\]/);
});
test("UI offers selectable canonical journey choices and loading state", () => {
 assert.match(ui, /aria-label="Select canonical journey"/);
 assert.match(ui, /setSelectedJourneyId\(e\.target\.value \|\| null\)/);
 assert.match(ui, /Loading journey/);
});
test("journey detail uses existing scoped customer API", () => {
 assert.match(repo, /encodeURIComponent\(selectedJourney\.id\)/);
 assert.match(repo, /qs\(scope, \{ limit: 100 \}\)/);
});

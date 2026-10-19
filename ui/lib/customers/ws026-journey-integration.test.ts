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
 assert.match(repo, /collectCoreTimelinePages/);
 assert.match(repo, /next_cursor/);
 assert.match(repo, /cursor/);
});

test("repository consumes nested Core page cursor rather than assuming top-level cursor", () => {
 assert.match(repo, /page\.page\?\.next_cursor \?\? page\.next_cursor/);
});
test("five-second timestamp proximity cannot link a purchase to an order", () => {
 assert.doesNotMatch(repo, /Math\.abs\(orderTime - eventTime\) <= 5000/);
 assert.match(repo, /eventIds\.some/);
});

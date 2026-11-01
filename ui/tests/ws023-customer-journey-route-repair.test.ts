import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const list = readFileSync(new URL("../app/(app)/journeys/page.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/(app)/journeys/[tkid]/page.tsx", import.meta.url), "utf8");
test("journey listing uses existing Customer Explorer", () => {
  assert.match(list, /CustomerWorkspace/);
  assert.doesNotMatch(list, /apiGetJson|\/v1\/journeys/);
});
test("TKID deep links remain present and fail closed without deterministic resolution", () => {
  assert.match(detail, /params: Promise<\{ tkid: string \}>/);
  assert.match(detail, /Canonical Journey identity unresolved/);
  assert.doesNotMatch(detail, /\/v1\/journey\?|\/v1\/customers\/search/);
});
test("no fabricated journey finances or default workspace identity", () => {
  assert.doesNotMatch(list + detail, /grossSales: 0|netRevenue: 0|workspaceId="default"/);
});

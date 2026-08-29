import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const route = () => readFileSync(`${root}/app/v1/integrations/everflow/conversions/sync/route.ts`, "utf8");

test("Everflow conversion sync persists observable run metrics", () => {
  const text = route();
  assert.match(text, /commercePersistenceCount/);
  assert.match(text, /beforeCount/);
  assert.match(text, /afterCount/);
  assert.match(text, /created = Math\.max\(0, afterCount - beforeCount\)/);
  assert.match(text, /pages_completed: input\.pages/);
  assert.match(text, /records_seen: input\.seen/);
  assert.match(text, /records_created: input\.created/);
  assert.match(text, /provider_request_count: input\.pages/);
});

test("Everflow run metrics are scoped to the authenticated organization and connection", () => {
  const text = route();
  assert.match(text, /organization_id=eq\.\$\{encodeURIComponent\(input\.organizationId\)\}/);
  assert.match(text, /connection_id=eq\.\$\{encodeURIComponent\(input\.connectionId\)\}/);
  assert.match(text, /syncRunId: result\.syncRunId/);
});

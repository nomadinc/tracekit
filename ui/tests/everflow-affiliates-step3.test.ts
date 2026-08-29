import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const affiliateSource = () => readFileSync(`${root}/lib/integrations/everflow-affiliates.ts`, "utf8");

test("Everflow affiliate client is bounded, paginated, and read-only", () => {
  const source = affiliateSource();
  assert.match(source, /EVERFLOW_AFFILIATES_PATH = "\/v1\/networks\/affiliates"/);
  assert.match(source, /method: "GET"/);
  assert.match(source, /page_size/);
  assert.match(source, /EVERFLOW_AFFILIATE_MAX_PAGES = 20/);
  assert.match(source, /EVERFLOW_AFFILIATE_TIMEOUT_MS = 10_000/);
  assert.doesNotMatch(source, /method: "DELETE"/);
  assert.doesNotMatch(source, /method: "PUT"/);
});

test("affiliate source identity is network scoped and never globally unique", () => {
  const source = affiliateSource();
  const migration = readFileSync(`${root}/../supabase/migrations/081_everflow_affiliates_v1.sql`, "utf8");
  assert.match(source, /networkAffiliateId/);
  assert.match(source, /providerAccountId: account\.id/);
  assert.match(source, /affiliate\.networkId.*account\.externalId/);
  assert.match(migration, /unique \(connection_id, provider_account_id, network_affiliate_id\)/);
});

test("affiliate normalization excludes internal notes and relationship PII", () => {
  const source = affiliateSource();
  const normalizedBlock = source.slice(source.indexOf("export type EverflowAffiliate"), source.indexOf("export type EverflowAffiliatePage"));
  assert.doesNotMatch(normalizedBlock, /internalNotes|internal_notes/);
  assert.doesNotMatch(normalizedBlock, /email|phone|relationship|users/);
});

test("affiliate persistence is an idempotent source-resource upsert", () => {
  const source = affiliateSource();
  assert.match(source, /everflow_affiliates\?on_conflict=connection_id,provider_account_id,network_affiliate_id/);
  assert.match(source, /resolution=merge-duplicates/);
  assert.match(source, /payload_hash/);
});

test("affiliate migration denies direct browser access", () => {
  const migration = readFileSync(`${root}/../supabase/migrations/081_everflow_affiliates_v1.sql`, "utf8");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.everflow_affiliates from anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.everflow_affiliates to service_role/);
});

test("affiliate endpoints use authenticated application routes", () => {
  const api = readFileSync(`${root}/lib/api.ts`, "utf8");
  const listRoute = readFileSync(`${root}/app/v1/integrations/everflow/affiliates/route.ts`, "utf8");
  const syncRoute = readFileSync(`${root}/app/v1/integrations/everflow/affiliates/sync/route.ts`, "utf8");
  assert.match(api, /affiliates\(\?:\\\/sync\)\?/);
  assert.match(listRoute, /resolveApplicationSession/);
  assert.match(listRoute, /plane\.getConnection/);
  assert.match(syncRoute, /resolveApplicationSession/);
  assert.match(syncRoute, /syncEverflowAffiliates/);
  assert.doesNotMatch(listRoute, /apiKey/);
  assert.doesNotMatch(syncRoute, /body\?\.apiKey/);
});

test("affiliate sync resolves stored credential instead of accepting a secret from the caller", () => {
  const source = affiliateSource();
  assert.match(source, /resolveCredentialForExecution/);
  assert.match(source, /const apiKey = await input\.plane\.resolveCredentialForExecution/);
});

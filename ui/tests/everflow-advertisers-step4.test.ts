import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const advertiserSource = () => readFileSync(`${root}/lib/integrations/everflow-advertisers.ts`, "utf8");

test("Everflow advertiser list uses the documented bounded read-only table search", () => {
  const source = advertiserSource();
  assert.match(source, /EVERFLOW_ADVERTISERS_PATH = "\/v1\/networks\/advertiserstable"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /search_terms: \[\], filters: \{\}/);
  assert.match(source, /page_size/);
  assert.match(source, /EVERFLOW_ADVERTISER_MAX_PAGES = 20/);
  assert.match(source, /EVERFLOW_ADVERTISER_TIMEOUT_MS = 10_000/);
  assert.doesNotMatch(source, /method: "PUT"|method: "DELETE"|\/advertisers\/\$\{/);
});

test("advertiser source identity is network scoped and never globally unique", () => {
  const source = advertiserSource();
  const migration = readFileSync(`${root}/../supabase/migrations/082_everflow_advertisers_v1.sql`, "utf8");
  assert.match(source, /networkAdvertiserId/);
  assert.match(source, /providerAccountId: account\.id/);
  assert.match(source, /advertiser\.networkId.*account\.externalId/);
  assert.match(migration, /unique \(connection_id, provider_account_id, network_advertiser_id\)/);
});

test("advertiser normalization excludes verification tokens, revenue snapshots, and user/billing PII", () => {
  const source = advertiserSource();
  const normalizedBlock = source.slice(source.indexOf("export type EverflowAdvertiser"), source.indexOf("export type EverflowAdvertiserPage"));
  assert.doesNotMatch(normalizedBlock, /verificationToken|verification_token|todayRevenue|today_revenue/);
  assert.doesNotMatch(normalizedBlock, /email|phone|billing|tax_id|internal_notes|relationship|users/);
});

test("advertiser persistence is idempotent and browser access is denied", () => {
  const source = advertiserSource();
  const migration = readFileSync(`${root}/../supabase/migrations/082_everflow_advertisers_v1.sql`, "utf8");
  assert.match(source, /everflow_advertisers\?on_conflict=connection_id,provider_account_id,network_advertiser_id/);
  assert.match(source, /resolution=merge-duplicates/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.everflow_advertisers from anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.everflow_advertisers to service_role/);
});

test("advertiser endpoints are authenticated and use the stored connection credential", () => {
  const api = readFileSync(`${root}/lib/api.ts`, "utf8");
  const listRoute = readFileSync(`${root}/app/v1/integrations/everflow/advertisers/route.ts`, "utf8");
  const syncRoute = readFileSync(`${root}/app/v1/integrations/everflow/advertisers/sync/route.ts`, "utf8");
  const source = advertiserSource();
  assert.match(api, /advertisers/);
  assert.match(listRoute, /resolveApplicationSession/);
  assert.match(listRoute, /plane\.getConnection/);
  assert.match(syncRoute, /resolveApplicationSession/);
  assert.match(syncRoute, /syncEverflowAdvertisers/);
  assert.match(source, /resolveCredentialForExecution/);
  assert.doesNotMatch(syncRoute, /body\?\.apiKey/);
});

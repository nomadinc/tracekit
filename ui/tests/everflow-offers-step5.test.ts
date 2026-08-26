import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = () => readFileSync(`${root}/lib/integrations/everflow-offers.ts`, "utf8");

test("Everflow offer client uses bounded paginated read/search endpoint", () => {
  const text = source();
  assert.match(text, /EVERFLOW_OFFERS_PATH = "\/v1\/networks\/offers\/table"/);
  assert.match(text, /method: "POST"/);
  assert.match(text, /paging: \{ page, page_size: pageSize \}/);
  assert.match(text, /EVERFLOW_OFFER_MAX_PAGES = 20/);
  assert.match(text, /EVERFLOW_OFFER_TIMEOUT_MS = 10_000/);
  assert.doesNotMatch(text, /method: "DELETE"/);
  assert.doesNotMatch(text, /method: "PUT"/);
});

test("offer source identity is connection scoped and advertiser ownership is retained", () => {
  const text = source();
  const migration = readFileSync(`${root}/../supabase/migrations/083_everflow_offers_v1.sql`, "utf8");
  assert.match(text, /networkOfferId/);
  assert.match(text, /networkAdvertiserId/);
  assert.match(text, /providerAccountId: account\.id/);
  assert.match(migration, /unique \(connection_id, provider_account_id, network_offer_id\)/);
  assert.match(migration, /network_advertiser_id/);
});

test("offer normalization excludes internal notes and descriptive HTML", () => {
  const text = source();
  const block = text.slice(text.indexOf("export type EverflowOffer"), text.indexOf("export type EverflowOfferPage"));
  assert.doesNotMatch(block, /internalNotes|internal_notes|htmlDescription|html_description|terms_and_conditions/);
});

test("offer persistence is idempotent and network guarded", () => {
  const text = source();
  assert.match(text, /everflow_offers\?on_conflict=connection_id,provider_account_id,network_offer_id/);
  assert.match(text, /resolution=merge-duplicates/);
  assert.match(text, /offer\.networkId.*account\.externalId/);
  assert.match(text, /payload_hash/);
});

test("offer migration denies direct browser access", () => {
  const migration = readFileSync(`${root}/../supabase/migrations/083_everflow_offers_v1.sql`, "utf8");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.everflow_offers from anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.everflow_offers to service_role/);
});

test("offer routes are authenticated application routes and resolve stored credentials", () => {
  const api = readFileSync(`${root}/lib/api.ts`, "utf8");
  const listRoute = readFileSync(`${root}/app/v1/integrations/everflow/offers/route.ts`, "utf8");
  const syncRoute = readFileSync(`${root}/app/v1/integrations/everflow/offers/sync/route.ts`, "utf8");
  assert.match(api, /affiliates\|advertisers\|offers/);
  assert.match(listRoute, /resolveApplicationSession/);
  assert.match(syncRoute, /resolveApplicationSession/);
  assert.match(syncRoute, /syncEverflowOffers/);
  assert.doesNotMatch(listRoute, /apiKey/);
  assert.doesNotMatch(syncRoute, /body\?\.apiKey/);
  assert.match(source(), /resolveCredentialForExecution/);
});

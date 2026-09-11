import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const client = readFileSync(`${root}/lib/integrations/meta-marketing-client.ts`, "utf8");
const sync = readFileSync(`${root}/lib/integrations/meta-hierarchy-sync.ts`, "utf8");
const route = readFileSync(`${root}/app/v1/integrations/meta/hierarchy/sync/route.ts`, "utf8");

test("Meta hierarchy uses read-only v26 account resources and bearer auth", () => {
  assert.match(client, /campaigns/);
  assert.match(client, /adsets/);
  assert.match(client, /adcreatives/);
  assert.match(client, /ads/);
  assert.match(client, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(client, /access_token/);
  assert.match(client, /META_GRAPH_BASE_URL/);
  assert.doesNotMatch(client, /method:\s*"POST"/);
});

test("Meta hierarchy pagination is cursor-based and bounded instead of silently truncating", () => {
  assert.match(client, /MAX_PAGES = 10/);
  assert.match(client, /url\.searchParams\.set\("after", after\)/);
  assert.match(client, /meta_hierarchy_page_limit_reached/);
  assert.match(client, /stopped before truncating data/);
  assert.doesNotMatch(client, /fetchImpl\(paging\.next/);
});

test("manual hierarchy sync only targets selected provider accounts and never activates schedules", () => {
  assert.match(sync, /selectedForSync/);
  assert.match(sync, /meta_no_selected_accounts/);
  assert.match(sync, /sync_type:\s*"hierarchy"/);
  assert.match(sync, /mode:\s*"discovery"/);
  assert.match(sync, /manual:\s*true/);
  assert.doesNotMatch(sync, /marketing_sync_schedules/);
  assert.match(route, /schedulesActivated:\s*false/);
});

test("hierarchy persistence preserves tenant/account ancestry and provider-native IDs", () => {
  assert.match(sync, /marketing_campaigns/);
  assert.match(sync, /marketing_ad_groups/);
  assert.match(sync, /marketing_creatives/);
  assert.match(sync, /marketing_ads/);
  assert.match(sync, /provider_campaign_id/);
  assert.match(sync, /provider_ad_group_id/);
  assert.match(sync, /provider_creative_id/);
  assert.match(sync, /provider_ad_id/);
  assert.match(sync, /organization_id:\s*orgId/);
  assert.match(sync, /connection_id:\s*input\.account\.connectionId/);
  assert.match(sync, /provider_account_id:\s*input\.account\.id/);
});

test("campaign parents are persisted before ad groups and ads resolve canonical parents", () => {
  assert.match(sync, /\["campaigns", "adsets", "adcreatives", "ads"\]/);
  assert.match(sync, /campaign_parent_missing/);
  assert.match(sync, /ad_parent_missing/);
  assert.match(sync, /creative_id:/);
});

test("each provider page creates a durable cursor checkpoint and raw evidence", () => {
  assert.match(sync, /marketing_sync_checkpoints/);
  assert.match(sync, /checkpoint_kind:\s*"cursor"/);
  assert.match(sync, /cursor_before:/);
  assert.match(sync, /cursor_after:/);
  assert.match(sync, /page_fingerprint:/);
  assert.match(sync, /marketing_evidence_records/);
  assert.match(sync, /payload_hash:/);
  assert.match(sync, /storage_backend:\s*"inline_json"/);
  assert.match(sync, /normalizer_version:\s*NORMALIZER_VERSION/);
});

test("unchanged observations advance freshness and degraded accounts remain retryable", () => {
  assert.match(sync, /last_observed_at:\s*observedAt/);
  assert.match(sync, /status === "active" \|\| row\.status === "degraded"/);
  assert.match(sync, /status:\s*"active"/);
});

test("hierarchy sync decrypts connection-level credentials and never logs or returns them", () => {
  assert.match(sync, /marketing_provider_credentials/);
  assert.match(sync, /decryptCommerceCredential/);
  assert.match(sync, /MARKETING_CREDENTIALS_ENC_KEY/);
  assert.doesNotMatch(route, /accessToken|secret_ciphertext|secret_iv/);
});

test("manual route is same-origin bounded and supports per-account partial isolation", () => {
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /content-length/);
  assert.match(route, /accountIds/);
  assert.match(route, /failed === results\.length \? 502 : failed \? 207 : 200/);
  assert.match(route, /maxDuration = 300/);
});

test("M1-G explicitly excludes Insights and scheduled execution", () => {
  assert.doesNotMatch(client, /\/insights\b|marketing_performance_daily|marketing_costs/);
  assert.doesNotMatch(sync, /marketing_performance_daily|marketing_costs|marketing_sync_schedules/);
  assert.doesNotMatch(route, /\/cron\b|scheduler\/run|marketing_sync_schedules|\/insights\b/);
  assert.match(route, /schedulesActivated:\s*false/);
});

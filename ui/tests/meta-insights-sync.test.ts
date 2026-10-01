import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const client = readFileSync(`${root}/lib/integrations/meta-insights-client.ts`, "utf8");
const sync = readFileSync(`${root}/lib/integrations/meta-insights-sync.ts`, "utf8");
const route = readFileSync(`${root}/app/v1/integrations/meta/insights/sync/route.ts`, "utf8");

test("Meta Insights requests ad/day reporting with account attribution semantics", () => {
  assert.match(client, /\/insights/);
  assert.match(client, /url\.searchParams\.set\("level", "ad"\)/);
  assert.match(client, /url\.searchParams\.set\("time_increment", "1"\)/);
  assert.match(client, /use_account_attribution_setting", "true"/);
  assert.match(client, /actions/);
  assert.match(client, /action_values/);
  assert.match(client, /Authorization:\s*`Bearer \$\{input\.accessToken\}`/);
  assert.doesNotMatch(client, /access_token/);
  assert.doesNotMatch(client, /method:\s*"POST"/);
});

test("manual Insights requests are date bounded and pagination fails before truncation", () => {
  assert.match(client, /META_INSIGHTS_MAX_RANGE_DAYS = 31/);
  assert.match(client, /meta_insights_range_too_large/);
  assert.match(client, /MAX_PAGES = 20/);
  assert.match(client, /meta_insights_page_limit_reached/);
  assert.match(client, /stopped before truncating data/);
  assert.match(client, /url\.searchParams\.set\("after", input\.after\)/);
});

test("Insights sync only targets selected accounts and requires canonical hierarchy parents", () => {
  assert.match(sync, /selectedForSync/);
  assert.match(sync, /meta_no_selected_accounts/);
  assert.match(sync, /marketing_ads/);
  assert.match(sync, /provider_ad_id/);
  assert.match(sync, /campaign_id/);
  assert.match(sync, /ad_group_id/);
  assert.match(sync, /ad_id:\s*canonical\.id/);
});

test("daily performance preserves Meta actions without pretending they are one canonical purchase metric", () => {
  assert.match(sync, /marketing_performance_daily/);
  assert.match(sync, /entity_level:\s*"ad"/);
  assert.match(sync, /provider_actions:\s*safeArray\(row\.actions\)/);
  assert.match(sync, /provider_action_values:\s*safeArray\(row\.action_values\)/);
  assert.match(sync, /provider_reported_conversions:\s*null/);
  assert.match(sync, /provider_reported_conversion_value:\s*null/);
  assert.match(sync, /attribution_setting:\s*ATTRIBUTION_SETTING/);
  assert.match(sync, /reporting_key:\s*REPORTING_KEY/);
});

test("overlapping re-fetches update the current fact and append immutable restatement evidence", () => {
  assert.match(sync, /prior\.payload_hash/);
  assert.match(sync, /last_observed_at:\s*observedAt/);
  assert.match(sync, /marketing_evidence_records/);
  assert.match(sync, /source_object_type:\s*"insights_ad_daily"/);
  assert.match(sync, /payload_hash:\s*payloadHash/);
  assert.match(sync, /resolution=ignore-duplicates/);
  assert.match(sync, /source_report_date:\s*input\.reportDate/);
});

test("Meta spend projects into TraceKit marketing costs without duplicate economic facts", () => {
  assert.match(sync, /marketing_costs/);
  assert.match(sync, /cost_type:\s*"ad_spend"/);
  assert.match(sync, /source_performance_fact_id:\s*factId/);
  assert.match(sync, /source_type:\s*"provider_reported"/);
  assert.match(sync, /COST_CALCULATION_VERSION = "meta-insights-spend-v1"/);
  assert.match(sync, /last_calculated_at:\s*input\.observedAt/);
  assert.match(sync, /amount:\s*input\.spend/);
});

test("each Insights page creates a cursor/date checkpoint and manual sync run", () => {
  assert.match(sync, /sync_type:\s*"insights_daily"/);
  assert.match(sync, /mode:\s*"incremental"/);
  assert.match(sync, /manual:\s*true/);
  assert.match(sync, /marketing_sync_checkpoints/);
  assert.match(sync, /resource:\s*"insights_daily"/);
  assert.match(sync, /checkpoint_kind:\s*"cursor"/);
  assert.match(sync, /report_date_start:\s*input\.since/);
  assert.match(sync, /report_date_end:\s*input\.until/);
});

test("manual Insights route is same-origin, explicit-range, and never activates scheduling", () => {
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /content-length/);
  assert.match(route, /since/);
  assert.match(route, /until/);
  assert.match(route, /accountIds/);
  assert.match(route, /schedulesActivated:\s*false/);
  assert.match(route, /maxDuration = 300/);
  assert.doesNotMatch(route, /\/cron\b|scheduler\/run|marketing_sync_schedules/);
});

test("M1-H remains read-only toward Meta and does not mutate ads campaigns budgets or targeting", () => {
  assert.doesNotMatch(client, /method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/);
  assert.doesNotMatch(sync, /ads_management|campaign.*POST|budget.*POST|targeting.*POST/i);
});

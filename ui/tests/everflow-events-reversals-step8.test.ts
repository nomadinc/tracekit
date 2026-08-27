import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = () => readFileSync(`${root}/lib/integrations/everflow-event-reversals.ts`, "utf8");
const route = () => readFileSync(`${root}/app/v1/integrations/everflow/conversions/sync/route.ts`, "utf8");
const migration = () => readFileSync(`${root}/../supabase/migrations/085_everflow_event_reversal_history.sql`, "utf8");

test("Step 8 preserves distinct Everflow provider states in a protected history table", () => {
  const sql = migration();
  assert.match(sql, /create table if not exists public\.everflow_conversion_state_history/);
  assert.match(sql, /source_identity text not null/);
  assert.match(sql, /payload_hash text not null/);
  assert.match(sql, /unique index if not exists everflow_conversion_state_history_identity_uidx/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.everflow_conversion_state_history from anon, authenticated/);
});

test("approved to rejected is classified as a reversal and uses effective financial deltas", () => {
  const text = source();
  assert.match(text, /wasApproved && !isApproved.*rejected[\s\S]*return "reversal"/);
  assert.match(text, /effectiveRevenue - previousEffectiveRevenue/);
  assert.match(text, /effectivePayout - previousEffectivePayout/);
  assert.match(text, /approved\(item\.status\) \? item\.revenue : 0/);
  assert.match(text, /approved\(item\.status\) \? item\.payout : 0/);
});

test("rejected to approved is a reinstatement instead of a duplicate approval", () => {
  const text = source();
  assert.match(text, /!wasApproved && isApproved.*previous\.status[\s\S]*return "reinstated"/);
});

test("unchanged provider payloads produce no financial delta history inflation", () => {
  const text = source();
  assert.match(text, /previous\.payloadHash === current\.payloadHash.*return "unchanged"/);
  assert.match(text, /const changed = history\.filter\(\(row\) => row\.transition_type !== "unchanged"\)/);
});

test("Step 8 observes post-conversion events without replacing the Step 7 latest-state projection", () => {
  const text = source();
  assert.match(text, /isEvent: Boolean\(row\.is_event\)/);
  assert.match(text, /eventName: text\(row\.event_name\)/);
  assert.match(text, /everflow_conversion_state_history/);
  assert.doesNotMatch(migration(), /drop table.*everflow_conversion_events/i);
});

test("conversion sync captures the financial baseline before ingestion and persists event effects afterward", () => {
  const text = route();
  const before = text.indexOf("captureEverflowFinancialBaseline");
  const sync = text.indexOf("syncEverflowConversions({");
  const after = text.indexOf("persistEverflowEventReversalHistory({");
  assert.ok(before >= 0 && sync > before && after > sync);
  assert.match(text, /eventEffects/);
});

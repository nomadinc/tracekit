import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../supabase/migrations/20260902030000_next29_incremental_scheduler_foundation.sql", import.meta.url);

async function sql() { return readFile(migration, "utf8"); }

test("29Next schedule foundation reuses provider-neutral tenant-scoped commerce schedules", async () => {
  const text=await sql();
  assert.match(text,/alter table public\.commerce_sync_schedules/i);
  assert.match(text,/c\.provider='next29'/i);
  assert.match(text,/'next29_orders'/i); assert.match(text,/'next29_subscriptions'/i); assert.match(text,/'next29_disputes'/i);
  assert.doesNotMatch(text,/create table\s+(?:if not exists\s+)?public\.next29_/i);
});

test("29Next schedules are created disabled and require shared permission plus lease ownership", async () => {
  const text=await sql();
  assert.match(text,/false,\s*'disabled'/i);
  assert.match(text,/commerce_schedule_permitted\(v_schedule\.organization_id,v_schedule\.connection_id\)/i);
  assert.match(text,/lease_owner=p_lease_owner/i);
  assert.match(text,/lease_expires_at=p_now\+make_interval/i);
  assert.match(text,/s\.lease_owner=p_lease_owner/i);
});

test("29Next schedule checkpoint advances only on complete and retains incomplete window cursor", async () => {
  const text=await sql();
  assert.match(text,/when p_outcome='completed' then p_successful_through_at/i);
  assert.match(text,/when p_outcome='incomplete' then p_active_window_start_at/i);
  assert.match(text,/when p_outcome='incomplete' then p_resume_cursor/i);
  assert.match(text,/when p_outcome='failed' then p_now\+interval '5 minutes'/i);
  assert.match(text,/when p_outcome='incomplete' then p_now\+interval '1 minute'/i);
});

test("29Next schedule foundation remains service-role only and does not activate external execution", async () => {
  const text=await sql();
  assert.match(text,/revoke all on function public\.ensure_next29_resource_schedules[\s\S]*from public,anon,authenticated/i);
  assert.match(text,/grant execute on function public\.claim_next29_resource_schedule[\s\S]*to service_role/i);
  assert.doesNotMatch(text,/cron\.schedule\s*\(/i);
  assert.doesNotMatch(text,/net\.http|http_post\s*\(/i);
  assert.doesNotMatch(text,/create\s+trigger/i);
});

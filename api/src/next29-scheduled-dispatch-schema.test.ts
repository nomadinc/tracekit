import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration=new URL("../../supabase/migrations/20260902043000_next29_scheduler_dispatch_runtime.sql",import.meta.url);
async function sql(){return readFile(migration,"utf8")}

test("29Next dispatch discovery selects only enabled due permitted unleased schedules",async()=>{const text=await sql();assert.match(text,/s\.enabled/i);assert.match(text,/s\.activation_state='enabled'/i);assert.match(text,/s\.next_overlap_at<=p_now/i);assert.match(text,/commerce_schedule_permitted/i);assert.match(text,/lease_expires_at<p_now/i)});
test("29Next dispatch heartbeat is owner checked and renews only live leases",async()=>{const text=await sql();assert.match(text,/heartbeat_next29_resource_schedule/i);assert.match(text,/s\.lease_owner=p_lease_owner/i);assert.match(text,/s\.lease_expires_at>=p_now/i);assert.match(text,/lease_expires_at=p_now\+make_interval/i)});
test("29Next dispatch control remains service role only",async()=>{const text=await sql();assert.match(text,/revoke all on function public\.list_due_next29_resource_schedules[\s\S]*from public,anon,authenticated/i);assert.match(text,/grant execute on function public\.heartbeat_next29_resource_schedule[\s\S]*to service_role/i)});
test("29Next dispatch migration does not activate timer webhook or provider writes",async()=>{const text=await sql();assert.doesNotMatch(text,/cron\.schedule\s*\(/i);assert.doesNotMatch(text,/net\.http|http_post\s*\(/i);assert.doesNotMatch(text,/create\s+trigger/i);assert.doesNotMatch(text,/insert\s+into\s+public\.commerce_sync_schedules/i)});

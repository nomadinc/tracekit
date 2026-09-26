import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleSyncRun,
  completeGoogleSyncWindow,
  finishGoogleSyncRun,
  ensureGoogleSyncScheduleDisabled,
  type GoogleSyncControlTransport,
} from "../lib/integrations/google-ads-sync-control";

function memory(){
 const rows:Record<string,any[]>={marketing_sync_runs:[],marketing_sync_checkpoints:[],marketing_sync_schedules:[]};let seq=0;
 const transport:GoogleSyncControlTransport=async(path,init={})=>{
  const method=init.method||"GET",table=path.split("?")[0],body=init.body?JSON.parse(String(init.body)):null;
  if(method==="POST"){const row={id:`${table}-${++seq}`,...body};rows[table].push(row);return[row];}
  const filters=Object.fromEntries(Array.from(path.matchAll(/(?:\?|&)([a-z_]+)=eq\.([^&]+)/g)).map(m=>[m[1],decodeURIComponent(m[2])]));
  const found=(rows[table]||[]).filter(r=>Object.entries(filters).every(([k,v])=>String(r[k])===v));
  if(method==="PATCH"){Object.assign(found[0],body);return found.slice(0,1);} return found;
 };return{transport,rows};
}

test("one durable run is scoped to one Google client account",async()=>{
 const m=memory();const run=await createGoogleSyncRun({organizationId:"org",connectionId:"conn",providerAccountId:"pa",requestedByUserId:"user",mode:"incremental",transport:m.transport,now:"2026-09-26T22:00:00Z"});
 assert.equal(run.provider_account_id,"pa");assert.equal(run.sync_type,"google_ads_daily");assert.equal(run.status,"running");
});

test("completed date window writes account-scoped checkpoint and counters",async()=>{
 const m=memory();const run=await createGoogleSyncRun({organizationId:"org",connectionId:"conn",providerAccountId:"pa",requestedByUserId:"user",mode:"historical_backfill",transport:m.transport,now:"2026-09-26T22:00:00Z"});
 await completeGoogleSyncWindow({organizationId:"org",connectionId:"conn",providerAccountId:"pa",runId:run.id,since:"2026-09-01",until:"2026-09-03",seen:12,persisted:12,failed:0,requestIds:["r1","r2"],transport:m.transport,now:"2026-09-26T22:01:00Z"});
 const cp=m.rows.marketing_sync_checkpoints[0];assert.equal(cp.report_date_start,"2026-09-01");assert.equal(cp.report_date_end,"2026-09-03");assert.deepEqual(cp.metadata.google.requestIds,["r1","r2"]);
});

test("finishing one account run does not mutate sibling run",async()=>{
 const m=memory();const a=await createGoogleSyncRun({organizationId:"org",connectionId:"conn",providerAccountId:"a",requestedByUserId:"u",mode:"incremental",transport:m.transport,now:"2026-09-26T22:00:00Z"});const b=await createGoogleSyncRun({organizationId:"org",connectionId:"conn",providerAccountId:"b",requestedByUserId:"u",mode:"incremental",transport:m.transport,now:"2026-09-26T22:00:00Z"});
 await finishGoogleSyncRun({organizationId:"org",runId:a.id,status:"failed",seen:3,created:1,updated:0,unchanged:0,failed:2,errorCode:"provider_failure",transport:m.transport,now:"2026-09-26T22:02:00Z"});
 assert.equal(m.rows.marketing_sync_runs.find(x=>x.id===a.id).status,"failed");assert.equal(m.rows.marketing_sync_runs.find(x=>x.id===b.id).status,"running");
});

test("schedule bootstrap is disabled by default and preserves overlap settings",async()=>{
 const m=memory();const row=await ensureGoogleSyncScheduleDisabled({organizationId:"org",connectionId:"conn",providerAccountId:"pa",overlapDays:3,transport:m.transport,now:"2026-09-26T22:00:00Z"});
 assert.equal(row.enabled,false);assert.equal(row.activation_state,"disabled");assert.equal(row.overlap_days,3);assert.equal(row.resource,"ad_daily");
});

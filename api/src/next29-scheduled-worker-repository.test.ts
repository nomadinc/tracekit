import assert from "node:assert/strict";
import test from "node:test";
import { createNext29ScheduledWorkerRepository, runtimeResourceFromSchedule } from "./connectors/next29/scheduled-worker-repository.ts";

test("29Next scheduled repository maps provider schedule rows to tenant-scoped runtime targets",async()=>{
  let due:any=null;
  const repo=createNext29ScheduledWorkerRepository({async ensureNext29Schedules(){return 3},async listDueNext29Schedules(input){due=input;return[{id:"s",organization_id:"org",connection_id:"conn",provider_account_id:"acct",resource:"next29_subscriptions"}]}});
  assert.equal(await repo.ensureSchedules({connectionId:null}),3);
  const rows=await repo.listDue({now:"2026-09-01T20:00:00Z",limit:25});
  assert.deepEqual(due,{now:"2026-09-01T20:00:00Z",limit:25});
  assert.deepEqual(rows,[{scheduleId:"s",organizationId:"org",connectionId:"conn",providerAccountId:"acct",resource:"subscriptions"}]);
});

test("29Next scheduled repository rejects non-29Next schedule resources",()=>{
  assert.equal(runtimeResourceFromSchedule("next29_orders"),"orders");
  assert.equal(runtimeResourceFromSchedule("next29_disputes"),"disputes");
  assert.throws(()=>runtimeResourceFromSchedule("everflow_conversions"),/Unsupported 29Next due schedule resource/);
});

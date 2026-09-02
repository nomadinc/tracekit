import assert from "node:assert/strict";
import test from "node:test";
import { createNext29IncrementalControl, providerScheduleResource } from "./connectors/next29/schedule-repository.ts";

const scope={organizationId:"org",connectionId:"conn",providerAccountId:"acct"};

test("29Next schedule adapter maps runtime resources to provider schedule identities and preserves checkpoint state", async () => {
  let claim:any=null;
  const control=createNext29IncrementalControl({
    async claimSchedule(input){claim=input;return{id:"s-1",resource:"next29_orders",enabled:true,successful_through_at:"2026-08-31T00:00:00Z",active_window_start_at:"2026-08-31T00:00:00Z",active_window_end_at:"2026-09-01T00:00:00Z",resume_cursor:"abc"}},
    async heartbeatSchedule(){return true},async finishSchedule(){},async failSchedule(){}
  });
  const state=await control.claim({...scope,resource:"orders",now:"2026-09-01T12:00:00Z",leaseOwner:"worker",leaseSeconds:300});
  assert.equal(claim.resource,"next29_orders"); assert.equal(state.claimed,true); assert.equal(state.scheduleId,"s-1"); assert.equal(state.resumeCursor,"abc");
  assert.equal(providerScheduleResource("subscriptions"),"next29_subscriptions"); assert.equal(providerScheduleResource("disputes"),"next29_disputes");
});

test("29Next schedule adapter maps heartbeat completion and failure without inventing checkpoint advancement", async () => {
  let heartbeat:any=null; let finish:any=null; let fail:any=null;
  const control=createNext29IncrementalControl({async claimSchedule(){return null},async heartbeatSchedule(input){heartbeat=input;return true},async finishSchedule(input){finish=input},async failSchedule(input){fail=input}});
  assert.equal(await control.heartbeat({...scope,scheduleId:"s",resource:"orders",leaseOwner:"worker",now:"2026-09-01T12:00:00Z",leaseSeconds:300}),true);
  assert.equal(heartbeat.resource,"next29_orders"); assert.equal(heartbeat.scheduleId,"s");
  await control.finish({...scope,scheduleId:"s",resource:"subscriptions",leaseOwner:"worker",now:"2026-09-01T12:00:00Z",outcome:"incomplete",successfulThrough:"2026-08-30T00:00:00Z",activeWindowStart:"2026-08-29T00:00:00Z",activeWindowEnd:"2026-09-01T12:00:00Z",resumeCursor:"next"});
  assert.equal(finish.resource,"next29_subscriptions"); assert.equal(finish.outcome,"incomplete"); assert.equal(finish.errorCode,null);
  await control.fail({...scope,scheduleId:"s",resource:"disputes",leaseOwner:"worker",now:"2026-09-01T12:00:00Z",errorCode:"Error"});
  assert.equal(fail.resource,"next29_disputes"); assert.equal(fail.outcome,"failed"); assert.equal(fail.successfulThrough,null); assert.equal(fail.errorCode,"Error");
});

import assert from "node:assert/strict";
import test from "node:test";
import { activeFailedCheckpointCount, connectionHealth } from "../lib/commerce/connection-health";
import type { ConnectionExperience, SafeSyncRun } from "../lib/commerce/integration-experience";

const success = {resource:"everflow_conversions",status:"completed",recordsFailed:0,completedAt:"2026-10-11T23:35:30Z"} as SafeSyncRun;
const freshness = {resource:"everflow_conversions",status:"current",last_successful_at:"2026-10-11T23:35:36Z"};
const failed = {state:"failed",resource:"everflow_conversions",created_at:"2026-10-11T21:35:00Z"};

test("a later full current conversion window recovers historical checkpoint health without erasing history",()=>{
  const checkpoints = [failed];
  assert.equal(activeFailedCheckpointCount(checkpoints,freshness,[success]),0);
  assert.equal(checkpoints[0].state,"failed");
  const connection = {status:"connected",credential:{status:"active"},syncRuns:[success],freshness:{status:"current"},diagnostics:{failedCheckpoints:1,activeFailedCheckpoints:0,stalled:false,latestRequestStatus:null}} as ConnectionExperience;
  assert.equal(connectionHealth(connection).state,"healthy");
  assert.equal(connectionHealth({...connection,diagnostics:{...connection.diagnostics,activeFailedCheckpoints:1}}).state,"degraded");
});

test("partial, stale, failed or unproven recovery never clears active checkpoint failures",()=>{
  for (const state of [undefined,{...freshness,status:"stale"},{...freshness,status:"unknown"},{...freshness,last_successful_at:null},{...freshness,last_successful_at:"2026-10-11T21:30:00Z"}])
    assert.equal(activeFailedCheckpointCount([failed],state,[success]),1);
  assert.equal(activeFailedCheckpointCount([failed],freshness,[{...success,status:"failed"},success]),1);
  assert.equal(activeFailedCheckpointCount([failed],freshness,[{...success,status:"completed_with_warnings"}]),1);
  assert.equal(activeFailedCheckpointCount([failed],freshness,[{...success,recordsFailed:1}]),1);
  assert.equal(activeFailedCheckpointCount([failed],freshness,[{...success,completedAt:null}]),1);
  assert.equal(activeFailedCheckpointCount([failed],freshness,[]),1);
});

test("different resources and failures after the full-window boundary remain degraded",()=>{
  assert.equal(activeFailedCheckpointCount([failed,{...failed,resource:"everflow_clicks"}],freshness,[success]),1);
  assert.equal(activeFailedCheckpointCount([{...failed,created_at:"2026-10-11T23:36:00Z"}],freshness,[success]),1);
  assert.equal(activeFailedCheckpointCount([{...failed,created_at:null}],freshness,[success]),1);
  assert.equal(activeFailedCheckpointCount([failed],{...freshness,resource:"transactions"},[success]),1);
});

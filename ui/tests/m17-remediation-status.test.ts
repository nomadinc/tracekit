import assert from"node:assert/strict";import test from"node:test";import{REMEDIATION_STATES,remediationNeedsAction}from"../lib/mcp/m17-remediation-status";
test("M17 remediation vocabulary is closed",()=>{assert.deepEqual(REMEDIATION_STATES,["healthy","eligible","blocked"]);});
test("M17 only eligible state requires action",()=>{assert.equal(remediationNeedsAction("healthy"),false);assert.equal(remediationNeedsAction("blocked"),false);assert.equal(remediationNeedsAction("eligible"),true);});

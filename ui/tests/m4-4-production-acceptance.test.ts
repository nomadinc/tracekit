import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateProductionV1Acceptance } from "../lib/mcp/production-v1-acceptance";

const evidence = JSON.parse(readFileSync(new URL("../../docs/workstreams/evidence/WS-019_M4_4_PRODUCTION_ACCEPTANCE.json", import.meta.url), "utf8"));

test("M4.4 production evidence closes notification contract without overclaiming Production V1", () => {
  const result = evaluateProductionV1Acceptance(evidence);
  assert.equal(evidence.releaseRequirements.notification_contract.status, "pass");
  assert.equal(evidence.phaseB.finalActiveGovernedNotifications, 0);
  assert.equal(evidence.phaseB.retainedDismissedGovernedNotifications, 1);
  assert.equal(evidence.phaseB.presentationRows, 2);
  assert.equal(evidence.phaseB.providerRequests, 0);
  assert.equal(result.controlledAction.certifiable, true);
  assert.equal(result.productionV1Ready, false);
  assert.ok(result.missingReleaseRequirements.includes("operational_health"));
});

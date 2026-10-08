import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateProductionV1Acceptance } from "../lib/mcp/production-v1-acceptance";

const evidence = JSON.parse(readFileSync(new URL("../../docs/workstreams/evidence/WS-019_M5_POLICY_NEGATIVE_PRODUCTION_ACCEPTANCE.json", import.meta.url), "utf8"));

test("M5 production policy negatives retain all fourteen correlated zero-delta cases", () => {
  assert.equal(evidence.negativeCases.length, 14);
  assert.deepEqual(evidence.negativeCases.map((row: { id: string }) => row.id), ["N01","N02","N03","N04","N05","N06","N07","N08","N09","N10","N11-A","N11-B","N12-A","N12-B"]);
  for (const row of evidence.negativeCases) {
    assert.equal(row.passed, true, row.id);
    assert.match(row.eventId, /^[0-9a-f-]{36}$/i, `${row.id} event`);
    assert.match(row.correlationId, /^[0-9a-f-]{36}$/i, `${row.id} correlation`);
    assert.ok(row.response.length > 0, `${row.id} response`);
  }
  assert.equal(evidence.finalDurableState.attributableBusinessDelta, 0);
  assert.equal(evidence.restoration.providerRequests, 0);
  assert.equal(evidence.restoration.credentialAccesses, 0);
});

test("M5 restoration is exact and does not overclaim Production V1", () => {
  assert.deepEqual(evidence.deployments.inventoryTransition, [26, 23, 26]);
  assert.equal(evidence.deployments.finalActionFlag, "enabled");
  assert.equal(evidence.restoration.toolCount, 26);
  assert.equal(evidence.restoration.restoredTools.length, 3);
  assert.equal(evidence.restoration.commasMutationTools, 0);
  const result = evaluateProductionV1Acceptance(evidence);
  assert.equal(result.controlledAction.certifiable, true);
  assert.equal(result.productionV1Ready, false);
  assert.deepEqual(result.missingReleaseRequirements, []);
  assert.deepEqual(result.blockedReleaseRequirements, ["regression_gates"]);
});

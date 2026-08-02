import assert from "node:assert/strict";
import test from "node:test";
import { MockMissionControlRepository } from "../lib/mission-control/mock-repository";

test("mock Mission Control repository returns the approved executive experience", async () => {
  const repository = new MockMissionControlRepository();
  const snapshot = await repository.getMissionControl();
  assert.equal(snapshot.businessHealth.label, "Healthy");
  assert.equal(snapshot.trends["7 Days"].length, 7);
  assert.deepEqual(Object.keys(snapshot.trends), ["7 Days", "14 Days", "30 Days", "90 Days", "Year"]);
  assert.equal(snapshot.businesses.length, 4);
  assert.equal(snapshot.attention.length, 5);
  assert.equal(snapshot.winners.length, 6);
  assert.ok(snapshot.attention.every(item => item.question && item.explanation && item.evidence.length && item.destination));
});

test("mock Mission Control repository does not share mutable snapshots", async () => {
  const repository = new MockMissionControlRepository();
  const first = await repository.getMissionControl();
  first.businessHealth.label = "Changed";
  const second = await repository.getMissionControl();
  assert.equal(second.businessHealth.label, "Healthy");
});

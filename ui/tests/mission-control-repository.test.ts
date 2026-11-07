import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MockMissionControlRepository, MissionControlDataUnavailableError, scopeMissionControlSnapshot } from "../lib/mission-control/mock-repository";

test("unobserved Mission Control has no fabricated health, financial totals or trends", async () => {
  const repository = new MockMissionControlRepository();
  await assert.rejects(repository.getMissionControl(), MissionControlDataUnavailableError);
  await assert.rejects(repository.getMissionControl(), /No observed reporting snapshot/);
});
test("Mission Control scope still rejects unauthenticated input before exposing a snapshot", () => {
  assert.equal(scopeMissionControlSnapshot({} as never, { authenticated: false } as never), null);
});
test("Mission Control renders explicit unavailable state and preserves the persistent real-data path", () => {
  const source = readFileSync(new URL("../components/mission-control/authenticated-mission-control.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!snapshot\) return.*role="status".*Mission Control data unavailable/);
  assert.match(source, /readMissionControlPortfolio\(resolution.session\)/);
  assert.match(source, /effectivePermissions.includes\("financials.view"\)/);
});

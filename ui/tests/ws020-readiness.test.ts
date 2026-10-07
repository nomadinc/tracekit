import assert from "node:assert/strict";
import test from "node:test";
import { authorizedMissionControlContext } from "../lib/mission-control/persistent-context";
import { readConversionMetric } from "../lib/mission-control/conversion-metric";
import { readMissionControlPortfolio } from "../lib/mission-control/portfolio-reader";
import { connectionHealth } from "../lib/commerce/connection-health";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";
import type { ConnectionExperience, SafeSyncRun } from "../lib/commerce/integration-experience";

const organization = { id: "tenant-a", accountId: "client-a", name: "Client A", mark: "CA" };
const context = { id: "persistent-context", organizationId: organization.id, name: "Client A", mark: "CA" };
function session(): TraceKitSessionContext {
  return { user: { id: "user-a", status: "active" }, membership: { status: "active" },
    effectivePermissions: ["organizations.view"], activeOrganization: organization,
    availableOrganizations: [organization], accessibleBusinessContexts: [context], activeBusinessContextId: context.id,
  } as TraceKitSessionContext;
}
test("Mission Control accepts an authorized persistent context without a mock identifier", () => {
  assert.deepEqual(authorizedMissionControlContext(session()), { organization, context });
});
test("Mission Control fails closed for foreign or inaccessible contexts and organizations", () => {
  assert.equal(authorizedMissionControlContext({ ...session(), accessibleBusinessContexts: [{ ...context, organizationId: "tenant-b" }] }), null);
  assert.equal(authorizedMissionControlContext({ ...session(), activeBusinessContextId: "other" }), null);
  assert.throws(() => authorizedMissionControlContext({ ...session(), availableOrganizations: [] }));
  assert.throws(() => authorizedMissionControlContext({ ...session(), effectivePermissions: [] }));
  assert.throws(() => authorizedMissionControlContext({ ...session(), membership: { ...session().membership, status: "suspended" } }));
});
test("conversion failures remain unavailable while genuine zero and positive counts survive", async () => {
  const failed = await readConversionMetric(async () => { throw new Error("database outage"); });
  assert.equal(failed.value, null);
  assert.equal(failed.state, "unavailable");
  for (const count of [0, 7]) {
    const result = await readConversionMetric(async () => count);
    assert.equal(result.value, count);
    assert.equal(result.state, "partial");
  }
});
const run = (resource: string, status: string): SafeSyncRun => ({ resource, status, recordsFailed: 0 } as SafeSyncRun);
const connection = (runs: SafeSyncRun[]): ConnectionExperience => ({ status: "connected", credential: { status: "active" },
  syncRuns: runs, freshness: { status: "unknown" }, diagnostics: { failedCheckpoints: 0, stalled: false, latestRequestStatus: null },
} as ConnectionExperience);
test("healthy credentials cannot conceal a failed sync, including behind unrelated success", () => {
  assert.equal(connectionHealth(connection([run("orders", "completed"), run("conversions", "failed")])).state, "degraded");
  assert.match(connectionHealth(connection([run("conversions", "failed")])).detail, /conversions: failed/);
});
test("only a later success for the same resource recovers its older failed run", () => {
  assert.equal(connectionHealth(connection([run("orders", "completed"), run("orders", "failed")])).state, "healthy");
  assert.equal(connectionHealth(connection([run("orders", "running"), run("orders", "failed")])).state, "degraded");
  assert.equal(connectionHealth(connection([run("orders", "completed_with_warnings")])).state, "degraded");
  assert.equal(connectionHealth(connection([])).state, "unknown");
});

test("persistent portfolio scopes every query and renders canonical order revenue when conversions fail", async () => {
  const paths: string[] = [];
  const authorized = { ...session(), effectivePermissions: ["financials.view" as const] };
  const portfolio = await readMissionControlPortfolio(authorized, 30, {
    request: async path => { paths.push(path); return path.startsWith("platform_orders?") ? [{ gross_amount: "25", currency: "USD" }] : []; },
    count: async path => { paths.push(path); throw new Error("conversion query failed"); },
  });
  assert.equal(portfolio?.metrics.revenue.value, 25);
  assert.equal(portfolio?.metrics.conversions.value, null);
  assert.equal(portfolio?.metrics.conversions.state, "unavailable");
  assert.ok(paths.every(path => path.includes("organization_id=eq.tenant-a")));
  assert.ok(paths.find(path => path.startsWith("platform_orders?"))?.includes("select=gross_amount,currency,status"));
});
test("portfolio authorization rejects missing financial permission and foreign tenant before persistence", async () => {
  let reads = 0;
  const persistence = { request: async () => { reads++; return []; }, count: async () => { reads++; return 0; } };
  await assert.rejects(readMissionControlPortfolio(session(), 30, persistence));
  await assert.rejects(readMissionControlPortfolio({ ...session(), effectivePermissions: ["financials.view"], availableOrganizations: [] }, 30, persistence));
  assert.equal(reads, 0);
});

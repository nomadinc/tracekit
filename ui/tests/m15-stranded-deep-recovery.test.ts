import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/actions/commas/m15-stranded-deep-recovery/route.ts",import.meta.url),"utf8");

test("M15 stranded recovery is pinned to the exact canonical run and scope",()=>{
  assert.match(worker,/M15_STRANDED_DEEP_RUN_ID="4d0c129a-da4d-47d1-b105-f1be961ca6d6"/);
  assert.match(worker,/M15_STRANDED_DEEP_ORGANIZATION_ID="c98d44be-5f7f-41a2-a9d3-ae67a811a872"/);
  assert.match(worker,/M15_STRANDED_DEEP_CONNECTION_ID="8030cf89-88f3-433f-99ec-c2083c4e5698"/);
  assert.match(worker,/M15_STRANDED_DEEP_PROVIDER_ACCOUNT_ID="dd3506d5-3417-4086-8623-9f8ec6b81694"/);
});

test("recovery requires expired lease, exact lifetime counters, page 191 boundary, and persisted Evidence",()=>{
  assert.match(worker,/Date\.parse\(String\(run\.lease_expires_at\)\)>=Date\.now\(\)/);
  assert.match(worker,/Number\(run\.pages_completed\)!==190/);
  assert.match(worker,/Number\(run\.provider_request_count\)!==190/);
  assert.match(worker,/running\.length!==1\|\|Number\(running\[0\]\.page\)!==191/);
  assert.match(worker,/continuous:page:191:per_page:100/);
});

test("recovery reuses original run and bounds lifetime provider requests at 191 without automatic continuation",()=>{
  assert.match(worker,/requestKey:M15_STRANDED_DEEP_REQUEST_KEY/);
  assert.match(worker,/maxProviderRequests:191/);
  assert.match(worker,/result\.providerRequests!==190/);
  assert.match(worker,/result\.pagesScanned!==1/);
  assert.match(worker,/result\.evidenceReuses!==1/);
  assert.match(worker,/bounded_deep_reconciliation_proof/);
});

test("schedule is paused for operator review before recovery and action requires Accufy permission plus exact confirmation",()=>{
  assert.match(worker,/activation_state:"paused"/);
  assert.match(worker,/m15_stranded_deep_recovery_review/);
  assert.match(route,/actions\.execute/);
  assert.match(route,/recover-m15-stranded-deep-evidence/);
  assert.match(route,/activeOrganization\?\.id!==M15_STRANDED_DEEP_ORGANIZATION_ID/);
});

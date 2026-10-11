import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { commercePersistenceRequest, CommercePersistenceError } from "../lib/commerce/supabase-control-repository";
import { everflowSchedulerHealth } from "../lib/integrations/everflow-scheduler-health";
import { syncEverflowScheduledConversionPage } from "../lib/integrations/everflow-scheduled-conversion-page";

test("persistence errors retain SQLSTATE and resource without leaking filters, raw errors or credentials", async () => {
  const original = globalThis.fetch;
  const originalURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic";
  globalThis.fetch = async () => Response.json({code:"55P03",message:"private@example.invalid",details:"secret"},{status:409});
  try {
    await assert.rejects(commercePersistenceRequest("commerce_source_mappings?email=eq.private@example.invalid"), error => {
      assert.ok(error instanceof CommercePersistenceError);
      assert.equal(error.status, 409);
      assert.equal(error.databaseCode, "55P03");
      assert.equal(error.resource, "commerce_source_mappings");
      assert.match(error.message, /409\/55P03; commerce_source_mappings/);
      assert.doesNotMatch(error.message, /private|secret|email=/);
      return true;
    });
    await assert.rejects(commercePersistenceRequest("rpc/resolve_order?email=eq.private@example.invalid"), /409\/55P03; rpc\/resolve_order/);
  } finally {
    globalThis.fetch = original;
    if (originalURL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalURL;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("caught conversion, click, historical and reconciliation failures remain failed scheduler health", () => {
  for (const outcome of [
    {results:[{status:"failed"},{status:"completed"}]},
    {results:[{status:"completed",clickStatus:"failed"}]},
    {historicalImport:{status:"failed"}},
    {reconciliationMaintenance:[{status:"warning"}]},
  ]) assert.equal(everflowSchedulerHealth(outcome).failed, true);
  assert.equal(everflowSchedulerHealth({results:[{status:"completed",clickStatus:"partial"},{status:"claim_lost"}],historicalImport:{status:"queued"}}).failed, false);
  assert.equal(everflowSchedulerHealth({results:[]}).failed, false);
});

test("cron HTTP status and persisted telemetry agree with caught target failures", async () => {
  const compiled = await build({
    entryPoints:[fileURLToPath(new URL("../app/api/cron/everflow-scheduler/route.ts",import.meta.url))],
    bundle:true,platform:"node",format:"cjs",write:false,external:["next/server"],
    plugins:[{name:"isolated-cron-dependencies",setup(builder) {
      builder.onResolve({filter:/supabase-control-repository|everflow-scheduled-worker$/}, args=>({path:args.path,namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"}, args=>({contents:args.path.includes("supabase-control")
        ? `export async function commercePersistenceRequest(path,init){ globalThis.fixture.telemetry.push({path,body:JSON.parse(init.body)}); return []; }`
        : `export async function runDueEverflowSchedules(){ return globalThis.fixture.outcome; }`,loader:"js"}));
    }}],
  });
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "synthetic-cron-secret";
  try {
    for (const outcome of [{results:[{status:"failed"}]},{results:[{status:"completed",clickStatus:"failed"}]},{results:[{status:"completed",clickStatus:"partial"}]}]) {
      const fixture = {outcome,telemetry:[] as any[]};
      const module = {exports:{} as any};
      const nodeRequire = createRequire(import.meta.url);
      const require = (name:string) => name === "next/server" ? {NextResponse:{json:Response.json}} : nodeRequire(name);
      runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require,process,fixture});
      const response = await module.exports.GET(new Request("https://tracekit.invalid/api/cron/everflow-scheduler",{headers:{authorization:"Bearer synthetic-cron-secret"}}));
      const failed = everflowSchedulerHealth(outcome).failed;
      assert.equal(response.status, failed ? 500 : 200);
      assert.equal((await response.json()).ok, !failed);
      const status = fixture.telemetry.find(row=>row.body.scheduler_completed_at);
      assert.equal(status.body.scheduler_status, failed ? "failed" : "completed");
      assert.equal(fixture.telemetry.at(-1).body.response_status, response.status);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret;
  }
});

test("a natural-page persistence failure fails its checkpoint and run without marking the page complete", async () => {
  const original = globalThis.fetch;
  const calls: Array<{name:string;args:any[]}> = [];
  const plane: any = {
    getConnection: async () => ({organizationId:"org",provider:"everflow",status:"connected",accountId:"account",capabilities:{everflowNetwork:{timezoneId:80,currencyId:"USD"}}}),
    listProviderAccounts: async () => [{id:"provider",externalId:"1",status:"active",provisional:false}],
    resolveCredentialForExecution: async () => "synthetic-key",
    createSyncRun: async () => ({id:"run"}),
    claimSyncRun: async () => true,
    beginCheckpoint: async () => ({id:"checkpoint",retryCount:0}),
  };
  for (const name of ["completeCheckpoint","failCheckpoint","heartbeatSyncRun","completeSyncRun","failSyncRun"]) {
    plane[name] = async (...args: any[]) => { calls.push({name,args}); };
  }
  globalThis.fetch = async input => {
    if (new URL(String(input)).hostname === "api.eflow.team") return Response.json({conversions:[{conversion_id:"conversion-1",conversion_unix_timestamp:1720000000,revenue:0}],paging:{page:3,page_size:200,total_count:1000}});
    return Response.json({code:"55P03",message:"private source detail"},{status:409});
  };
  const originalURL = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic";
  try {
    await assert.rejects(syncEverflowScheduledConversionPage({plane,session:{} as any,organizationId:"org",connectionId:"connection",from:"2026-10-02 00:00:00",to:"2026-10-02 23:59:59",page:3}), /409\/55P03/);
    assert.deepEqual(calls.map(row=>row.name), ["failCheckpoint","failSyncRun"]);
    assert.equal(calls[0].args[2], "checkpoint");
    assert.equal(calls[0].args[3], 1);
    assert.equal(calls[1].args[4], "everflow_conversion_sync_failed");
    assert.match(calls[1].args[5], /409\/55P03; commerce_evidence_records/);
  } finally {
    globalThis.fetch = original;
    if (originalURL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalURL;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

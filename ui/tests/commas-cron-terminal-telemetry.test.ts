import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";

const schema = readFileSync(new URL("../../supabase/migrations/20261001220612_m15_commerce_cron_runtime_telemetry.sql", import.meta.url), "utf8");
const compiled = build({
  entryPoints: [fileURLToPath(new URL("../app/api/cron/commas-scheduler/route.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", write: false, external: ["next/server"],
  plugins: [{
    name: "synthetic-worker-only",
    setup(builder) {
      builder.onResolve({ filter: /commas-scheduled-worker$/ }, () => ({ path: "worker", namespace: "fixture" }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: args.path === "worker" ? `export async function runDueCommasSchedules(input) {
          fixture.workerCalls.push(input);
          if (fixture.failed) throw new Error("synthetic worker failure");
          return {dueTargets:1,attempted:1,completed:1,failed:0,deepReconciliationDue:0};
        }` : "", loader: "js",
      }));
    },
  }],
});

for (const outcome of ["completed", "failed", "not_authorized"] as const) {
  for (const telemetryFailure of [false, true]) {
    test(`${outcome}: terminal telemetry ${telemetryFailure ? "failure is sanitized" : "persists against committed schema"}`, async (t) => {
      const db = new PGlite();
      t.after(() => db.close());
      await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role");
      await db.exec(schema);
      const columns = new Set((await db.query<{ attname: string }>(
        "SELECT attname FROM pg_attribute WHERE attrelid='public.commerce_cron_runs'::regclass AND attnum>0 AND NOT attisdropped",
      )).rows.map(row => row.attname));
      assert.ok(columns.has("scheduler_completed_at"));
      assert.ok(!columns.has("completed_at"));
      const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
      const diagnostics: unknown[][] = [];
      const fixture = { failed: outcome === "failed", workerCalls: [] as unknown[] };
      const injectedSecret = "synthetic-private-secret";
      const fetch = async (input: string, init: RequestInit) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://telemetry.invalid");
        assert.equal(url.pathname, "/rest/v1/commerce_cron_runs");
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        requests.push({ path: url.pathname + url.search, body });
        if (Object.keys(body).some(key => !columns.has(key)) || (telemetryFailure && body.response_status)) {
          return Response.json({ code: "PGRST204", message: injectedSecret, details: "private@example.invalid" }, { status: 400 });
        }
        const keys = Object.keys(body);
        if (init.method === "POST") {
          await db.query(`INSERT INTO public.commerce_cron_runs (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(body));
        } else {
          assert.equal(init.method, "PATCH");
          const requestId = String(url.searchParams.get("request_id")).slice(3);
          await db.query(`UPDATE public.commerce_cron_runs SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(",")} WHERE request_id=$${keys.length + 1}`, [...Object.values(body), requestId]);
        }
        return Response.json([]);
      };
      const nodeRequire = createRequire(import.meta.url);
      const module = { exports: {} as { GET(request: Request): Promise<Response> } };
      runInNewContext((await compiled).outputFiles[0].text, {
        module, exports: module.exports, fixture, fetch, Request, Response, URL,
        require: (name: string) => name === "next/server" ? { NextResponse: { json: Response.json } } : nodeRequire(name),
        process: { env: { CRON_SECRET: injectedSecret, NEXT_PUBLIC_SUPABASE_URL: "https://telemetry.invalid", SUPABASE_SERVICE_ROLE_KEY: injectedSecret } },
        console: { info: () => {}, error: (...args: unknown[]) => { diagnostics.push(args); } },
      });
      const response = await module.exports.GET(new Request("https://application.invalid/api/cron/commas-scheduler", {
        headers: outcome === "not_authorized" ? {} : { authorization: `Bearer ${injectedSecret}` },
      }));
      assert.equal(response.status, outcome === "completed" ? 200 : outcome === "failed" ? 500 : 401);
      const result = await response.json();
      assert.equal(fixture.workerCalls.length, outcome === "not_authorized" ? 0 : 1);
      if (fixture.workerCalls.length) assert.equal(JSON.stringify(fixture.workerCalls), '[{"limit":1}]');
      const terminal = requests.filter(request => request.body.response_status);
      assert.equal(terminal.length, 1);
      assert.equal(terminal[0].body.scheduler_status, outcome);
      assert.equal(terminal[0].body.response_status, response.status);
      assert.match(String(terminal[0].body.scheduler_completed_at), /^\d{4}-\d{2}-\d{2}T/);
      for (const request of requests.slice(1)) assert.ok(request.path.includes(`request_id=eq.${result.requestId}`));
      const persisted = (await db.query<Record<string, unknown>>("SELECT * FROM commerce_cron_runs")).rows[0];
      assert.equal(persisted.request_id, result.requestId);
      assert.equal(persisted.authorized, outcome !== "not_authorized");
      if (!telemetryFailure) {
        assert.equal(persisted.scheduler_status, outcome);
        assert.ok(persisted.scheduler_completed_at);
        assert.equal(persisted.response_status, response.status);
        assert.equal(persisted.scheduler_started_at === null, outcome === "not_authorized");
        assert.ok(Date.parse(String(persisted.scheduler_completed_at)) >= Date.parse(String(persisted.started_at)));
        if (outcome === "completed") assert.deepEqual([persisted.due_targets, persisted.attempted, persisted.completed, persisted.failed], [1, 1, 1, 0]);
        assert.equal(diagnostics.filter(row => row[0] === "commas_cron_telemetry_patch_failed").length, 0);
      } else {
        assert.equal(persisted.response_status, null);
        const diagnostic = diagnostics.find(row => row[0] === "commas_cron_telemetry_patch_failed");
        assert.ok(diagnostic);
        assert.ok(JSON.stringify(diagnostic).includes("PGRST204"));
        assert.ok(JSON.stringify(diagnostic).includes(result.requestId));
        assert.doesNotMatch(JSON.stringify(diagnostic), /synthetic-private-secret|private@example|authorization|Bearer/);
      }
    });
  }
}

test("generic telemetry transport errors never log raw credentials or private response details", async () => {
  const fixture = { failed: false, workerCalls: [] };
  const errors: unknown[][] = [];
  const nodeRequire = createRequire(import.meta.url);
  const module = { exports: {} as { GET(request: Request): Promise<Response> } };
  runInNewContext((await compiled).outputFiles[0].text, {
    module, exports: module.exports, fixture, Response,
    require: (name: string) => name === "next/server" ? { NextResponse: { json: Response.json } } : nodeRequire(name),
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://telemetry.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic" } },
    fetch: async () => { throw new Error("Bearer synthetic-secret private@example.invalid"); },
    console: { info: () => {}, error: (...args: unknown[]) => { errors.push(args); } },
  });
  assert.equal((await module.exports.GET(new Request("https://application.invalid/api/cron/commas-scheduler"))).status, 401);
  assert.equal(errors.length, 2);
  assert.doesNotMatch(JSON.stringify(errors), /synthetic-secret|private@example|Bearer/);
  assert.ok(JSON.stringify(errors).includes("telemetry_request_failed"));
});

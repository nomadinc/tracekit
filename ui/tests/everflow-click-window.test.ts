import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN,
  EVERFLOW_SCHEDULER_INVOCATION_BUDGET_MS,
  EverflowClickAdaptiveError,
  createEverflowSchedulerRuntime,
  everflowClickRowCountIsSaturated,
  ingestEverflowClickWindow,
  splitEverflowClickInterval,
  type EverflowClickInterval,
} from "../lib/integrations/everflow-click-window";

const day = { from: "2026-08-31 00:00:00", to: "2026-08-31 23:59:59" };
const half = { from: day.from, to: "2026-08-31 11:59:59" };
const quarter = { from: day.from, to: "2026-08-31 05:59:59" };
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

test("9,999 is accepted while 10,000 and above are saturated", async () => {
  assert.equal(everflowClickRowCountIsSaturated(9_999), false);
  assert.equal(everflowClickRowCountIsSaturated(10_000), true);
  assert.equal(everflowClickRowCountIsSaturated(10_001), true);
  let persisted = 0;
  const result = await ingestEverflowClickWindow({
    interval: day,
    fetchInterval: async () => ({
      rows: Array.from({ length: 9_999 }, (_, i) => i),
      saturated: false,
    }),
    persistCompleteInterval: async (_interval, rows) => {
      persisted += rows.length;
    },
  });
  assert.equal(result.status, "complete");
  assert.equal(persisted, 9_999);
});

test("saturation checkpoints the narrowed interval before its fetch", async () => {
  const events: string[] = [];
  const result = await ingestEverflowClickWindow({
    interval: day,
    requestBudget: 1,
    fetchInterval: async (i) => {
      events.push(`fetch:${i.to}`);
      return { rows: [], saturated: true };
    },
    checkpointInterval: async (i, t) => {
      events.push(`checkpoint:${t.stoppingReason}:${i.to}`);
    },
    persistCompleteInterval: async () =>
      assert.fail("saturated rows persisted"),
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(events.slice(0, 2), [
    `fetch:${day.to}`,
    `checkpoint:split_checkpoint:${half.to}`,
  ]);
});

test("a resumed invocation starts from the exact persisted child", async () => {
  const requests: EverflowClickInterval[] = [];
  await ingestEverflowClickWindow({
    interval: half,
    requestBudget: 1,
    fetchInterval: async (i) => {
      requests.push(i);
      return { rows: [1], saturated: false };
    },
    persistCompleteInterval: async () => undefined,
  });
  assert.deepEqual(requests, [half]);
});

test("recursive saturation checkpoints the grandchild before fetching it", async () => {
  const requests: EverflowClickInterval[] = [],
    checkpoints: EverflowClickInterval[] = [];
  const result = await ingestEverflowClickWindow({
    interval: day,
    fetchInterval: async (i) => {
      requests.push(i);
      return { rows: [], saturated: true };
    },
    checkpointInterval: async (i) => {
      checkpoints.push(i);
    },
    persistCompleteInterval: async () => undefined,
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(requests, [day, half]);
  assert.deepEqual(checkpoints.slice(0, 2), [half, quarter]);
});

test("low runtime before the first request returns healthy partial", async () => {
  let now = 0;
  const runtime = createEverflowSchedulerRuntime(() => now, 100);
  now = 60;
  let fetched = false,
    checkpoint: EverflowClickInterval | undefined;
  const result = await ingestEverflowClickWindow({
    interval: day,
    runtime,
    requestStartMinimumRemainingMs: 50,
    fetchInterval: async () => {
      fetched = true;
      return { rows: [], saturated: false };
    },
    checkpointInterval: async (i) => {
      checkpoint = i;
    },
    persistCompleteInterval: async () => undefined,
  });
  assert.equal(result.status, "partial");
  assert.equal(result.telemetry.stoppingReason, "runtime_budget_exhausted");
  assert.equal(fetched, false);
  assert.deepEqual(checkpoint, day);
});

test("runtime exhaustion after one request preserves the exact child", async () => {
  let now = 0;
  const runtime = createEverflowSchedulerRuntime(() => now, 100),
    checkpoints: EverflowClickInterval[] = [];
  const result = await ingestEverflowClickWindow({
    interval: day,
    runtime,
    requestStartMinimumRemainingMs: 50,
    fetchInterval: async () => {
      now = 60;
      return { rows: [], saturated: true };
    },
    checkpointInterval: async (i) => {
      checkpoints.push(i);
    },
    persistCompleteInterval: async () => undefined,
  });
  assert.equal(result.status, "partial");
  assert.equal(result.telemetry.stoppingReason, "runtime_budget_exhausted");
  assert.deepEqual(checkpoints, [half, half]);
});

test("two-request counters reset for each invocation", async () => {
  const invoke = () =>
    ingestEverflowClickWindow({
      interval: day,
      fetchInterval: async () => ({ rows: [], saturated: true }),
      checkpointInterval: async () => undefined,
      persistCompleteInterval: async () => undefined,
    });
  const a = await invoke(),
    b = await invoke();
  assert.equal(EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN, 2);
  assert.equal(a.telemetry.providerRequestCount, 2);
  assert.equal(b.telemetry.providerRequestCount, 2);
  assert.equal(a.telemetry.stoppingReason, "request_budget_exhausted");
});

test("checkpoint timeout stops before requesting the child", async () => {
  let requests = 0;
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: day,
      fetchInterval: async () => {
        requests++;
        return { rows: [], saturated: true };
      },
      checkpointInterval: async () => {
        throw new Error("checkpoint timeout");
      },
      persistCompleteInterval: async () => undefined,
    }),
    /checkpoint timeout/,
  );
  assert.equal(requests, 1);
});

test("persistence timeout leaves the interval incomplete", async () => {
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: day,
      fetchInterval: async () => ({ rows: [1], saturated: false }),
      persistCompleteInterval: async () => {
        throw new Error("database timeout");
      },
    }),
    /database timeout/,
  );
});

test("provider timeout remains a failure with exact resume bounds", async () => {
  const timeout = Object.assign(new Error("provider timeout"), {
    code: "everflow_timeout",
  });
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: day,
      fetchInterval: async () => {
        throw timeout;
      },
      persistCompleteInterval: async () => undefined,
    }),
    (e) =>
      e === timeout &&
      (e as { resumeInterval: EverflowClickInterval }).resumeInterval.to ===
        day.to,
  );
});

test("minimum one-second saturation fails distinctly", async () => {
  let persisted = false;
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: { from: day.from, to: day.from },
      fetchInterval: async () => ({ rows: [], saturated: true }),
      persistCompleteInterval: async () => {
        persisted = true;
      },
    }),
    (e) =>
      e instanceof EverflowClickAdaptiveError &&
      e.code === "everflow_click_window_saturated",
  );
  assert.equal(persisted, false);
});

test("split bounds are adjacent, non-overlapping whole seconds and shrink", () => {
  assert.deepEqual(splitEverflowClickInterval(day), [
    half,
    { from: "2026-08-31 12:00:00", to: day.to },
  ]);
  assert.equal(
    splitEverflowClickInterval({ from: day.from, to: day.from }),
    null,
  );
  assert.deepEqual(
    splitEverflowClickInterval({ from: day.from, to: "2026-08-31 00:00:01" }),
    [
      { from: day.from, to: day.from },
      { from: "2026-08-31 00:00:01", to: "2026-08-31 00:00:01" },
    ],
  );
});

test("normalization and persistence are bounded without changing identity", () => {
  const clicks = source("ui/lib/integrations/everflow-clicks.ts");
  assert.match(clicks, /EVERFLOW_CLICK_NORMALIZE_BATCH_SIZE = 100/);
  assert.match(clicks, /EVERFLOW_CLICK_PERSIST_BATCH_SIZE = 500/);
  assert.match(clicks, /return=minimal/);
  assert.match(
    clicks,
    /on_conflict=organization_id,connection_id,provider_account_id,transaction_id/,
  );
});

test("all click database operations use a narrow path-local timeout", () => {
  const clicks = source("ui/lib/integrations/everflow-clicks.ts"),
    incremental = source("ui/lib/integrations/everflow-click-incremental.ts"),
    conversions = source("ui/lib/integrations/everflow-conversions.ts"),
    commerce = source("ui/lib/commerce/supabase-control-repository.ts"),
    worker = source("ui/lib/integrations/everflow-scheduled-worker.ts"),
    route = source("ui/app/api/cron/everflow-scheduler/route.ts");
  assert.match(clicks, /EVERFLOW_CLICK_DATABASE_TIMEOUT_MS = 15_000/);
  assert.match(clicks, /everflow_click_database_timeout/);
  assert.match(clicks, /controller\.abort\(\)/);
  assert.doesNotMatch(incremental, /commercePersistenceRequest/);
  assert.match(incremental, /everflowClickDatabaseRequest/);
  assert.doesNotMatch(conversions, /EVERFLOW_CLICK_DATABASE_TIMEOUT_MS/);
  assert.match(conversions, /EVERFLOW_CONVERSION_TIMEOUT_MS = 10_000/);
  assert.doesNotMatch(commerce, /EVERFLOW_CLICK_DATABASE_TIMEOUT_MS/);
  assert.doesNotMatch(commerce, /AbortController|setTimeout/);
  assert.match(
    worker,
    /EVERFLOW_CLICK_DATABASE_TIMEOUT_MS \+ 5_000/,
  );
  assert.equal(EVERFLOW_SCHEDULER_INVOCATION_BUDGET_MS, 235_000);
  assert.match(route, /export const maxDuration = 300/);
});

test("adaptive state stores exact bounds and safe timing only", () => {
  const incremental = source(
      "ui/lib/integrations/everflow-click-incremental.ts",
    ),
    window = source("ui/lib/integrations/everflow-click-window.ts");
  assert.match(
    incremental,
    /incrementalCursorFrom:\s*input\.interval\.from,[\s\S]*incrementalCursorTo:\s*input\.interval\.to/,
  );
  for (const field of [
    "invocationBudgetMs",
    "elapsedMs",
    "remainingMs",
    "currentSubwindowFrom",
    "currentSubwindowTo",
    "stoppingReason",
  ])
    assert.match(window, new RegExp(field));
  assert.doesNotMatch(incremental, /rawPayload|apiKey|credential/);
});

test("healthy partial reaches normal lease finish", () => {
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");
  assert.match(
    worker,
    /if \(ingestion\.status === "partial"\)[\s\S]*status: "partial"/,
  );
  assert.match(
    worker,
    /finishSchedule\(schedule\.id, claim\.leaseOwner, outcome\)/,
  );
  assert.match(worker, /p_lease_seconds: 1200/);
});

test("application budget, conversions, and five-minute cadence remain intact", () => {
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts"),
    vercel = source("ui/vercel.json");
  assert.equal(EVERFLOW_SCHEDULER_INVOCATION_BUDGET_MS, 235_000);
  assert.ok(
    worker.indexOf("syncEverflowScheduledConversionPage") <
      worker.indexOf("runEverflowScheduledClickChunk(scope)"),
  );
  assert.match(vercel, /"schedule": "\*\/5 \* \* \* \*"/);
});

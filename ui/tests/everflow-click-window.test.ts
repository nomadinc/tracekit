import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN,
  EverflowClickAdaptiveError,
  everflowClickRowCountIsSaturated,
  ingestEverflowClickWindow,
  splitEverflowClickInterval,
  type EverflowClickInterval,
} from "../lib/integrations/everflow-click-window";

const day = { from: "2026-08-31 00:00:00", to: "2026-08-31 23:59:59" };
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string) => readFileSync(`${repoRoot}/${relative}`, "utf8");

async function run(input: {
  rowsFor: (interval: EverflowClickInterval, request: number) => number | "saturated" | "failed";
  persist?: (interval: EverflowClickInterval, rows: string[]) => Promise<void>;
  budget?: number;
}) {
  let requests = 0;
  const persisted: EverflowClickInterval[] = [];
  const result = await ingestEverflowClickWindow({
    interval: day,
    requestBudget: input.budget,
    fetchInterval: async (interval) => {
      const outcome = input.rowsFor(interval, ++requests);
      if (outcome === "failed") throw new Error("provider failed");
      if (outcome === "saturated") return { rows: [], saturated: true };
      return { rows: Array.from({ length: outcome }, (_, index) => `${interval.from}:${index}`), saturated: false };
    },
    persistCompleteInterval: async (interval, rows) => {
      await input.persist?.(interval, rows);
      persisted.push(interval);
    },
  });
  return { result, persisted, requests };
}

test("small and 9,999-row windows are accepted without splitting", async () => {
  assert.equal(everflowClickRowCountIsSaturated(9_999), false);
  assert.equal(everflowClickRowCountIsSaturated(10_000), true);
  assert.equal(everflowClickRowCountIsSaturated(10_001), true);
  for (const count of [50, 9_999]) {
    const output = await run({ rowsFor: () => count });
    assert.equal(output.requests, 1);
    assert.deepEqual(output.persisted, [day]);
    assert.equal(output.result.seen, count);
    assert.equal(output.result.telemetry.splitCount, 0);
  }
});

test("exactly 10,000 or a provider-equivalent saturated response splits", async () => {
  for (const saturatedCount of [10_000, 12_000]) {
    const output = await run({ rowsFor: (_interval, request) => request === 1 && saturatedCount >= 10_000 ? "saturated" : 1 });
    assert.equal(output.requests, 3);
    assert.equal(output.result.telemetry.splitCount, 1);
    assert.deepEqual(output.persisted, [
      { from: "2026-08-31 00:00:00", to: "2026-08-31 11:59:59" },
      { from: "2026-08-31 12:00:00", to: "2026-08-31 23:59:59" },
    ]);
  }
});

test("a parent day splits into two complete halves and persists both", async () => {
  const output = await run({ rowsFor: (_interval, request) => request === 1 ? "saturated" : 25 });
  assert.equal(output.result.seen, 50);
  assert.equal(output.persisted.length, 2);
  assert.equal(output.result.telemetry.stoppingReason, "window_complete");
});

test("failure after the first half leaves that durable half available for resume", async () => {
  const persisted: EverflowClickInterval[] = [];
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: day,
      fetchInterval: async (interval) => {
        if (interval.from === day.from && interval.to === day.to) return { rows: [], saturated: true };
        if (interval.from.endsWith("00:00:00")) return { rows: ["left"], saturated: false };
        throw new Error("second half failed");
      },
      persistCompleteInterval: async (interval) => { persisted.push(interval); },
    }),
    /second half failed/,
  );
  assert.deepEqual(persisted, [{ from: day.from, to: "2026-08-31 11:59:59" }]);
});

test("a saturated child recursively splits again", async () => {
  const output = await run({ rowsFor: (interval) => {
    if (interval.from === day.from && interval.to === day.to) return "saturated";
    if (interval.from === day.from && interval.to.endsWith("11:59:59")) return "saturated";
    return 1;
  }});
  assert.equal(output.result.telemetry.splitCount, 2);
  assert.equal(output.requests, 5);
  assert.equal(output.persisted.length, 3);
});

test("a saturated one-second interval fails distinctly without persistence", async () => {
  let persisted = false;
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: { from: "2026-08-31 12:00:00", to: "2026-08-31 12:00:00" },
      fetchInterval: async () => ({ rows: [], saturated: true }),
      persistCompleteInterval: async () => { persisted = true; },
    }),
    (error: unknown) => error instanceof EverflowClickAdaptiveError && error.code === "everflow_click_window_saturated" && error.telemetry.stoppingReason === "minimum_interval_saturated" && error.resumeInterval.from === "2026-08-31 12:00:00",
  );
  assert.equal(persisted, false);
});

test("split bounds are adjacent whole seconds and retain a midpoint click exactly once", () => {
  const children = splitEverflowClickInterval(day)!;
  assert.equal(children[0].to, "2026-08-31 11:59:59");
  assert.equal(children[1].from, "2026-08-31 12:00:00");
  assert.equal(Date.parse(children[1].from.replace(" ", "T") + "Z") - Date.parse(children[0].to.replace(" ", "T") + "Z"), 1_000);
  const noon = Date.parse("2026-08-31T12:00:00Z");
  const memberships = children.filter((child) => noon >= Date.parse(child.from.replace(" ", "T") + "Z") && noon <= Date.parse(child.to.replace(" ", "T") + "Z"));
  assert.equal(memberships.length, 1);
});

test("duplicate transaction identities from child responses remain one durable identity", async () => {
  const durable = new Set<string>();
  let request = 0;
  await ingestEverflowClickWindow({
    interval: day,
    fetchInterval: async () => ++request === 1 ? { rows: [], saturated: true } : { rows: ["same-transaction"], saturated: false },
    persistCompleteInterval: async (_interval, rows) => { rows.forEach((row) => durable.add(row)); },
  });
  assert.equal(durable.size, 1);
});

test("request budget exhaustion is bounded, retryable, and retains completed child progress", async () => {
  const persisted: EverflowClickInterval[] = [];
  let requests = 0;
  await assert.rejects(
    ingestEverflowClickWindow({
      interval: day,
      requestBudget: 2,
      fetchInterval: async (_interval) => ++requests === 1 ? { rows: [], saturated: true } : { rows: ["row"], saturated: false },
      persistCompleteInterval: async (interval) => { persisted.push(interval); },
    }),
    (error: unknown) => error instanceof EverflowClickAdaptiveError && error.code === "everflow_click_request_budget_exhausted" && error.retryable && error.telemetry.providerRequestCount === 2 && error.resumeInterval.from === "2026-08-31 12:00:00",
  );
  assert.equal(persisted.length, 1);
});

test("persistence failure after a completed child is retry safe", async () => {
  let request = 0, persistence = 0;
  const durable = new Set<string>();
  await assert.rejects(run({
    rowsFor: () => ++request === 1 ? "saturated" : 1,
    persist: async (_interval, rows) => {
      if (++persistence === 2) throw new Error("persistence failed");
      rows.forEach((row) => durable.add(row));
    },
  }), /persistence failed/);
  assert.equal(durable.size, 1);
});

test("state checkpointing remains subwindow-resumable and final commit remains authoritative", () => {
  const incremental = source("ui/lib/integrations/everflow-click-incremental.ts");
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");
  assert.match(incremental, /incrementalCursorFrom:nextSecond\(input\.to\)/);
  assert.match(incremental, /incrementalCursorTo:input\.resumeTo/);
  assert.match(incremental, /if\(input\.to===input\.parentTo\) return/);
  assert.match(worker, /markEverflowClickSubwindowSuccess/);
  assert.match(worker, /markEverflowClickIncrementalChunkSuccess/);
  assert.equal(EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN, 6);
});

test("conversion scheduling and five-minute cron cadence remain unchanged", () => {
  const worker = source("ui/lib/integrations/everflow-scheduled-worker.ts");
  const vercel = source("ui/vercel.json");
  assert.match(worker, /syncEverflowScheduledConversionPage/);
  assert.match(worker, /runEverflowScheduledClickChunk\(scope\)/);
  assert.match(vercel, /"schedule": "\*\/5 \* \* \* \*"/);
});

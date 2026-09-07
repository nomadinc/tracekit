export const EVERFLOW_CLICK_MIN_INTERVAL_SECONDS = 1;
export const EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN = 2;
export const EVERFLOW_SCHEDULER_INVOCATION_BUDGET_MS = 235_000;
export const EVERFLOW_CLICK_REQUEST_START_MIN_REMAINING_MS = 45_000;
export const everflowClickRowCountIsSaturated = (
  rowCount: number,
  maximumRows = 10_000,
) => rowCount >= maximumRows;

export type EverflowClickInterval = { from: string; to: string };
export type EverflowClickSplitTelemetry = {
  splitCount: number;
  providerRequestCount: number;
  smallestIntervalSeconds: number;
  invocationBudgetMs: number;
  elapsedMs: number;
  remainingMs: number;
  currentSubwindowFrom: string;
  currentSubwindowTo: string;
  stoppingReason:
    | "window_complete"
    | "subwindow_complete"
    | "split_checkpoint"
    | "request_budget_exhausted"
    | "runtime_budget_exhausted"
    | "minimum_interval_saturated"
    | "sync_failed";
};

export type EverflowClickRuntime = {
  invocationBudgetMs: number;
  startedAtMs: number;
  deadlineAtMs: number;
  nowMs: () => number;
};

export function createEverflowSchedulerRuntime(
  nowMs: () => number = () => performance.now(),
  invocationBudgetMs = EVERFLOW_SCHEDULER_INVOCATION_BUDGET_MS,
): EverflowClickRuntime {
  const startedAtMs = nowMs();
  return {
    invocationBudgetMs,
    startedAtMs,
    deadlineAtMs: startedAtMs + invocationBudgetMs,
    nowMs,
  };
}

export async function runWithinEverflowSchedulerDeadline<T>(
  runtime: EverflowClickRuntime,
  work: () => Promise<T>,
): Promise<T> {
  const remaining = Math.max(0, runtime.deadlineAtMs - runtime.nowMs());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Everflow scheduler application runtime budget exhausted.",
              ),
            ),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export class EverflowClickAdaptiveError extends Error {
  readonly code:
    | "everflow_click_window_saturated"
    | "everflow_click_request_budget_exhausted";
  readonly httpStatus = 409;
  readonly retryable = true;
  readonly telemetry: EverflowClickSplitTelemetry;
  readonly resumeInterval: EverflowClickInterval;

  constructor(
    code: EverflowClickAdaptiveError["code"],
    message: string,
    telemetry: EverflowClickSplitTelemetry,
    resumeInterval: EverflowClickInterval,
  ) {
    super(message);
    this.name = "EverflowClickAdaptiveError";
    this.code = code;
    this.telemetry = telemetry;
    this.resumeInterval = resumeInterval;
  }
}

const parseSecond = (value: string) => {
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(parsed) || parsed % 1000 !== 0)
    throw new Error(
      "Everflow click interval must use whole-second timestamps.",
    );
  return parsed;
};

const formatSecond = (value: number) =>
  new Date(value).toISOString().slice(0, 19).replace("T", " ");

export function everflowClickIntervalSeconds(interval: EverflowClickInterval) {
  const from = parseSecond(interval.from),
    to = parseSecond(interval.to);
  if (from > to)
    throw new Error("Everflow click interval bounds are reversed.");
  return Math.floor((to - from) / 1000) + 1;
}

export function splitEverflowClickInterval(
  interval: EverflowClickInterval,
): [EverflowClickInterval, EverflowClickInterval] | null {
  const from = parseSecond(interval.from),
    to = parseSecond(interval.to);
  if (from >= to) return null;
  const midpoint = from + Math.floor((to - from) / 2000) * 1000;
  return [
    { from: formatSecond(from), to: formatSecond(midpoint) },
    { from: formatSecond(midpoint + 1000), to: formatSecond(to) },
  ];
}

function telemetry(
  input: {
    splitCount: number;
    providerRequestCount: number;
    smallestIntervalSeconds: number;
  },
  stoppingReason: EverflowClickSplitTelemetry["stoppingReason"],
  interval: EverflowClickInterval,
  runtime?: EverflowClickRuntime,
): EverflowClickSplitTelemetry {
  const elapsedMs = runtime
    ? Math.max(0, Math.round(runtime.nowMs() - runtime.startedAtMs))
    : 0;
  return {
    ...input,
    smallestIntervalSeconds: Number.isFinite(input.smallestIntervalSeconds)
      ? input.smallestIntervalSeconds
      : 0,
    invocationBudgetMs: runtime?.invocationBudgetMs ?? 0,
    elapsedMs,
    remainingMs: runtime
      ? Math.max(0, Math.round(runtime.deadlineAtMs - runtime.nowMs()))
      : 0,
    currentSubwindowFrom: interval.from,
    currentSubwindowTo: interval.to,
    stoppingReason,
  };
}

export async function ingestEverflowClickWindow<T>(input: {
  interval: EverflowClickInterval;
  fetchInterval: (
    interval: EverflowClickInterval,
  ) => Promise<{ rows: T[]; saturated: boolean; runtimeExhausted?: boolean }>;
  persistCompleteInterval: (
    interval: EverflowClickInterval,
    rows: T[],
    telemetry: EverflowClickSplitTelemetry,
  ) => Promise<void | { runtimeExhausted: true }>;
  checkpointInterval?: (
    interval: EverflowClickInterval,
    telemetry: EverflowClickSplitTelemetry,
  ) => Promise<void>;
  requestBudget?: number;
  runtime?: EverflowClickRuntime;
  requestStartMinimumRemainingMs?: number;
}) {
  const requestBudget = Math.max(
    1,
    Math.trunc(input.requestBudget ?? EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN),
  );
  const pending = [input.interval];
  const stats = {
    splitCount: 0,
    providerRequestCount: 0,
    smallestIntervalSeconds: Number.POSITIVE_INFINITY,
  };
  let seen = 0;

  while (pending.length) {
    const interval = pending.pop()!;
    const seconds = everflowClickIntervalSeconds(interval);
    stats.smallestIntervalSeconds = Math.min(
      stats.smallestIntervalSeconds,
      seconds,
    );
    const minimumRemainingMs =
      input.requestStartMinimumRemainingMs ??
      EVERFLOW_CLICK_REQUEST_START_MIN_REMAINING_MS;
    if (
      input.runtime &&
      input.runtime.deadlineAtMs - input.runtime.nowMs() < minimumRemainingMs
    ) {
      const detail = telemetry(
        stats,
        "runtime_budget_exhausted",
        interval,
        input.runtime,
      );
      await input.checkpointInterval?.(interval, detail);
      return { status: "partial" as const, seen, telemetry: detail };
    }
    if (stats.providerRequestCount >= requestBudget) {
      const detail = telemetry(
        stats,
        "request_budget_exhausted",
        interval,
        input.runtime,
      );
      await input.checkpointInterval?.(interval, detail);
      return { status: "partial" as const, seen, telemetry: detail };
    }

    stats.providerRequestCount += 1;
    let result: { rows: T[]; saturated: boolean; runtimeExhausted?: boolean };
    try {
      result = await input.fetchInterval(interval);
    } catch (error) {
      if (error && typeof error === "object")
        Object.assign(error, {
          telemetry: telemetry(stats, "sync_failed", interval, input.runtime),
          resumeInterval: interval,
        });
      throw error;
    }

    if (result.runtimeExhausted) {
      const detail = telemetry(
        stats,
        "runtime_budget_exhausted",
        interval,
        input.runtime,
      );
      await input.checkpointInterval?.(interval, detail);
      return { status: "partial" as const, seen, telemetry: detail };
    }

    if (result.saturated) {
      const children = splitEverflowClickInterval(interval);
      if (!children || seconds <= EVERFLOW_CLICK_MIN_INTERVAL_SECONDS) {
        throw new EverflowClickAdaptiveError(
          "everflow_click_window_saturated",
          "Everflow click ingestion reached the provider stream ceiling for the minimum one-second interval.",
          telemetry(
            stats,
            "minimum_interval_saturated",
            interval,
            input.runtime,
          ),
          interval,
        );
      }
      stats.splitCount += 1;
      stats.smallestIntervalSeconds = Math.min(
        stats.smallestIntervalSeconds,
        everflowClickIntervalSeconds(children[0]),
      );
      await input.checkpointInterval?.(
        children[0],
        telemetry(stats, "split_checkpoint", children[0], input.runtime),
      );
      pending.push(children[1], children[0]);
      continue;
    }

    try {
      const persisted = await input.persistCompleteInterval(
        interval,
        result.rows,
        telemetry(stats, "subwindow_complete", interval, input.runtime),
      );
      if (persisted?.runtimeExhausted) {
        const detail = telemetry(
          stats,
          "runtime_budget_exhausted",
          interval,
          input.runtime,
        );
        await input.checkpointInterval?.(interval, detail);
        return { status: "partial" as const, seen, telemetry: detail };
      }
    } catch (error) {
      if (error && typeof error === "object")
        Object.assign(error, {
          telemetry: telemetry(stats, "sync_failed", interval, input.runtime),
          resumeInterval: interval,
        });
      throw error;
    }
    seen += result.rows.length;
  }

  return {
    status: "complete" as const,
    seen,
    telemetry: telemetry(
      stats,
      "window_complete",
      input.interval,
      input.runtime,
    ),
  };
}

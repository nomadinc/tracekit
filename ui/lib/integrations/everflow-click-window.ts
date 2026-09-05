export const EVERFLOW_CLICK_MIN_INTERVAL_SECONDS = 1;
export const EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN = 6;
export const everflowClickRowCountIsSaturated = (rowCount: number, maximumRows = 10_000) => rowCount >= maximumRows;

export type EverflowClickInterval = { from: string; to: string };
export type EverflowClickSplitTelemetry = {
  splitCount: number;
  providerRequestCount: number;
  smallestIntervalSeconds: number;
  stoppingReason: "window_complete" | "subwindow_complete" | "request_budget_exhausted" | "minimum_interval_saturated" | "sync_failed";
};

export class EverflowClickAdaptiveError extends Error {
  readonly code: "everflow_click_window_saturated" | "everflow_click_request_budget_exhausted";
  readonly httpStatus = 409;
  readonly retryable = true;
  readonly telemetry: EverflowClickSplitTelemetry;
  readonly resumeInterval: EverflowClickInterval;

  constructor(code: EverflowClickAdaptiveError["code"], message: string, telemetry: EverflowClickSplitTelemetry, resumeInterval: EverflowClickInterval) {
    super(message);
    this.name = "EverflowClickAdaptiveError";
    this.code = code;
    this.telemetry = telemetry;
    this.resumeInterval = resumeInterval;
  }
}

const parseSecond = (value: string) => {
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(parsed) || parsed % 1000 !== 0) throw new Error("Everflow click interval must use whole-second timestamps.");
  return parsed;
};

const formatSecond = (value: number) => new Date(value).toISOString().slice(0, 19).replace("T", " ");

export function everflowClickIntervalSeconds(interval: EverflowClickInterval) {
  const from = parseSecond(interval.from), to = parseSecond(interval.to);
  if (from > to) throw new Error("Everflow click interval bounds are reversed.");
  return Math.floor((to - from) / 1000) + 1;
}

export function splitEverflowClickInterval(interval: EverflowClickInterval): [EverflowClickInterval, EverflowClickInterval] | null {
  const from = parseSecond(interval.from), to = parseSecond(interval.to);
  if (from >= to) return null;
  const midpoint = from + Math.floor((to - from) / 2000) * 1000;
  return [
    { from: formatSecond(from), to: formatSecond(midpoint) },
    { from: formatSecond(midpoint + 1000), to: formatSecond(to) },
  ];
}

function telemetry(input: Omit<EverflowClickSplitTelemetry, "stoppingReason">, stoppingReason: EverflowClickSplitTelemetry["stoppingReason"]): EverflowClickSplitTelemetry {
  return { ...input, smallestIntervalSeconds: Number.isFinite(input.smallestIntervalSeconds) ? input.smallestIntervalSeconds : 0, stoppingReason };
}

export async function ingestEverflowClickWindow<T>(input: {
  interval: EverflowClickInterval;
  fetchInterval: (interval: EverflowClickInterval) => Promise<{ rows: T[]; saturated: boolean }>;
  persistCompleteInterval: (interval: EverflowClickInterval, rows: T[], telemetry: EverflowClickSplitTelemetry) => Promise<void>;
  requestBudget?: number;
}) {
  const requestBudget = Math.max(1, Math.trunc(input.requestBudget ?? EVERFLOW_CLICK_MAX_REQUESTS_PER_RUN));
  const pending = [input.interval];
  const stats = { splitCount: 0, providerRequestCount: 0, smallestIntervalSeconds: Number.POSITIVE_INFINITY };
  let seen = 0;

  while (pending.length) {
    const interval = pending.pop()!;
    const seconds = everflowClickIntervalSeconds(interval);
    stats.smallestIntervalSeconds = Math.min(stats.smallestIntervalSeconds, seconds);
    if (stats.providerRequestCount >= requestBudget) {
      throw new EverflowClickAdaptiveError(
        "everflow_click_request_budget_exhausted",
        "Everflow click ingestion exhausted its bounded provider request budget before completing the requested interval.",
        telemetry(stats, "request_budget_exhausted"),
        interval,
      );
    }

    stats.providerRequestCount += 1;
    let result: { rows: T[]; saturated: boolean };
    try {
      result = await input.fetchInterval(interval);
    } catch (error) {
      if (error && typeof error === "object") Object.assign(error, { telemetry: telemetry(stats, "sync_failed"), resumeInterval: interval });
      throw error;
    }

    if (result.saturated) {
      const children = splitEverflowClickInterval(interval);
      if (!children || seconds <= EVERFLOW_CLICK_MIN_INTERVAL_SECONDS) {
        throw new EverflowClickAdaptiveError(
          "everflow_click_window_saturated",
          "Everflow click ingestion reached the provider stream ceiling for the minimum one-second interval.",
          telemetry(stats, "minimum_interval_saturated"),
          interval,
        );
      }
      stats.splitCount += 1;
      pending.push(children[1], children[0]);
      continue;
    }

    try {
      await input.persistCompleteInterval(interval, result.rows, telemetry(stats, "subwindow_complete"));
    } catch (error) {
      if (error && typeof error === "object") Object.assign(error, { telemetry: telemetry(stats, "sync_failed"), resumeInterval: interval });
      throw error;
    }
    seen += result.rows.length;
  }

  return { seen, telemetry: telemetry(stats, "window_complete") };
}

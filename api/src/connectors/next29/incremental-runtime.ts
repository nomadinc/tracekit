import type { Next29Client } from "./client.ts";
import type { Next29EvidenceSink } from "./types.ts";
import { runNext29BoundedBackfill, type Next29RuntimePersistence, type Next29RuntimeResource, type Next29RuntimeScope } from "./runtime.ts";

export type Next29IncrementalResourceState = {
  claimed: boolean;
  scheduleId: string;
  enabled: boolean;
  successfulThrough: string | null;
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  resumeCursor: string | null;
};

export type Next29IncrementalControl = {
  claim(input: Next29RuntimeScope & { resource: Next29RuntimeResource; now: string; leaseOwner: string; leaseSeconds: number }): Promise<Next29IncrementalResourceState>;
  finish(input: Next29RuntimeScope & { scheduleId: string; resource: Next29RuntimeResource; leaseOwner: string; now: string; outcome: "completed" | "incomplete"; successfulThrough: string | null; activeWindowStart: string | null; activeWindowEnd: string | null; resumeCursor: string | null }): Promise<void>;
  fail(input: Next29RuntimeScope & { scheduleId: string; resource: Next29RuntimeResource; leaseOwner: string; now: string; errorCode: string }): Promise<void>;
};

export type Next29IncrementalRequest = Next29RuntimeScope & {
  client: Pick<Next29Client,
    | "apiVersion"
    | "listOrders" | "getOrder"
    | "listSubscriptions" | "getSubscription"
    | "listDisputes" | "getDispute"
  >;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29RuntimePersistence;
  control: Next29IncrementalControl;
  resources?: readonly Next29RuntimeResource[];
  now?: () => string;
  leaseOwner: string;
  leaseSeconds?: number;
  overlapDays?: number;
  bootstrapLookbackDays?: number;
  maxCatchupDays?: number;
  bounds?: { maxPagesPerResource?: number; maxRecordsPerResource?: number };
};

export type Next29IncrementalResult = {
  provider: "next29";
  resources: Partial<Record<Next29RuntimeResource, { status: "not_claimed" | "completed" | "incomplete"; records: number; resumeCursor: string | null; windowStart: string | null; windowEnd: string | null }>>;
};

/**
 * Operator/scheduler-invoked incremental cycle. This function cannot activate a
 * schedule: it only runs resources whose durable control-plane row is already
 * enabled and successfully claimed by the supplied control adapter.
 */
export async function runNext29IncrementalCycle(args: Next29IncrementalRequest): Promise<Next29IncrementalResult> {
  const scope = requireScope(args);
  const leaseOwner = required(args.leaseOwner, "leaseOwner");
  const leaseSeconds = boundedInt(args.leaseSeconds, 300, 30, 1800, "leaseSeconds");
  const overlapDays = boundedInt(args.overlapDays, 1, 1, 7, "overlapDays");
  const bootstrapLookbackDays = boundedInt(args.bootstrapLookbackDays, 2, 1, 31, "bootstrapLookbackDays");
  const maxCatchupDays = boundedInt(args.maxCatchupDays, 7, 1, 31, "maxCatchupDays");
  const resources = normalizeResources(args.resources);
  const output: Next29IncrementalResult = { provider: "next29", resources: {} };

  for (const resource of resources) {
    const now = validIso((args.now ?? (() => new Date().toISOString()))(), "now");
    const state = await args.control.claim({ ...scope, resource, now, leaseOwner, leaseSeconds });
    if (!state.claimed || !state.enabled) {
      output.resources[resource] = { status: "not_claimed", records: 0, resumeCursor: state.resumeCursor, windowStart: state.activeWindowStart, windowEnd: state.activeWindowEnd };
      continue;
    }

    try {
      const window = state.activeWindowStart && state.activeWindowEnd
        ? { start: validIso(state.activeWindowStart, "activeWindowStart"), end: validIso(state.activeWindowEnd, "activeWindowEnd") }
        : next29IncrementalWindow({ successfulThrough: state.successfulThrough, now, overlapDays, bootstrapLookbackDays, maxCatchupDays });
      const query = state.resumeCursor ? undefined : next29IncrementalQuery(resource, window.start, window.end);
      const run = await runNext29BoundedBackfill({
        ...scope,
        client: args.client,
        evidenceSink: args.evidenceSink,
        persistence: args.persistence,
        resources: [resource],
        bounds: args.bounds,
        cursors: state.resumeCursor ? { [resource]: state.resumeCursor } : undefined,
        queries: query ? { [resource]: query } : undefined,
        observedAt: args.now,
      });
      const result = run.resources[resource]!;
      const outcome = result.hasMore ? "incomplete" : "completed";
      await args.control.finish({
        ...scope,
        scheduleId: required(state.scheduleId, "scheduleId"),
        resource,
        leaseOwner,
        now,
        outcome,
        successfulThrough: outcome === "completed" ? window.end : state.successfulThrough,
        activeWindowStart: outcome === "incomplete" ? window.start : null,
        activeWindowEnd: outcome === "incomplete" ? window.end : null,
        resumeCursor: outcome === "incomplete" ? result.resumeCursor : null,
      });
      output.resources[resource] = { status: outcome, records: result.records, resumeCursor: result.resumeCursor, windowStart: window.start, windowEnd: window.end };
    } catch (error) {
      await args.control.fail({ ...scope, scheduleId: required(state.scheduleId, "scheduleId"), resource, leaseOwner, now, errorCode: safeErrorCode(error) });
      throw error;
    }
  }

  return output;
}

export function next29IncrementalWindow(input: { successfulThrough: string | null; now: string; overlapDays?: number; bootstrapLookbackDays?: number; maxCatchupDays?: number }) {
  const now = new Date(validIso(input.now, "now"));
  const overlapDays = boundedInt(input.overlapDays, 1, 1, 7, "overlapDays");
  const bootstrapDays = boundedInt(input.bootstrapLookbackDays, 2, 1, 31, "bootstrapLookbackDays");
  const maxCatchupDays = boundedInt(input.maxCatchupDays, 7, 1, 31, "maxCatchupDays");
  const floor = new Date(now.getTime() - maxCatchupDays * 86400000);
  const baseline = input.successfulThrough
    ? new Date(validIso(input.successfulThrough, "successfulThrough")).getTime() - overlapDays * 86400000
    : now.getTime() - bootstrapDays * 86400000;
  const start = new Date(Math.max(floor.getTime(), baseline));
  if (start.getTime() > now.getTime()) throw new Error("29Next incremental successful-through checkpoint is in the future.");
  return { start: start.toISOString(), end: now.toISOString(), bounded: true as const };
}

export function next29IncrementalQuery(resource: Next29RuntimeResource, start: string, end: string): Record<string, string> {
  const from = dateOnly(start);
  const to = dateOnly(end);
  if (resource === "orders") return { date_placed_from: from, date_placed_to: to };
  if (resource === "subscriptions") return { date_from: from, date_to: to };
  return { dispute_date_from: from, dispute_date_to: to };
}

function dateOnly(value: string) { return validIso(value, "incremental date").slice(0, 10); }
function validIso(value: string, label: string) { const text = required(value, label); const ms = Date.parse(text); if (!Number.isFinite(ms)) throw new Error(`29Next incremental ${label} must be an ISO timestamp.`); return new Date(ms).toISOString(); }
function requireScope(input: Next29RuntimeScope): Next29RuntimeScope { return { organizationId: required(input.organizationId, "organizationId"), connectionId: required(input.connectionId, "connectionId"), providerAccountId: required(input.providerAccountId, "providerAccountId") }; }
function required(value: unknown, label: string) { const text = String(value ?? "").trim(); if (!text) throw new Error(`29Next incremental ${label} is required.`); return text; }
function boundedInt(value: unknown, fallback: number, min: number, max: number, label: string) { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`29Next incremental ${label} must be an integer between ${min} and ${max}.`); return n; }
function normalizeResources(input: readonly Next29RuntimeResource[] | undefined) { const source = input?.length ? input : (["orders", "subscriptions", "disputes"] as const); return [...new Set(source)]; }
function safeErrorCode(error: unknown) { const text = error instanceof Error ? error.name : "Error"; return String(text || "Error").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80); }

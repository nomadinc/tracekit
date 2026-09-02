import type { Next29IncrementalControl, Next29IncrementalResourceState } from "./incremental-runtime.ts";
import type { Next29RuntimeResource, Next29RuntimeScope } from "./runtime.ts";

export type Next29ScheduleRow = {
  id: string;
  resource: string;
  enabled: boolean;
  successful_through_at: string | null;
  active_window_start_at: string | null;
  active_window_end_at: string | null;
  resume_cursor: string | null;
};

export type Next29ScheduleRepositoryClient = {
  claimSchedule(input: Next29RuntimeScope & { resource: string; now: string; leaseOwner: string; leaseSeconds: number }): Promise<Next29ScheduleRow | null>;
  finishSchedule(input: Next29RuntimeScope & { scheduleId: string; resource: string; leaseOwner: string; now: string; outcome: "completed" | "incomplete"; successfulThrough: string | null; activeWindowStart: string | null; activeWindowEnd: string | null; resumeCursor: string | null; errorCode: null }): Promise<void>;
  failSchedule(input: Next29RuntimeScope & { scheduleId: string; resource: string; leaseOwner: string; now: string; outcome: "failed"; successfulThrough: null; activeWindowStart: null; activeWindowEnd: null; resumeCursor: null; errorCode: string }): Promise<void>;
};

export function createNext29IncrementalControl(client: Next29ScheduleRepositoryClient): Next29IncrementalControl {
  return {
    async claim(input) {
      const providerResource = providerScheduleResource(input.resource);
      const row = await client.claimSchedule({ ...scope(input), resource: providerResource, now: input.now, leaseOwner: input.leaseOwner, leaseSeconds: input.leaseSeconds });
      if (!row) return emptyClaim(input.resource);
      if (row.resource !== providerResource) throw new Error("29Next claimed schedule resource does not match requested resource.");
      return {
        claimed: true,
        scheduleId: required(row.id, "schedule id"),
        enabled: Boolean(row.enabled),
        successfulThrough: nullable(row.successful_through_at),
        activeWindowStart: nullable(row.active_window_start_at),
        activeWindowEnd: nullable(row.active_window_end_at),
        resumeCursor: nullable(row.resume_cursor),
      };
    },
    async finish(input) {
      await client.finishSchedule({ ...scope(input), scheduleId: input.scheduleId, resource: providerScheduleResource(input.resource), leaseOwner: input.leaseOwner, now: input.now, outcome: input.outcome, successfulThrough: input.successfulThrough, activeWindowStart: input.activeWindowStart, activeWindowEnd: input.activeWindowEnd, resumeCursor: input.resumeCursor, errorCode: null });
    },
    async fail(input) {
      await client.failSchedule({ ...scope(input), scheduleId: input.scheduleId, resource: providerScheduleResource(input.resource), leaseOwner: input.leaseOwner, now: input.now, outcome: "failed", successfulThrough: null, activeWindowStart: null, activeWindowEnd: null, resumeCursor: null, errorCode: input.errorCode });
    },
  };
}

export function providerScheduleResource(resource: Next29RuntimeResource) {
  if (resource === "orders") return "next29_orders";
  if (resource === "subscriptions") return "next29_subscriptions";
  if (resource === "disputes") return "next29_disputes";
  throw new Error(`Unsupported 29Next schedule resource: ${resource}.`);
}

function emptyClaim(_resource: Next29RuntimeResource): Next29IncrementalResourceState {
  return { claimed: false, scheduleId: "unclaimed", enabled: false, successfulThrough: null, activeWindowStart: null, activeWindowEnd: null, resumeCursor: null };
}
function scope(input: Next29RuntimeScope): Next29RuntimeScope { return { organizationId: required(input.organizationId,"organizationId"), connectionId: required(input.connectionId,"connectionId"), providerAccountId: required(input.providerAccountId,"providerAccountId") }; }
function required(value: unknown,label:string){const text=String(value??"").trim();if(!text)throw new Error(`29Next schedule ${label} is required.`);return text;}
function nullable(value: unknown){const text=String(value??"").trim();return text||null;}

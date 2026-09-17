import type { Next29DueScheduleTarget, Next29ScheduledWorkerRepository } from "./scheduled-worker.ts";
import type { Next29RuntimeResource } from "./runtime.ts";

export type Next29DueScheduleRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  provider_account_id: string;
  resource: string;
};

export type Next29ScheduledWorkerRepositoryClient = {
  ensureNext29Schedules(input: { connectionId: string | null }): Promise<number>;
  listDueNext29Schedules(input: { now: string; limit: number }): Promise<Next29DueScheduleRow[]>;
};

export function createNext29ScheduledWorkerRepository(client: Next29ScheduledWorkerRepositoryClient): Next29ScheduledWorkerRepository {
  return {
    async ensureSchedules(input) {
      return client.ensureNext29Schedules({ connectionId: input?.connectionId ?? null });
    },
    async listDue(input) {
      const rows = await client.listDueNext29Schedules(input);
      return rows.map(toTarget);
    },
  };
}

export function runtimeResourceFromSchedule(resource: string): Next29RuntimeResource {
  if (resource === "next29_orders") return "orders";
  if (resource === "next29_subscriptions") return "subscriptions";
  if (resource === "next29_disputes") return "disputes";
  throw new Error(`Unsupported 29Next due schedule resource: ${resource}.`);
}

function toTarget(row: Next29DueScheduleRow): Next29DueScheduleTarget {
  return {
    scheduleId: required(row.id,"schedule id"),
    organizationId: required(row.organization_id,"organization id"),
    connectionId: required(row.connection_id,"connection id"),
    providerAccountId: required(row.provider_account_id,"provider account id"),
    resource: runtimeResourceFromSchedule(row.resource),
  };
}
function required(value:unknown,label:string){const text=String(value??"").trim();if(!text)throw new Error(`29Next scheduled repository ${label} is required.`);return text;}

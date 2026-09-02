import { runNext29IncrementalCycle, type Next29IncrementalResult } from "./incremental-runtime.ts";
import type { Next29RuntimePersistence, Next29RuntimeResource, Next29RuntimeScope } from "./runtime.ts";
import type { Next29Client } from "./client.ts";
import type { Next29EvidenceSink } from "./types.ts";
import type { Next29IncrementalControl } from "./incremental-runtime.ts";

export type Next29DueScheduleTarget = Next29RuntimeScope & {
  scheduleId: string;
  resource: Next29RuntimeResource;
};

export type Next29ScheduledWorkerRepository = {
  ensureSchedules(input?: { connectionId?: string | null }): Promise<number>;
  listDue(input: { now: string; limit: number }): Promise<Next29DueScheduleTarget[]>;
};

export type Next29ScheduledWorkerRuntime = {
  client: Pick<Next29Client,
    | "apiVersion"
    | "listOrders" | "getOrder"
    | "listSubscriptions" | "getSubscription"
    | "listDisputes" | "getDispute"
  >;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29RuntimePersistence;
  control: Next29IncrementalControl;
};

export type Next29ScheduledWorkerRequest = {
  repository: Next29ScheduledWorkerRepository;
  loadRuntime(target: Next29DueScheduleTarget): Promise<Next29ScheduledWorkerRuntime>;
  now?: () => string;
  workerId: string;
  dueLimit?: number;
  leaseSeconds?: number;
  bounds?: { maxPagesPerResource?: number; maxRecordsPerResource?: number };
  overlapDays?: number;
  bootstrapLookbackDays?: number;
  maxCatchupDays?: number;
};

export type Next29ScheduledWorkerResult = {
  provider: "next29";
  ensuredSchedules: number;
  dueTargets: number;
  attempted: number;
  completed: number;
  incomplete: number;
  notClaimed: number;
  failed: number;
  results: Array<{ target: Next29DueScheduleTarget; result?: Next29IncrementalResult; errorCode?: string }>;
};

/**
 * Executes one bounded scheduler tick. Discovery never activates a schedule;
 * every target still has to win the M10 atomic claim before any provider read.
 * Failures are isolated per target so one connection/resource cannot starve the
 * remainder of the due batch.
 */
export async function runNext29ScheduledWorker(args: Next29ScheduledWorkerRequest): Promise<Next29ScheduledWorkerResult> {
  const workerId = required(args.workerId, "workerId");
  const dueLimit = boundedInt(args.dueLimit, 25, 1, 100, "dueLimit");
  const leaseSeconds = boundedInt(args.leaseSeconds, 300, 30, 1800, "leaseSeconds");
  const now = validIso((args.now ?? (() => new Date().toISOString()))(), "now");
  const ensuredSchedules = await args.repository.ensureSchedules({ connectionId: null });
  const due = dedupeTargets(await args.repository.listDue({ now, limit: dueLimit }));
  const output: Next29ScheduledWorkerResult = {
    provider: "next29",
    ensuredSchedules,
    dueTargets: due.length,
    attempted: 0,
    completed: 0,
    incomplete: 0,
    notClaimed: 0,
    failed: 0,
    results: [],
  };

  for (const target of due) {
    output.attempted++;
    try {
      const runtime = await args.loadRuntime(target);
      const result = await runNext29IncrementalCycle({
        organizationId: target.organizationId,
        connectionId: target.connectionId,
        providerAccountId: target.providerAccountId,
        client: runtime.client,
        evidenceSink: runtime.evidenceSink,
        persistence: runtime.persistence,
        control: runtime.control,
        resources: [target.resource],
        now: args.now ?? (() => now),
        leaseOwner: workerId,
        leaseSeconds,
        bounds: args.bounds,
        overlapDays: args.overlapDays,
        bootstrapLookbackDays: args.bootstrapLookbackDays,
        maxCatchupDays: args.maxCatchupDays,
      });
      const status = result.resources[target.resource]?.status ?? "not_claimed";
      if (status === "completed") output.completed++;
      else if (status === "incomplete") output.incomplete++;
      else output.notClaimed++;
      output.results.push({ target, result });
    } catch (error) {
      output.failed++;
      output.results.push({ target, errorCode: safeErrorCode(error) });
    }
  }

  return output;
}

function dedupeTargets(input: Next29DueScheduleTarget[]): Next29DueScheduleTarget[] {
  const seen = new Set<string>();
  const output: Next29DueScheduleTarget[] = [];
  for (const raw of input) {
    const target = validateTarget(raw);
    const key = `${target.organizationId}:${target.connectionId}:${target.providerAccountId}:${target.resource}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(target);
  }
  return output;
}

function validateTarget(input: Next29DueScheduleTarget): Next29DueScheduleTarget {
  const resource = input.resource;
  if (!(["orders","subscriptions","disputes"] as const).includes(resource)) throw new Error(`Unsupported 29Next scheduled resource: ${resource}.`);
  return {
    scheduleId: required(input.scheduleId,"scheduleId"),
    organizationId: required(input.organizationId,"organizationId"),
    connectionId: required(input.connectionId,"connectionId"),
    providerAccountId: required(input.providerAccountId,"providerAccountId"),
    resource,
  };
}
function validIso(value:string,label:string){const text=required(value,label);const ms=Date.parse(text);if(!Number.isFinite(ms))throw new Error(`29Next scheduled worker ${label} must be an ISO timestamp.`);return new Date(ms).toISOString();}
function required(value:unknown,label:string){const text=String(value??"").trim();if(!text)throw new Error(`29Next scheduled worker ${label} is required.`);return text;}
function boundedInt(value:unknown,fallback:number,min:number,max:number,label:string){const n=value===undefined?fallback:Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`29Next scheduled worker ${label} must be an integer between ${min} and ${max}.`);return n;}
function safeErrorCode(error:unknown){const text=error instanceof Error?error.name:"Error";return String(text||"Error").replace(/[^A-Za-z0-9_.-]/g,"_").slice(0,80);}

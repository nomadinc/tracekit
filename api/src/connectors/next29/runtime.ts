import type { CommerceProviderCapability } from "../types.ts";
import type { Next29Client } from "./client.ts";
import { runNext29HistoricalOrders, type Next29HistoricalPersistence } from "./historical-sync.ts";
import { runNext29HistoricalSubscriptions, type Next29SubscriptionPersistence } from "./subscription-historical-sync.ts";
import { runNext29HistoricalDisputes, type Next29DisputePersistence } from "./dispute-historical-sync.ts";
import type { Next29EvidenceSink } from "./types.ts";

export const NEXT29_RUNTIME_CAPABILITIES: readonly CommerceProviderCapability[] = [
  { resource: "orders", list: true, get: true, incrementalFilters: ["date_placed_from", "date_placed_to"], notes: "Canonical orders, lines, customers, transactions, refunds, attribution, and product observations. Stable API date filters discover placed orders; webhooks carry later lifecycle changes." },
  { resource: "subscriptions", list: true, get: true, incrementalFilters: ["date_from", "date_to", "next_renewal_date_from", "next_renewal_date_to", "cancel_date_from", "cancel_date_to", "status"], notes: "Canonical subscription lifecycle, lines, and rebill-order lineage. Incremental creation windows are supplemented by signed lifecycle webhooks." },
  { resource: "disputes", list: true, get: true, incrementalFilters: ["dispute_date_from", "dispute_date_to"], notes: "Canonical dispute lifecycle with deterministic transaction/order reconciliation. Date windows discover disputes; signed dispute webhooks carry lifecycle updates." },
  { resource: "webhooks", list: false, get: false, incrementalFilters: [], notes: "Signed inbound order, transaction, subscription, and dispute events; registration is not activated by this runtime." },
] as const;

export const NEXT29_RUNTIME_RESOURCES = ["orders", "subscriptions", "disputes"] as const;
export type Next29RuntimeResource = typeof NEXT29_RUNTIME_RESOURCES[number];

export type Next29RuntimeScope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
};

export type Next29RuntimePersistence = {
  orders: Next29HistoricalPersistence;
  subscriptions: Next29SubscriptionPersistence;
  disputes: Next29DisputePersistence;
};

export type Next29BoundedBackfillRequest = Next29RuntimeScope & {
  client: Pick<Next29Client,
    | "apiVersion"
    | "listOrders" | "getOrder"
    | "listSubscriptions" | "getSubscription"
    | "listDisputes" | "getDispute"
  >;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29RuntimePersistence;
  resources?: readonly Next29RuntimeResource[];
  bounds?: {
    maxPagesPerResource?: number;
    maxRecordsPerResource?: number;
  };
  cursors?: Partial<Record<Next29RuntimeResource, string | null>>;
  queries?: Partial<Record<Next29RuntimeResource, Record<string, string | number | boolean | null | undefined>>>;
  observedAt?: () => string;
};

export type Next29BoundedBackfillResult = {
  provider: "next29";
  bounded: true;
  resources: Partial<Record<Next29RuntimeResource, {
    syncRunId: string;
    pages: number;
    records: number;
    hasMore: boolean;
    resumeCursor: string | null;
  }>>;
  totals: { pages: number; records: number };
};

/**
 * Runs the provider's historical resource readers through one explicit bounded
 * orchestration surface. It is intentionally operator-invoked: no cron, queue,
 * webhook registration, or connection activation occurs here.
 */
export async function runNext29BoundedBackfill(args: Next29BoundedBackfillRequest): Promise<Next29BoundedBackfillResult> {
  const scope = requireScope(args);
  const resources = normalizeResources(args.resources);
  const maxPages = bound(args.bounds?.maxPagesPerResource, 3, 25, "maxPagesPerResource");
  const maxRecords = bound(args.bounds?.maxRecordsPerResource, 100, 500, "maxRecordsPerResource");
  const results: Next29BoundedBackfillResult["resources"] = {};
  let totalPages = 0;
  let totalRecords = 0;

  for (const resource of resources) {
    if (resource === "orders") {
      const result = await runNext29HistoricalOrders({
        ...scope,
        client: args.client,
        evidenceSink: args.evidenceSink,
        persistence: args.persistence.orders,
        maxPages,
        maxOrders: maxRecords,
        startCursor: args.cursors?.orders,
        query: args.queries?.orders,
        observedAt: args.observedAt,
      });
      results.orders = summarize(result);
      totalPages += result.pages;
      totalRecords += result.records;
      continue;
    }

    if (resource === "subscriptions") {
      const result = await runNext29HistoricalSubscriptions({
        ...scope,
        client: args.client,
        evidenceSink: args.evidenceSink,
        persistence: args.persistence.subscriptions,
        maxPages,
        maxSubscriptions: maxRecords,
        startCursor: args.cursors?.subscriptions,
        query: args.queries?.subscriptions,
        observedAt: args.observedAt,
      });
      results.subscriptions = summarize(result);
      totalPages += result.pages;
      totalRecords += result.records;
      continue;
    }

    const result = await runNext29HistoricalDisputes({
      ...scope,
      client: args.client,
      evidenceSink: args.evidenceSink,
      persistence: args.persistence.disputes,
      maxPages,
      maxDisputes: maxRecords,
      startCursor: args.cursors?.disputes,
      query: args.queries?.disputes,
      observedAt: args.observedAt,
    });
    results.disputes = summarize(result);
    totalPages += result.pages;
    totalRecords += result.records;
  }

  return { provider: "next29", bounded: true, resources: results, totals: { pages: totalPages, records: totalRecords } };
}

export function next29RuntimeCapability(resource: string) {
  return NEXT29_RUNTIME_CAPABILITIES.find((capability) => capability.resource === resource) ?? null;
}

function normalizeResources(input: readonly Next29RuntimeResource[] | undefined): Next29RuntimeResource[] {
  const source = input?.length ? input : NEXT29_RUNTIME_RESOURCES;
  const result: Next29RuntimeResource[] = [];
  for (const resource of source) {
    if (!NEXT29_RUNTIME_RESOURCES.includes(resource)) throw new Error(`Unsupported 29Next runtime resource: ${resource}.`);
    if (!result.includes(resource)) result.push(resource);
  }
  return result;
}

function requireScope(input: Next29RuntimeScope): Next29RuntimeScope {
  const organizationId = required(input.organizationId, "organizationId");
  const connectionId = required(input.connectionId, "connectionId");
  const providerAccountId = required(input.providerAccountId, "providerAccountId");
  return { organizationId, connectionId, providerAccountId };
}

function bound(value: unknown, fallback: number, maximum: number, label: string) {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > maximum) throw new Error(`29Next ${label} must be an integer between 1 and ${maximum}.`);
  return candidate;
}

function required(value: unknown, label: string) { const text = String(value ?? "").trim(); if (!text) throw new Error(`29Next runtime ${label} is required.`); return text; }
function summarize(result: { syncRunId: string; pages: number; records: number; hasMore: boolean; resumeCursor: string | null }) { return { syncRunId: result.syncRunId, pages: result.pages, records: result.records, hasMore: result.hasMore, resumeCursor: result.resumeCursor }; }

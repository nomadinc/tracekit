import type { CommerceProviderCapability } from "../types.ts";
import type { Next29Client } from "./client.ts";
import { runNext29HistoricalOrders, type Next29HistoricalPersistence } from "./historical-sync.ts";
import { runNext29HistoricalSubscriptions, type Next29SubscriptionPersistence } from "./subscription-historical-sync.ts";
import { runNext29HistoricalDisputes, type Next29DisputePersistence } from "./dispute-historical-sync.ts";
import type { Next29EvidenceSink } from "./types.ts";

export const NEXT29_RUNTIME_CAPABILITIES: readonly CommerceProviderCapability[] = [
  { resource: "orders", list: true, get: true, incrementalFilters: ["date_placed", "created_at", "updated_at"], notes: "Canonical orders, lines, customers, transactions, refunds, attribution, and product observations." },
  { resource: "subscriptions", list: true, get: true, incrementalFilters: ["date_created", "next_renewal_date", "status"], notes: "Canonical subscription lifecycle, lines, and rebill-order lineage." },
  { resource: "disputes", list: true, get: true, incrementalFilters: ["created_at", "happened_at", "status", "type"], notes: "Canonical dispute lifecycle with deterministic transaction/order reconciliation." },
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

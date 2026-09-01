import type { Next29Client } from "./client.ts";
import { next29SubscriptionEvidence, persistNext29Evidence } from "./evidence.ts";
import { normalizeNext29Subscription, type Next29CanonicalSubscription } from "./subscription.ts";
import type { Next29EvidenceSink } from "./types.ts";

export type Next29SubscriptionSyncScope = { organizationId: string; connectionId: string; providerAccountId: string };
export type Next29SubscriptionCheckpoint = { page: number; next: string | null; lastSubscriptionId: string | null };

export type Next29SubscriptionPersistence = {
  beginRun(input: Next29SubscriptionSyncScope & { resource: "subscriptions"; checkpoint: Next29SubscriptionCheckpoint }): Promise<{ syncRunId: string }>;
  persistSubscription(input: Next29SubscriptionSyncScope & { syncRunId: string; normalized: Next29CanonicalSubscription; evidence: { storageReference: string; payloadHash: string; byteSize: number }; rawSubscription: unknown }): Promise<void>;
  appendCheckpoint(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; recordsSeen: number }): Promise<void>;
  completeRun(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; pagesCompleted: number; recordsSeen: number; hasMore: boolean }): Promise<void>;
  failRun(input: Next29SubscriptionSyncScope & { syncRunId: string; checkpoint: Next29SubscriptionCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
};

export async function runNext29HistoricalSubscriptions(args: Next29SubscriptionSyncScope & {
  client: Pick<Next29Client, "listSubscriptions" | "getSubscription" | "apiVersion">;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29SubscriptionPersistence;
  maxPages?: number;
  maxSubscriptions?: number;
  startCursor?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  observedAt?: () => string;
}) {
  const scope = requireScope(args);
  const maxPages = bounded(args.maxPages, 3, 25, "maxPages");
  const maxSubscriptions = bounded(args.maxSubscriptions, 100, 500, "maxSubscriptions");
  const observedAt = args.observedAt ?? (() => new Date().toISOString());
  let cursor = clean(args.startCursor);
  let checkpoint: Next29SubscriptionCheckpoint = { page: 1, next: cursor, lastSubscriptionId: null };
  const run = await args.persistence.beginRun({ ...scope, resource: "subscriptions", checkpoint });
  const syncRunId = required(run.syncRunId, "syncRunId");
  let pages = 0;
  let records = 0;
  let hasMore = false;

  try {
    while (pages < maxPages && records < maxSubscriptions) {
      const page = await args.client.listSubscriptions({ cursor, query: pages === 0 && !cursor ? args.query : undefined });
      pages += 1;
      for (const summary of page.results) {
        if (records >= maxSubscriptions) break;
        const id = required(summary.id, "subscription id");
        const detail = await args.client.getSubscription(id);
        const normalized = normalizeNext29Subscription(detail.item);
        if (normalized.providerSubscriptionId !== id) throw new Error("29Next subscription detail identity does not match the list result identity.");
        const evidence = await persistNext29Evidence(args.evidenceSink, scope, next29SubscriptionEvidence({ apiVersion: args.client.apiVersion, subscriptionId: id, observedAt: observedAt(), payload: detail.item }));
        await args.persistence.persistSubscription({ ...scope, syncRunId, normalized, evidence, rawSubscription: detail.item });
        records += 1;
        checkpoint = { page: pages, next: page.next, lastSubscriptionId: id };
      }
      await args.persistence.appendCheckpoint({ ...scope, syncRunId, checkpoint, recordsSeen: records });
      hasMore = Boolean(page.next) && (records >= maxSubscriptions || pages >= maxPages);
      if (!page.next || records >= maxSubscriptions) break;
      cursor = cursorFromNext(page.next);
    }
    await args.persistence.completeRun({ ...scope, syncRunId, checkpoint, pagesCompleted: pages, recordsSeen: records, hasMore });
    return { syncRunId, pages, records, checkpoint, hasMore, resumeCursor: hasMore && checkpoint.next ? cursorFromNext(checkpoint.next) : null, bounded: true as const };
  } catch (error) {
    await args.persistence.failRun({ ...scope, syncRunId, checkpoint, pagesCompleted: pages, recordsSeen: records, error: safeError(error) });
    throw error;
  }
}

export function cursorFromNext(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("29Next subscription pagination returned an invalid next URL."); }
  const cursor = url.searchParams.get("cursor");
  if (!cursor) throw new Error("29Next subscription pagination next URL did not contain a cursor.");
  return cursor;
}

function requireScope(input: Next29SubscriptionSyncScope) { return { organizationId: required(input.organizationId, "organizationId"), connectionId: required(input.connectionId, "connectionId"), providerAccountId: required(input.providerAccountId, "providerAccountId") }; }
function required(value: unknown, label: string) { const text = String(value ?? "").trim(); if (!text) throw new Error(`29Next subscription ingestion requires ${label}.`); return text; }
function clean(value: unknown) { const text = String(value ?? "").trim(); return text || null; }
function bounded(value: unknown, fallback: number, maximum: number, label: string) { const result = value === undefined ? fallback : Number(value); if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`29Next subscription ${label} must be between 1 and ${maximum}.`); return result; }
function safeError(error: unknown) { return (error instanceof Error ? error.message : String(error ?? "unknown error")).replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500); }

import type { Next29Client } from "./client.ts";
import { next29DisputeEvidence, persistNext29Evidence } from "./evidence.ts";
import { normalizeNext29Dispute, type Next29CanonicalDispute } from "./dispute.ts";
import type { Next29EvidenceSink } from "./types.ts";

export type Next29DisputeScope = { organizationId: string; connectionId: string; providerAccountId: string };
export type Next29DisputeCheckpoint = { page: number; next: string | null; lastSourceObjectId: string | null };

export type Next29DisputePersistence = {
  beginRun(input: Next29DisputeScope & { resource: "disputes"; checkpoint: Next29DisputeCheckpoint }): Promise<{ syncRunId: string }>;
  persistDispute(input: Next29DisputeScope & { syncRunId: string; normalized: Next29CanonicalDispute; evidence: { storageReference: string; payloadHash: string; byteSize: number }; rawDispute: unknown }): Promise<void>;
  appendCheckpoint(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; recordsSeen: number }): Promise<void>;
  completeRun(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; pagesCompleted: number; recordsSeen: number; hasMore: boolean }): Promise<void>;
  failRun(input: Next29DisputeScope & { syncRunId: string; checkpoint: Next29DisputeCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
};

export type RunNext29HistoricalDisputesArgs = Next29DisputeScope & {
  client: Pick<Next29Client, "listDisputes" | "getDispute" | "apiVersion">;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29DisputePersistence;
  maxPages?: number;
  maxDisputes?: number;
  startCursor?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  observedAt?: () => string;
};

export async function runNext29HistoricalDisputes(args: RunNext29HistoricalDisputesArgs) {
  const scope = requireScope(args);
  const maxPages = bound(args.maxPages, 3, 25, "maxPages");
  const maxDisputes = bound(args.maxDisputes, 100, 500, "maxDisputes");
  const observedAt = args.observedAt ?? (() => new Date().toISOString());
  let cursor = text(args.startCursor);
  let checkpoint: Next29DisputeCheckpoint = { page: 1, next: cursor, lastSourceObjectId: null };
  const run = await args.persistence.beginRun({ ...scope, resource: "disputes", checkpoint });
  const syncRunId = required(run.syncRunId, "syncRunId");
  let pages = 0;
  let records = 0;
  let hasMore = false;

  try {
    while (pages < maxPages && records < maxDisputes) {
      const page = await args.client.listDisputes({ cursor, query: pages === 0 && !cursor ? args.query : undefined });
      pages += 1;
      for (const summary of page.results) {
        if (records >= maxDisputes) break;
        const sourceObjectId = required(summary.id, "29Next dispute id");
        const detail = await args.client.getDispute(sourceObjectId);
        const normalized = normalizeNext29Dispute(detail.item);
        if (normalized.providerDisputeId !== sourceObjectId) throw new Error("29Next dispute detail identity does not match the list result identity.");
        const evidence = await persistNext29Evidence(args.evidenceSink, scope, next29DisputeEvidence({ apiVersion: args.client.apiVersion, disputeId: sourceObjectId, observedAt: observedAt(), payload: detail.item }));
        await args.persistence.persistDispute({ ...scope, syncRunId, normalized, evidence, rawDispute: detail.item });
        records += 1;
        checkpoint = { page: pages, next: page.next, lastSourceObjectId: sourceObjectId };
      }
      await args.persistence.appendCheckpoint({ ...scope, syncRunId, checkpoint, recordsSeen: records });
      hasMore = Boolean(page.next) && (records >= maxDisputes || pages >= maxPages);
      if (!page.next || records >= maxDisputes) break;
      cursor = cursorFromNextUrl(page.next);
    }
    await args.persistence.completeRun({ ...scope, syncRunId, checkpoint, pagesCompleted: pages, recordsSeen: records, hasMore });
    return { syncRunId, pages, records, checkpoint, hasMore, resumeCursor: checkpoint.next ? cursorFromNextUrl(checkpoint.next) : null, bounded: true as const };
  } catch (error) {
    await args.persistence.failRun({ ...scope, syncRunId, checkpoint, pagesCompleted: pages, recordsSeen: records, error: safeError(error) });
    throw error;
  }
}

export function cursorFromNextUrl(value: string) { const url = new URL(value); const cursor = url.searchParams.get("cursor"); if (!cursor) throw new Error("29Next dispute pagination next URL did not contain a cursor."); return cursor; }
function requireScope(input: Next29DisputeScope) { return { organizationId: required(input.organizationId, "organizationId"), connectionId: required(input.connectionId, "connectionId"), providerAccountId: required(input.providerAccountId, "providerAccountId") }; }
function required(value: unknown, label: string) { const result = String(value ?? "").trim(); if (!result) throw new Error(`29Next dispute ingestion requires ${label}.`); return result; }
function text(value: unknown) { const result = String(value ?? "").trim(); return result || null; }
function bound(value: unknown, fallback: number, maximum: number, label: string) { const result = value === undefined ? fallback : Number(value); if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`29Next dispute ${label} must be between 1 and ${maximum}.`); return result; }
function safeError(error: unknown) { return (error instanceof Error ? error.message : String(error ?? "unknown error")).replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500); }

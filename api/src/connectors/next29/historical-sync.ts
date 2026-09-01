import { next29OrderEvidence, persistNext29Evidence } from "./evidence.ts";
import { normalizeNext29Order, type NormalizedNext29Order } from "./normalize.ts";
import type { Next29Client } from "./client.ts";
import type { Next29EvidenceSink } from "./types.ts";

export type Next29HistoricalScope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
};

export type Next29HistoricalCheckpoint = {
  page: number;
  next: string | null;
  lastSourceObjectId: string | null;
};

export type Next29HistoricalPersistence = {
  beginRun(input: Next29HistoricalScope & { resource: "orders"; checkpoint: Next29HistoricalCheckpoint }): Promise<{ syncRunId: string }>;
  persistOrder(input: Next29HistoricalScope & {
    syncRunId: string;
    normalized: NormalizedNext29Order;
    evidence: { storageReference: string; payloadHash: string; byteSize: number };
    rawOrder: unknown;
  }): Promise<void>;
  appendCheckpoint(input: Next29HistoricalScope & {
    syncRunId: string;
    checkpoint: Next29HistoricalCheckpoint;
    recordsSeen: number;
  }): Promise<void>;
  completeRun(input: Next29HistoricalScope & {
    syncRunId: string;
    checkpoint: Next29HistoricalCheckpoint;
    pagesCompleted: number;
    recordsSeen: number;
  }): Promise<void>;
  failRun(input: Next29HistoricalScope & {
    syncRunId: string;
    checkpoint: Next29HistoricalCheckpoint;
    pagesCompleted: number;
    recordsSeen: number;
    error: string;
  }): Promise<void>;
};

export type RunNext29HistoricalOrdersArgs = Next29HistoricalScope & {
  client: Pick<Next29Client, "listOrders" | "getOrder" | "apiVersion">;
  evidenceSink: Next29EvidenceSink;
  persistence: Next29HistoricalPersistence;
  maxPages?: number;
  maxOrders?: number;
  query?: Record<string, string | number | boolean | null | undefined>;
  observedAt?: () => string;
};

export type Next29HistoricalOrdersResult = {
  syncRunId: string;
  pages: number;
  records: number;
  checkpoint: Next29HistoricalCheckpoint;
  bounded: true;
};

export async function runNext29HistoricalOrders(args: RunNext29HistoricalOrdersArgs): Promise<Next29HistoricalOrdersResult> {
  const scope = requireScope(args);
  const maxPages = boundedPositiveInteger(args.maxPages, 3, 25, "maxPages");
  const maxOrders = boundedPositiveInteger(args.maxOrders, 100, 500, "maxOrders");
  const observedAt = args.observedAt ?? (() => new Date().toISOString());
  let checkpoint: Next29HistoricalCheckpoint = { page: 1, next: null, lastSourceObjectId: null };
  const run = await args.persistence.beginRun({ ...scope, resource: "orders", checkpoint });
  const syncRunId = requiredText(run.syncRunId, "syncRunId");
  let pages = 0;
  let records = 0;
  let nextCursor: string | null = null;

  try {
    while (pages < maxPages && records < maxOrders) {
      const page = await args.client.listOrders({
        cursor: nextCursor,
        query: pages === 0 ? args.query : undefined,
      });
      pages += 1;

      for (const summary of page.results) {
        if (records >= maxOrders) break;
        const sourceObjectId = requiredText(summary.number, "29Next order number");
        const detail = await args.client.getOrder(sourceObjectId);
        const normalized = normalizeNext29Order(detail.item);
        if (normalized.sourceObjectId !== sourceObjectId) {
          throw new Error("29Next order detail identity does not match the list result identity.");
        }
        const evidence = await persistNext29Evidence(
          args.evidenceSink,
          scope,
          next29OrderEvidence({
            apiVersion: args.client.apiVersion,
            orderNumber: sourceObjectId,
            observedAt: observedAt(),
            payload: detail.item,
          }),
        );
        await args.persistence.persistOrder({
          ...scope,
          syncRunId,
          normalized,
          evidence,
          rawOrder: detail.item,
        });
        records += 1;
        checkpoint = {
          page: pages,
          next: page.next,
          lastSourceObjectId: sourceObjectId,
        };
      }

      await args.persistence.appendCheckpoint({ ...scope, syncRunId, checkpoint, recordsSeen: records });
      if (!page.next || records >= maxOrders) break;
      nextCursor = cursorFromNextUrl(page.next);
    }

    await args.persistence.completeRun({ ...scope, syncRunId, checkpoint, pagesCompleted: pages, recordsSeen: records });
    return { syncRunId, pages, records, checkpoint, bounded: true };
  } catch (error) {
    await args.persistence.failRun({
      ...scope,
      syncRunId,
      checkpoint,
      pagesCompleted: pages,
      recordsSeen: records,
      error: safeError(error),
    });
    throw error;
  }
}

export function cursorFromNextUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("29Next historical pagination returned an invalid next URL.");
  }
  const cursor = url.searchParams.get("cursor");
  if (!cursor) throw new Error("29Next historical pagination next URL did not contain a cursor.");
  return cursor;
}

function requireScope(input: Next29HistoricalScope): Next29HistoricalScope {
  return {
    organizationId: requiredText(input.organizationId, "organizationId"),
    connectionId: requiredText(input.connectionId, "connectionId"),
    providerAccountId: requiredText(input.providerAccountId, "providerAccountId"),
  };
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`29Next historical ingestion requires ${label}.`);
  return text;
}

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number, label: string) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new Error(`29Next historical ${label} must be between 1 and ${maximum}.`);
  }
  return result;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").slice(0, 500);
}

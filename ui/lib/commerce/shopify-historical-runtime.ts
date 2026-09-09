import "server-only";

import { createShopifyHistoricalPageReader } from "./shopify-core/historical-reader";
import { createShopifyNormalizedWriter } from "./shopify-core/normalized-writer";
import { createShopifyPersistenceRepository } from "./shopify-core/repository";
import { createShopifyCommerceRepositoryClient, shopifyResumeCheckpoint } from "./shopify-core/supabase-repository";
import { initialShopifyCheckpoint, normalizeShopifyCheckpoint, type ShopifyResource } from "./shopify-core/resources";
import { runShopifyReadSync } from "./shopify-core/sync";

const BACKFILL_PREFIX = "shopify_backfill";

export async function runShopifyHistoricalResource(args: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  historicalCutoff: string;
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  maxPages?: number;
  pageSize?: number;
}) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) throw new Error("Shopify historical persistence is unavailable.");

  const cutoff = normalizeCutoff(args.historicalCutoff);
  const config = { url, serviceRoleKey, syncTypePrefix: BACKFILL_PREFIX };
  const client = createShopifyCommerceRepositoryClient(config);
  const latest = await client.latestShopifyRun(args);
  if (latest?.status === "completed") {
    const row = await client.latestShopifyCheckpoint({ ...args, syncRunId: latest.id });
    const checkpoint = shopifyResumeCheckpoint(row);
    if (checkpoint.cursor === null && checkpoint.historicalCutoff === cutoff && checkpoint.page > 1) {
      return { resource: args.resource, pages: 0, records: 0, checkpoint, alreadyComplete: true };
    }
  }

  const persistence = createShopifyPersistenceRepository({
    client,
    writeRecords: createShopifyNormalizedWriter({ url, serviceRoleKey }),
  });
  const readPage = createShopifyHistoricalPageReader({
    shopDomain: args.shopDomain,
    accessToken: args.accessToken,
    apiVersion: args.apiVersion,
    pageSize: args.pageSize,
  });
  const initial = normalizeShopifyCheckpoint({ ...initialShopifyCheckpoint(), historicalCutoff: cutoff });
  const result = await runShopifyReadSync({
    organizationId: args.organizationId,
    connectionId: args.connectionId,
    providerAccountId: args.providerAccountId,
    resource: args.resource,
    readPage,
    persistence,
    maxPages: args.maxPages,
    initialCheckpoint: initial,
    allowPartialCompletion: true,
  });
  return { ...result, alreadyComplete: result.checkpoint.cursor === null };
}

function normalizeCutoff(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) throw new Error("Shopify historical cutoff is invalid.");
  return date.toISOString();
}

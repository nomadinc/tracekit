import "server-only";

import { createShopifyAdminPageReader } from "./shopify-core/admin-reader";
import { createShopifyPersistenceRuntime } from "./shopify-core/runtime";
import { initialShopifyCheckpoint, normalizeShopifyCheckpoint, type ShopifyResource } from "./shopify-core/resources";
import { runShopifyReadSync } from "./shopify-core/sync";

export async function runShopifyIncrementalResource(args: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  maxPages?: number;
  pageSize?: number;
  initialUpdatedAt?: string;
}) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) throw new Error("Shopify incremental persistence is unavailable.");

  const readPage = createShopifyAdminPageReader({
    shopDomain: args.shopDomain,
    accessToken: args.accessToken,
    apiVersion: args.apiVersion,
    pageSize: args.pageSize,
  });
  const persistence = createShopifyPersistenceRuntime({ url, serviceRoleKey });
  const initialCheckpoint = args.initialUpdatedAt
    ? normalizeShopifyCheckpoint({ ...initialShopifyCheckpoint(), updatedAt: args.initialUpdatedAt })
    : undefined;

  return runShopifyReadSync({
    organizationId: args.organizationId,
    connectionId: args.connectionId,
    providerAccountId: args.providerAccountId,
    resource: args.resource,
    readPage,
    persistence,
    maxPages: args.maxPages,
    initialCheckpoint,
  });
}

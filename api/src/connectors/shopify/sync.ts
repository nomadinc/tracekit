import type { ShopifyAdminClient } from "./client";
import {
  initialShopifyCheckpoint,
  listShopifyCustomersPage,
  listShopifyOrdersPage,
  listShopifyProductsPage,
  type ShopifyIncrementalCheckpoint,
  type ShopifyIncrementalResource,
  type ShopifyResourcePage,
} from "./resources";

export type ShopifyReadSyncOptions = {
  resource: ShopifyIncrementalResource;
  updatedAt: string;
  checkpoint?: ShopifyIncrementalCheckpoint | null;
  pageSize?: number;
  maxPages?: number;
};

export type ShopifyReadSyncResult = {
  resource: ShopifyIncrementalResource;
  pagesRead: number;
  recordsRead: number;
  checkpoint: ShopifyIncrementalCheckpoint;
  complete: boolean;
};

export type ShopifyReadSyncPageHandler = (page: ShopifyResourcePage<any>) => void | Promise<void>;

function pageReader(resource: ShopifyIncrementalResource) {
  if (resource === "products") return listShopifyProductsPage;
  if (resource === "customers") return listShopifyCustomersPage;
  return listShopifyOrdersPage;
}

function normalizeMaxPages(value?: number) {
  const requested = Number(value ?? 1000);
  if (!Number.isFinite(requested)) return 1000;
  return Math.max(1, Math.min(10000, Math.trunc(requested)));
}

export async function runShopifyReadSync(args: {
  client: Pick<ShopifyAdminClient, "graphql">;
  options: ShopifyReadSyncOptions;
  onPage?: ShopifyReadSyncPageHandler;
}): Promise<ShopifyReadSyncResult> {
  const resource = args.options.resource;
  let checkpoint = args.options.checkpoint ?? initialShopifyCheckpoint(resource, args.options.updatedAt);
  if (checkpoint.resource !== resource) {
    throw new Error(`Shopify sync checkpoint resource mismatch: expected ${resource}.`);
  }

  const readPage = pageReader(resource);
  const maxPages = normalizeMaxPages(args.options.maxPages);
  let pagesRead = 0;
  let recordsRead = 0;

  while (pagesRead < maxPages) {
    const page = await readPage(args.client, checkpoint, args.options.pageSize);
    pagesRead += 1;
    recordsRead += page.nodes.length;

    if (args.onPage) await args.onPage(page);
    checkpoint = page.checkpoint;

    if (!page.pageInfo.hasNextPage) {
      return { resource, pagesRead, recordsRead, checkpoint, complete: true };
    }

    if (!checkpoint.cursor) {
      throw new Error("Shopify pagination reported another page without an end cursor.");
    }
  }

  return { resource, pagesRead, recordsRead, checkpoint, complete: false };
}

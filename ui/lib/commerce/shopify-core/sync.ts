import { initialShopifyCheckpoint, normalizeShopifyCheckpoint, type ShopifyCheckpoint, type ShopifyResource, type ShopifySyncPage } from "./resources";
import type { ShopifyPersistence } from "./persistence";

export type ShopifyPageReader = (args: {
  resource: ShopifyResource;
  checkpoint: ShopifyCheckpoint;
}) => Promise<ShopifySyncPage>;

export type RunShopifyReadSyncArgs = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  readPage: ShopifyPageReader;
  persistence: ShopifyPersistence;
  maxPages?: number;
};

export type ShopifyReadSyncResult = {
  resource: ShopifyResource;
  pages: number;
  records: number;
  checkpoint: ShopifyCheckpoint;
};

export async function runShopifyReadSync(args: RunShopifyReadSyncArgs): Promise<ShopifyReadSyncResult> {
  const scope = requireScope(args);
  const existing = await args.persistence.loadState({ ...scope, resource: args.resource });
  let checkpoint = normalizeShopifyCheckpoint(existing?.checkpoint || initialShopifyCheckpoint());
  const maxPages = Number.isInteger(args.maxPages) && Number(args.maxPages) > 0 ? Number(args.maxPages) : 1000;

  await args.persistence.begin({ ...scope, resource: args.resource, checkpoint });

  let pages = 0;
  let records = 0;
  try {
    while (pages < maxPages) {
      const page = await args.readPage({ resource: args.resource, checkpoint });
      if (page.resource !== args.resource) throw new Error("Shopify page resource does not match requested sync resource.");
      if (normalizeShopifyCheckpoint(page.checkpoint).page !== checkpoint.page || normalizeShopifyCheckpoint(page.checkpoint).cursor !== checkpoint.cursor) {
        throw new Error("Shopify page checkpoint does not match requested checkpoint.");
      }

      await args.persistence.persistPage({ ...scope, page });
      pages += 1;
      records += page.nodes.length;
      checkpoint = normalizeShopifyCheckpoint(page.nextCheckpoint);

      if (!page.hasNextPage) {
        await args.persistence.complete({ ...scope, resource: args.resource, checkpoint });
        return { resource: args.resource, pages, records, checkpoint };
      }
    }

    throw new Error(`Shopify sync exceeded maxPages=${maxPages}.`);
  } catch (error) {
    await args.persistence.fail({
      ...scope,
      resource: args.resource,
      checkpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function requireScope(args: Pick<RunShopifyReadSyncArgs, "organizationId" | "connectionId" | "providerAccountId">) {
  const organizationId = String(args.organizationId || "").trim();
  const connectionId = String(args.connectionId || "").trim();
  const providerAccountId = String(args.providerAccountId || "").trim();
  if (!organizationId || !connectionId || !providerAccountId) throw new Error("Shopify sync requires tenant, connection, and provider account scope.");
  return { organizationId, connectionId, providerAccountId };
}

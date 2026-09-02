import { createShopifyNormalizedWriter } from "./normalized-writer";
import { createShopifyPersistenceRepository } from "./repository";
import { createShopifyCommerceRepositoryClient } from "./supabase-repository";
import type { ShopifyPersistence } from "./persistence";

type ShopifyPersistenceRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
};

export function createShopifyPersistenceRuntime(config: ShopifyPersistenceRuntimeConfig): ShopifyPersistence {
  const client = createShopifyCommerceRepositoryClient(config);
  const writeRecords = createShopifyNormalizedWriter(config);
  return createShopifyPersistenceRepository({ client, writeRecords });
}

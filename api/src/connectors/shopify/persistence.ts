import type { ShopifyCheckpoint, ShopifyResource, ShopifyResourceNode, ShopifySyncPage } from "./resources";

export type ShopifySyncState = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  checkpoint: ShopifyCheckpoint;
  status: "idle" | "running" | "failed";
  lastError: string | null;
};

export type ShopifyPersistence = {
  loadState(args: { organizationId: string; connectionId: string; providerAccountId: string; resource: ShopifyResource }): Promise<ShopifySyncState | null>;
  begin(args: { organizationId: string; connectionId: string; providerAccountId: string; resource: ShopifyResource; checkpoint: ShopifyCheckpoint }): Promise<void>;
  persistPage(args: { organizationId: string; connectionId: string; providerAccountId: string; page: ShopifySyncPage }): Promise<void>;
  complete(args: { organizationId: string; connectionId: string; providerAccountId: string; resource: ShopifyResource; checkpoint: ShopifyCheckpoint }): Promise<void>;
  fail(args: { organizationId: string; connectionId: string; providerAccountId: string; resource: ShopifyResource; checkpoint: ShopifyCheckpoint; error: string }): Promise<void>;
};

export type ShopifyPersistedRecord = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  providerObjectId: string;
  providerUpdatedAt: string | null;
  payload: ShopifyResourceNode;
};

export function shopifyProviderObjectId(node: ShopifyResourceNode): string {
  const id = String((node as { id?: string }).id || "").trim();
  if (!id) throw new Error("Shopify resource node is missing its durable provider id.");
  return id;
}

export function shopifyProviderUpdatedAt(node: ShopifyResourceNode): string | null {
  const value = String((node as { updatedAt?: string }).updatedAt || "").trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function recordsForShopifyPage(args: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  page: ShopifySyncPage;
}): ShopifyPersistedRecord[] {
  const organizationId = String(args.organizationId || "").trim();
  const connectionId = String(args.connectionId || "").trim();
  const providerAccountId = String(args.providerAccountId || "").trim();
  if (!organizationId || !connectionId || !providerAccountId) {
    throw new Error("Shopify persistence requires organization, connection, and provider account scope.");
  }
  return args.page.nodes.map((node) => ({
    organizationId,
    connectionId,
    providerAccountId,
    resource: args.page.resource,
    providerObjectId: shopifyProviderObjectId(node),
    providerUpdatedAt: shopifyProviderUpdatedAt(node),
    payload: node,
  }));
}

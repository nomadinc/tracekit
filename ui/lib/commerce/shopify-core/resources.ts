export type ShopifyResource = "orders" | "products" | "customers";

export type ShopifyCheckpoint = {
  cursor: string | null;
  updatedAt: string | null;
  page: number;
  /**
   * Independent cursor for the bounded financial-status reconciliation pass.
   *
   * Shopify refunds expose their own updatedAt, but creating a refund does not
   * reliably advance Order.updatedAt. Orders therefore need a second durable
   * traversal over refunded / partially-refunded orders so financial changes
   * cannot disappear behind the normal order updatedAt watermark.
   * Optional for backward compatibility with checkpoints written before M5.
   */
  financialCursor?: string | null;
};

export type ShopifyResourceNode = {
  id: string;
  updatedAt?: string | null;
  [key: string]: unknown;
};

export type ShopifySyncPage = {
  resource: ShopifyResource;
  nodes: ShopifyResourceNode[];
  checkpoint: ShopifyCheckpoint;
  nextCheckpoint: ShopifyCheckpoint;
  hasNextPage: boolean;
};

export function initialShopifyCheckpoint(): ShopifyCheckpoint {
  return { cursor: null, updatedAt: null, page: 1, financialCursor: null };
}

export function normalizeShopifyCheckpoint(value: Partial<ShopifyCheckpoint> | null | undefined): ShopifyCheckpoint {
  return {
    cursor: normalizeCursor(value?.cursor),
    updatedAt: normalizeIso(value?.updatedAt),
    page: Number.isInteger(value?.page) && Number(value?.page) > 0 ? Number(value?.page) : 1,
    financialCursor: normalizeCursor(value?.financialCursor),
  };
}

function normalizeCursor(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIso(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type ShopifyResource = "orders" | "products" | "customers";

export type ShopifyCheckpoint = {
  cursor: string | null;
  updatedAt: string | null;
  page: number;
  /** Durable cursor for the independent refunded-order reconciliation traversal. */
  financialCursor: string | null;
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

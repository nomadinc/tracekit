export type ShopifyResource = "orders" | "products" | "customers";

export type ShopifyCheckpoint = {
  cursor: string | null;
  updatedAt: string | null;
  page: number;
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
  return { cursor: null, updatedAt: null, page: 1 };
}

export function normalizeShopifyCheckpoint(value: Partial<ShopifyCheckpoint> | null | undefined): ShopifyCheckpoint {
  return {
    cursor: typeof value?.cursor === "string" && value.cursor.trim() ? value.cursor : null,
    updatedAt: normalizeIso(value?.updatedAt),
    page: Number.isInteger(value?.page) && Number(value?.page) > 0 ? Number(value?.page) : 1,
  };
}

function normalizeIso(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

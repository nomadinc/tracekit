export type ShopifyResource = "orders" | "products" | "customers";

export type ShopifyCheckpoint = {
  cursor: string | null;
  updatedAt: string | null;
  page: number;
  /** Fixed upper bound for isolated historical backfill runs. */
  historicalCutoff?: string | null;
  /** Legacy combined financial reconciliation cursor; retained for backward compatibility. */
  financialCursor?: string | null;
  /** Durable cursor for fully-refunded order reconciliation. */
  refundedCursor?: string | null;
  /** Durable cursor for partially-refunded order reconciliation. */
  partiallyRefundedCursor?: string | null;
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
  return {
    cursor: null,
    updatedAt: null,
    page: 1,
    historicalCutoff: null,
    financialCursor: null,
    refundedCursor: null,
    partiallyRefundedCursor: null,
  };
}

export function normalizeShopifyCheckpoint(value: Partial<ShopifyCheckpoint> | null | undefined): ShopifyCheckpoint {
  const legacyFinancialCursor = normalizeCursor(value?.financialCursor);
  return {
    cursor: normalizeCursor(value?.cursor),
    updatedAt: normalizeIso(value?.updatedAt),
    page: Number.isInteger(value?.page) && Number(value?.page) > 0 ? Number(value?.page) : 1,
    historicalCutoff: normalizeIso(value?.historicalCutoff),
    financialCursor: legacyFinancialCursor,
    refundedCursor: normalizeCursor(value?.refundedCursor) || legacyFinancialCursor,
    partiallyRefundedCursor: normalizeCursor(value?.partiallyRefundedCursor),
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

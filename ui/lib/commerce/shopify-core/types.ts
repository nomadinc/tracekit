import type { CommerceProviderCapability } from "../types";

export type ShopifyConnectionContext = {
  organizationId: string;
  connectionId: string;
};

export type ShopifyAdminCredentials = {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string | null;
};

export type ShopifyShopIdentity = {
  id: string;
  name: string;
  myshopifyDomain: string;
  email: string | null;
  currencyCode: string | null;
  timezoneAbbreviation: string | null;
};

export type ShopifyConnectionTestResult = {
  ok: true;
  organizationId: string;
  connectionId: string;
  shopDomain: string;
  apiVersion: string;
  shop: ShopifyShopIdentity;
};

export type ShopifyGraphqlError = {
  message?: string;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ShopifyGraphqlEnvelope<TData> = {
  data?: TData;
  errors?: ShopifyGraphqlError[];
  extensions?: Record<string, unknown>;
};

export const SHOPIFY_COMMERCE_CAPABILITIES: CommerceProviderCapability[] = [
  {
    resource: "shop",
    list: false,
    get: true,
    incrementalFilters: [],
    notes: "Read-only shop identity validation.",
  },
  {
    resource: "products",
    list: true,
    get: true,
    incrementalFilters: ["updated_at"],
  },
  {
    resource: "customers",
    list: true,
    get: true,
    incrementalFilters: ["updated_at"],
  },
  {
    resource: "orders",
    list: true,
    get: true,
    incrementalFilters: ["updated_at", "created_at"],
    notes: "Orders are the parent resource for line items, transactions, refunds, and cancellations.",
  },
];

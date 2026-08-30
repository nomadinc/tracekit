import type { ShopifyAdminClient } from "./client";

export type ShopifyIncrementalResource = "products" | "customers" | "orders";

export type ShopifyIncrementalCheckpoint = {
  resource: ShopifyIncrementalResource;
  updatedAt: string;
  cursor: string | null;
  maxObservedUpdatedAt: string;
};

export type ShopifyResourcePage<TNode> = {
  resource: ShopifyIncrementalResource;
  nodes: TNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  checkpoint: ShopifyIncrementalCheckpoint;
};

export type ShopifyProductNode = {
  id: string;
  legacyResourceId?: string | null;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  createdAt: string;
  updatedAt: string;
  variants: { nodes: Array<{ id: string; legacyResourceId?: string | null; title: string; sku?: string | null; barcode?: string | null; price?: string | null; compareAtPrice?: string | null; inventoryQuantity?: number | null }> };
};

export type ShopifyCustomerNode = {
  id: string;
  legacyResourceId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  createdAt: string;
  updatedAt: string;
  defaultEmailAddress?: { emailAddress?: string | null } | null;
  defaultPhoneNumber?: { phoneNumber?: string | null } | null;
  amountSpent?: { amount?: string | null; currencyCode?: string | null } | null;
  numberOfOrders?: string | number | null;
  tags?: string[];
};

type ShopifyMoneyBag = { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null };

export type ShopifyOrderNode = {
  id: string;
  legacyResourceId?: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string | null;
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  currencyCode?: string | null;
  customAttributes?: Array<{ key: string; value?: string | null }>;
  customer?: { id: string; legacyResourceId?: string | null; email?: string | null; phone?: string | null } | null;
  currentTotalPriceSet?: ShopifyMoneyBag | null;
  subtotalPriceSet?: ShopifyMoneyBag | null;
  totalShippingPriceSet?: ShopifyMoneyBag | null;
  currentTotalTaxSet?: ShopifyMoneyBag | null;
  lineItems: { nodes: Array<{ id: string; name: string; title: string; sku?: string | null; quantity: number; variant?: { id: string; sku?: string | null } | null; product?: { id: string } | null; originalTotalSet?: ShopifyMoneyBag | null; discountedTotalSet?: ShopifyMoneyBag | null }> };
  refunds: Array<{ id: string; createdAt: string; note?: string | null; totalRefundedSet?: ShopifyMoneyBag | null }>;
};

type Connection<TNode> = {
  nodes?: TNode[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};

const PRODUCTS_QUERY = `#graphql
query TraceKitShopifyProducts($first: Int!, $after: String, $query: String!) {
  products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId title handle status vendor productType createdAt updatedAt
      variants(first: 100) { nodes { id legacyResourceId title sku barcode price compareAtPrice inventoryQuantity } }
    }
  }
}`;

const CUSTOMERS_QUERY = `#graphql
query TraceKitShopifyCustomers($first: Int!, $after: String, $query: String!) {
  customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId firstName lastName createdAt updatedAt
      defaultEmailAddress { emailAddress }
      defaultPhoneNumber { phoneNumber }
      amountSpent { amount currencyCode }
      numberOfOrders tags
    }
  }
}`;

const ORDERS_QUERY = `#graphql
query TraceKitShopifyOrdersIncremental($first: Int!, $after: String, $query: String!) {
  orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId name email phone createdAt processedAt updatedAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus currencyCode
      customAttributes { key value }
      customer { id legacyResourceId email phone }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      currentTotalTaxSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) {
        nodes {
          id name title sku quantity variant { id sku } product { id }
          originalTotalSet { shopMoney { amount currencyCode } }
          discountedTotalSet { shopMoney { amount currencyCode } }
        }
      }
      refunds { id createdAt note totalRefundedSet { shopMoney { amount currencyCode } } }
    }
  }
}`;

function requireIsoTimestamp(value: string) {
  const raw = String(value || "").trim();
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) throw new Error("Shopify incremental checkpoint updatedAt must be an ISO-8601 timestamp.");
  return new Date(parsed).toISOString();
}

function clampPageSize(value?: number) {
  const requested = Number(value ?? 100);
  if (!Number.isFinite(requested)) return 100;
  return Math.max(1, Math.min(250, Math.trunc(requested)));
}

export function buildShopifyUpdatedAtSearch(updatedAt: string) {
  return `updated_at:>'${requireIsoTimestamp(updatedAt)}'`;
}

function maxTimestamp(seed: string, nodes: Array<{ updatedAt: string }>) {
  return nodes.reduce((max, node) => {
    const current = Date.parse(String(node.updatedAt || ""));
    return Number.isFinite(current) && current > Date.parse(max) ? new Date(current).toISOString() : max;
  }, requireIsoTimestamp(seed));
}

function deriveCheckpoint(args: {
  checkpoint: ShopifyIncrementalCheckpoint;
  nodes: Array<{ updatedAt: string }>;
  hasNextPage: boolean;
  endCursor: string | null;
}) {
  const maxObservedUpdatedAt = maxTimestamp(args.checkpoint.maxObservedUpdatedAt, args.nodes);
  return {
    resource: args.checkpoint.resource,
    updatedAt: args.hasNextPage ? args.checkpoint.updatedAt : maxObservedUpdatedAt,
    cursor: args.hasNextPage ? args.endCursor : null,
    maxObservedUpdatedAt,
  } satisfies ShopifyIncrementalCheckpoint;
}

async function listIncrementalPage<TNode extends { updatedAt: string }>(args: {
  client: Pick<ShopifyAdminClient, "graphql">;
  resource: ShopifyIncrementalResource;
  queryDocument: string;
  checkpoint: ShopifyIncrementalCheckpoint;
  pageSize?: number;
}): Promise<ShopifyResourcePage<TNode>> {
  if (args.checkpoint.resource !== args.resource) throw new Error(`Shopify checkpoint resource mismatch: expected ${args.resource}.`);

  const data = await args.client.graphql<Record<ShopifyIncrementalResource, Connection<TNode>>>(args.queryDocument, {
    first: clampPageSize(args.pageSize),
    after: args.checkpoint.cursor,
    query: buildShopifyUpdatedAtSearch(args.checkpoint.updatedAt),
  });

  const connection = data[args.resource] || {};
  const nodes = Array.isArray(connection.nodes) ? connection.nodes : [];
  const hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
  const endCursor = connection.pageInfo?.endCursor ?? null;

  return {
    resource: args.resource,
    nodes,
    pageInfo: { hasNextPage, endCursor },
    checkpoint: deriveCheckpoint({ checkpoint: args.checkpoint, nodes, hasNextPage, endCursor }),
  };
}

export function initialShopifyCheckpoint(resource: ShopifyIncrementalResource, updatedAt: string): ShopifyIncrementalCheckpoint {
  const watermark = requireIsoTimestamp(updatedAt);
  return { resource, updatedAt: watermark, cursor: null, maxObservedUpdatedAt: watermark };
}

export function listShopifyProductsPage(client: Pick<ShopifyAdminClient, "graphql">, checkpoint: ShopifyIncrementalCheckpoint, pageSize?: number) {
  return listIncrementalPage<ShopifyProductNode>({ client, resource: "products", queryDocument: PRODUCTS_QUERY, checkpoint, pageSize });
}

export function listShopifyCustomersPage(client: Pick<ShopifyAdminClient, "graphql">, checkpoint: ShopifyIncrementalCheckpoint, pageSize?: number) {
  return listIncrementalPage<ShopifyCustomerNode>({ client, resource: "customers", queryDocument: CUSTOMERS_QUERY, checkpoint, pageSize });
}

export function listShopifyOrdersPage(client: Pick<ShopifyAdminClient, "graphql">, checkpoint: ShopifyIncrementalCheckpoint, pageSize?: number) {
  return listIncrementalPage<ShopifyOrderNode>({ client, resource: "orders", queryDocument: ORDERS_QUERY, checkpoint, pageSize });
}

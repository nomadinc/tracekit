import { normalizeShopifyCheckpoint, type ShopifyCheckpoint, type ShopifyResource, type ShopifyResourceNode, type ShopifySyncPage } from "./resources";

type Config = {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  pageSize?: number;
  fetchImpl?: typeof fetch;
};

type GraphqlConnection = { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: unknown } };
type GraphqlResponse = { data?: Record<string, any>; errors?: Array<{ message?: string }> };

const DEFAULT_API_VERSION = "2026-07";
const DEFAULT_PAGE_SIZE = 50;

export function createShopifyHistoricalPageReader(config: Config) {
  const shopDomain = normalizeShopDomain(config.shopDomain);
  const accessToken = required(config.accessToken, "Shopify Admin access token");
  const apiVersion = String(config.apiVersion || DEFAULT_API_VERSION).trim();
  const pageSize = normalizePageSize(config.pageSize);
  const fetchImpl = config.fetchImpl || fetch;
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  return async function readHistoricalPage(args: { resource: ShopifyResource; checkpoint: ShopifyCheckpoint }): Promise<ShopifySyncPage> {
    const checkpoint = normalizeShopifyCheckpoint(args.checkpoint);
    const cutoff = checkpoint.historicalCutoff;
    if (!cutoff) throw new Error("Shopify historical backfill requires a fixed historical cutoff.");

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({
        query: queryFor(args.resource),
        variables: {
          first: pageSize,
          after: checkpoint.cursor,
          query: `created_at:<='${cutoff}'`,
        },
      }),
    });
    if (!response.ok) throw new Error(`Shopify historical GraphQL request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    const payload = await response.json() as GraphqlResponse;
    if (payload.errors?.length) throw new Error(`Shopify historical GraphQL error: ${payload.errors.map((error) => error.message || "unknown error").join("; ")}`);

    const connection = requireConnection(payload.data?.[args.resource], args.resource);
    const nodes = validNodes(connection.nodes);
    const hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    const nextCursor = hasNextPage ? clean(connection.pageInfo?.endCursor) || null : null;

    return {
      resource: args.resource,
      nodes,
      checkpoint,
      hasNextPage,
      nextCheckpoint: {
        ...checkpoint,
        cursor: nextCursor,
        page: checkpoint.page + 1,
        historicalCutoff: cutoff,
      },
    };
  };
}

function queryFor(resource: ShopifyResource) {
  if (resource === "orders") return ORDERS_QUERY;
  if (resource === "products") return PRODUCTS_QUERY;
  return CUSTOMERS_QUERY;
}

const MONEY_FIELDS = `shopMoney { amount currencyCode }`;
const ORDER_FIELDS = `
  id name createdAt processedAt updatedAt displayFinancialStatus cancelledAt email phone
  customer { id email phone }
  shippingAddress { phone }
  billingAddress { phone }
  currentTotalPriceSet { ${MONEY_FIELDS} }
  totalPriceSet { ${MONEY_FIELDS} }
  currentSubtotalPriceSet { ${MONEY_FIELDS} }
  totalShippingPriceSet { ${MONEY_FIELDS} }
  currentTotalTaxSet { ${MONEY_FIELDS} }
  transactions(first: 250) { id kind status amountSet { ${MONEY_FIELDS} } }
  lineItems(first: 250) { nodes { id quantity title sku product { id } variant { id } discountedTotalSet { ${MONEY_FIELDS} } originalTotalSet { ${MONEY_FIELDS} } } }
  refunds {
    id createdAt processedAt updatedAt totalRefundedSet { ${MONEY_FIELDS} }
    transactions(first: 250) { nodes { id status amountSet { ${MONEY_FIELDS} } } }
  }
`;

const ORDERS_QUERY = `#graphql
query TraceKitShopifyHistoricalOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, sortKey: CREATED_AT, query: $query) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PRODUCTS_QUERY = `#graphql
query TraceKitShopifyHistoricalProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, sortKey: CREATED_AT, query: $query) {
    nodes { id title description createdAt updatedAt variants(first: 250) { nodes { id title sku price } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CUSTOMERS_QUERY = `#graphql
query TraceKitShopifyHistoricalCustomers($first: Int!, $after: String, $query: String) {
  customers(first: $first, after: $after, sortKey: CREATED_AT, query: $query) {
    nodes { id firstName lastName displayName email phone createdAt updatedAt }
    pageInfo { hasNextPage endCursor }
  }
}`;

function requireConnection(value: unknown, label: string): GraphqlConnection {
  const connection = value && typeof value === "object" ? value as GraphqlConnection : null;
  if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) throw new Error(`Shopify historical ${label} response is missing connection data.`);
  return connection;
}

function validNodes(nodes: unknown[] | undefined): ShopifyResourceNode[] {
  return (nodes || []).filter((node: unknown): node is ShopifyResourceNode => Boolean(node) && typeof node === "object" && typeof (node as { id?: unknown }).id === "string");
}

function normalizeShopDomain(value: unknown) {
  const domain = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("Shopify historical reader requires a valid myshopify.com domain.");
  return domain;
}

function normalizePageSize(value: unknown) {
  const size = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error("Shopify historical page size must be between 1 and 100.");
  return size;
}

function required(value: unknown, label: string) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function clean(value: unknown) { return String(value ?? "").trim(); }

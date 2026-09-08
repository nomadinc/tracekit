import { normalizeShopifyCheckpoint, type ShopifyCheckpoint, type ShopifyResource, type ShopifyResourceNode, type ShopifySyncPage } from "./resources";

export type ShopifyAdminReaderConfig = {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  pageSize?: number;
  fetchImpl?: typeof fetch;
};

type GraphqlConnection = {
  nodes?: unknown[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: unknown };
};

type GraphqlResponse = {
  data?: Record<string, any>;
  errors?: Array<{ message?: string }>;
};

const DEFAULT_API_VERSION = "2026-07";
const DEFAULT_PAGE_SIZE = 100;
const FINANCIAL_RECONCILIATION_QUERY = "financial_status:refunded OR financial_status:partially_refunded";

export function createShopifyAdminPageReader(config: ShopifyAdminReaderConfig) {
  const shopDomain = normalizeShopDomain(config.shopDomain);
  const accessToken = required(config.accessToken, "Shopify Admin access token");
  const apiVersion = String(config.apiVersion || DEFAULT_API_VERSION).trim();
  const pageSize = normalizePageSize(config.pageSize);
  const fetchImpl = config.fetchImpl || fetch;
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  return async function readShopifyPage(args: {
    resource: ShopifyResource;
    checkpoint: ShopifyCheckpoint;
  }): Promise<ShopifySyncPage> {
    const checkpoint = normalizeShopifyCheckpoint(args.checkpoint);
    const query = queryFor(args.resource);
    const variables: Record<string, unknown> = {
      first: pageSize,
      after: checkpoint.cursor,
      query: checkpoint.updatedAt ? `updated_at:>=${checkpoint.updatedAt}` : null,
    };
    if (args.resource === "orders") {
      variables.financialAfter = checkpoint.financialCursor;
      variables.financialQuery = FINANCIAL_RECONCILIATION_QUERY;
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Admin GraphQL request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    }

    const payload = await response.json() as GraphqlResponse;
    if (payload.errors?.length) {
      throw new Error(`Shopify Admin GraphQL error: ${payload.errors.map((error) => error.message || "unknown error").join("; ")}`);
    }

    const connection = requireConnection(payload.data?.[args.resource], args.resource);
    const incrementalNodes = validNodes(connection.nodes);
    const highWater = maxUpdatedAt(checkpoint.updatedAt, incrementalNodes);
    const hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    const nextCursor = hasNextPage ? clean(connection.pageInfo?.endCursor) || null : null;

    let nodes = incrementalNodes;
    let financialCursor = checkpoint.financialCursor;
    if (args.resource === "orders") {
      const financialConnection = requireConnection(payload.data?.financialOrders, "financialOrders");
      const financialNodes = validNodes(financialConnection.nodes);
      nodes = mergeNodes(incrementalNodes, financialNodes);
      financialCursor = financialConnection.pageInfo?.hasNextPage
        ? clean(financialConnection.pageInfo?.endCursor) || null
        : null;
    }

    return {
      resource: args.resource,
      nodes,
      checkpoint,
      hasNextPage,
      nextCheckpoint: {
        cursor: nextCursor,
        updatedAt: highWater,
        page: checkpoint.page + 1,
        financialCursor,
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
query TraceKitShopifyOrders(
  $first: Int!
  $after: String
  $query: String
  $financialAfter: String
  $financialQuery: String!
) {
  orders(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
  financialOrders: orders(first: $first, after: $financialAfter, sortKey: ID, query: $financialQuery) {
    nodes { ${ORDER_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PRODUCTS_QUERY = `#graphql
query TraceKitShopifyProducts($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
    nodes { id title description updatedAt variants(first: 250) { nodes { id title sku price } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CUSTOMERS_QUERY = `#graphql
query TraceKitShopifyCustomers($first: Int!, $after: String, $query: String) {
  customers(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
    nodes { id firstName lastName displayName email phone updatedAt }
    pageInfo { hasNextPage endCursor }
  }
}`;

function requireConnection(value: unknown, label: string): GraphqlConnection {
  const connection = value && typeof value === "object" ? value as GraphqlConnection : null;
  if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
    throw new Error(`Shopify Admin GraphQL ${label} response is missing connection data.`);
  }
  return connection;
}

function validNodes(nodes: unknown[] | undefined): ShopifyResourceNode[] {
  return (nodes || []).filter((node: unknown): node is ShopifyResourceNode =>
    Boolean(node) && typeof node === "object" && typeof (node as { id?: unknown }).id === "string",
  );
}

function mergeNodes(primary: ShopifyResourceNode[], reconciliation: ShopifyResourceNode[]): ShopifyResourceNode[] {
  const merged = new Map<string, ShopifyResourceNode>();
  for (const node of primary) merged.set(node.id, node);
  for (const node of reconciliation) merged.set(node.id, node);
  return [...merged.values()];
}

function maxUpdatedAt(current: string | null, nodes: ShopifyResourceNode[]) {
  let latest = current ? new Date(current) : null;
  for (const node of nodes) {
    const candidate = new Date(String(node.updatedAt || node.createdAt || ""));
    if (Number.isNaN(candidate.getTime())) continue;
    if (!latest || candidate > latest) latest = candidate;
  }
  return latest ? latest.toISOString() : null;
}

function normalizeShopDomain(value: unknown) {
  const domain = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("Shopify Admin reader requires a valid myshopify.com domain.");
  return domain;
}

function normalizePageSize(value: unknown) {
  const size = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(size) || size < 1 || size > 250) throw new Error("Shopify Admin page size must be between 1 and 250.");
  return size;
}

function required(value: unknown, label: string) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

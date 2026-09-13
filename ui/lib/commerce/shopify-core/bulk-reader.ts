import type { ShopifyResource, ShopifyResourceNode } from "./resources";

export type ShopifyBulkOperation = {
  id: string;
  status: string;
  errorCode: string | null;
  objectCount: string | null;
  fileSize: string | null;
  url: string | null;
  partialDataUrl: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

export type ShopifyBulkReaderConfig = {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_API_VERSION = "2026-07";

export function createShopifyBulkReader(config: ShopifyBulkReaderConfig) {
  const shopDomain = normalizeShopDomain(config.shopDomain);
  const accessToken = required(config.accessToken, "Shopify Admin access token");
  const apiVersion = String(config.apiVersion || DEFAULT_API_VERSION).trim();
  const fetchImpl = config.fetchImpl || fetch;
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`Shopify bulk GraphQL request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    }
    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) {
      throw new Error(`Shopify bulk GraphQL error: ${payload.errors.map((error) => error.message || "unknown error").join("; ")}`);
    }
    if (!payload.data) throw new Error("Shopify bulk GraphQL response is missing data.");
    return payload.data;
  }

  return {
    async start(args: { resource: ShopifyResource; before: string }) {
      const bulkQuery = bulkQueryFor(args.resource, normalizeIso(args.before));
      const data = await graphql<{ bulkOperationRunQuery?: { bulkOperation?: Record<string, unknown>; userErrors?: Array<{ field?: string[]; message?: string }> } }>(
        BULK_RUN_MUTATION,
        { query: bulkQuery },
      );
      const result = data.bulkOperationRunQuery;
      const userErrors = result?.userErrors || [];
      if (userErrors.length) {
        throw new Error(`Shopify bulk operation rejected: ${userErrors.map((error) => error.message || "unknown error").join("; ")}`);
      }
      return normalizeOperation(result?.bulkOperation);
    },

    async get(operationId: string) {
      const id = required(operationId, "Shopify bulk operation id");
      const data = await graphql<{ bulkOperation?: Record<string, unknown> | null }>(BULK_OPERATION_QUERY, { id });
      return data.bulkOperation ? normalizeOperation(data.bulkOperation) : null;
    },

    async download(url: string) {
      const safeUrl = normalizeBulkUrl(url);
      const response = await fetchImpl(safeUrl, { method: "GET" });
      if (!response.ok) throw new Error(`Shopify bulk result download failed (${response.status}).`);
      return response.text();
    },
  };
}

export function parseShopifyBulkJsonl(resource: ShopifyResource, jsonl: string): ShopifyResourceNode[] {
  const objects = new Map<string, Record<string, any>>();
  const children = new Map<string, Record<string, any>[]>();

  for (const rawLine of String(jsonl || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let value: Record<string, any>;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("Shopify bulk result contains invalid JSONL.");
    }
    const id = clean(value.id);
    if (!id) continue;
    const parentId = clean(value.__parentId);
    if (parentId) {
      const list = children.get(parentId) || [];
      list.push(value);
      children.set(parentId, list);
    } else {
      objects.set(id, value);
    }
  }

  if (resource !== "orders") return Array.from(objects.values()) as ShopifyResourceNode[];

  children.forEach((list, parentId) => {
    const parent = objects.get(parentId);
    if (!parent) return;
    const lineItems: Record<string, any>[] = [];
    const transactions: Record<string, any>[] = [];
    const refunds: Record<string, any>[] = [];
    for (const child of list) {
      const type = String(child.__typename || "");
      const normalized = { ...child };
      delete normalized.__parentId;
      if (type === "LineItem") lineItems.push(normalized);
      else if (type === "OrderTransaction") transactions.push(normalized);
      else if (type === "Refund") refunds.push(normalized);
    }
    if (lineItems.length) parent.lineItems = { nodes: lineItems };
    if (transactions.length) parent.transactions = transactions;
    if (refunds.length) parent.refunds = refunds;
  });

  return Array.from(objects.values()) as ShopifyResourceNode[];
}

function bulkQueryFor(resource: ShopifyResource, before: string) {
  const beforeFilter = `updated_at:<='${before}'`;
  if (resource === "products") return `#graphql\n{ products(query: ${JSON.stringify(beforeFilter)}) { edges { node { id title description updatedAt variants { edges { node { id title sku price } } } } } } }`;
  if (resource === "customers") return `#graphql\n{ customers(query: ${JSON.stringify(beforeFilter)}) { edges { node { id firstName lastName displayName email phone updatedAt } } } }`;
  return `#graphql\n{ orders(query: ${JSON.stringify(beforeFilter)}) { edges { node { id name createdAt processedAt updatedAt displayFinancialStatus cancelledAt email phone customer { id email phone } shippingAddress { phone } billingAddress { phone } currentTotalPriceSet { shopMoney { amount currencyCode } } totalPriceSet { shopMoney { amount currencyCode } } currentSubtotalPriceSet { shopMoney { amount currencyCode } } totalShippingPriceSet { shopMoney { amount currencyCode } } currentTotalTaxSet { shopMoney { amount currencyCode } } transactions { id __typename kind status amountSet { shopMoney { amount currencyCode } } } lineItems { edges { node { id __typename quantity title sku product { id } variant { id } discountedTotalSet { shopMoney { amount currencyCode } } originalTotalSet { shopMoney { amount currencyCode } } } } } refunds { id __typename createdAt processedAt updatedAt totalRefundedSet { shopMoney { amount currencyCode } } } } } } }`;
}

const BULK_RUN_MUTATION = `#graphql\nmutation TraceKitShopifyBulk($query: String!) {\n  bulkOperationRunQuery(query: $query) {\n    bulkOperation { id status errorCode objectCount fileSize url partialDataUrl createdAt completedAt }\n    userErrors { field message }\n  }\n}`;

const BULK_OPERATION_QUERY = `#graphql\nquery TraceKitBulkOperation($id: ID!) {\n  bulkOperation(id: $id) { id status errorCode objectCount fileSize url partialDataUrl createdAt completedAt }\n}`;

function normalizeOperation(value: Record<string, unknown> | null | undefined): ShopifyBulkOperation {
  const id = clean(value?.id);
  if (!id) throw new Error("Shopify bulk operation response is missing id.");
  return {
    id,
    status: clean(value?.status) || "UNKNOWN",
    errorCode: clean(value?.errorCode) || null,
    objectCount: clean(value?.objectCount) || null,
    fileSize: clean(value?.fileSize) || null,
    url: clean(value?.url) || null,
    partialDataUrl: clean(value?.partialDataUrl) || null,
    createdAt: clean(value?.createdAt) || null,
    completedAt: clean(value?.completedAt) || null,
  };
}

function normalizeShopDomain(value: unknown) {
  const domain = clean(value).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) throw new Error("Shopify bulk reader requires a valid myshopify.com domain.");
  return domain;
}

function normalizeBulkUrl(value: unknown) {
  const url = new URL(required(value, "Shopify bulk result URL"));
  if (url.protocol !== "https:") throw new Error("Shopify bulk result URL must use HTTPS.");
  return url.toString();
}

function normalizeIso(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) throw new Error("Shopify bulk historical cutoff is invalid.");
  return date.toISOString();
}

function required(value: unknown, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

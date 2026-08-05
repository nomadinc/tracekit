import type { CommasPage, CommasTransaction } from "./types.ts";

const SENSITIVE_KEYS = /(?:name|email|phone|address|card|payment_method|token|secret|password|customer)/i;
const IDENTIFIER_KEYS = /(?:^id$|_id$|uuid|hash)/i;

export type CommasFieldObservation = {
  field: string;
  types: string[];
  nullable: boolean;
  sensitive: boolean;
};

export type CommasDiscoverySummary = {
  resource: string;
  status: "success";
  itemCount: number;
  topLevelKeys: string[];
  dataKeys: string[];
  pagination: CommasPage<unknown>["pagination"];
  rateLimit: CommasPage<unknown>["rateLimit"];
  providerRequestIdPresent: boolean;
  correlationId: string;
  fields: CommasFieldObservation[];
  redactedExampleStructure: Record<string, string> | null;
};

export function summarizeCommasDiscovery(resource: string, page: CommasPage<Record<string, unknown>>): CommasDiscoverySummary {
  const fieldMap = new Map<string, { types: Set<string>; nullable: boolean }>();
  for (const item of page.items) {
    for (const [field, value] of Object.entries(item)) {
      const current = fieldMap.get(field) ?? { types: new Set<string>(), nullable: false };
      current.types.add(jsonType(value));
      current.nullable ||= value === null;
      fieldMap.set(field, current);
    }
  }

  const fields = [...fieldMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([field, observation]) => ({
    field,
    types: [...observation.types].sort(),
    nullable: observation.nullable,
    sensitive: SENSITIVE_KEYS.test(field),
  }));

  return {
    resource,
    status: "success",
    itemCount: page.items.length,
    topLevelKeys: page.shape.topLevelKeys,
    dataKeys: page.shape.dataKeys,
    pagination: page.pagination,
    rateLimit: page.rateLimit,
    providerRequestIdPresent: Boolean(page.providerRequestId),
    correlationId: page.correlationId,
    fields,
    redactedExampleStructure: page.items[0] ? redactStructure(page.items[0]) : null,
  };
}

function redactStructure(item: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
    if (SENSITIVE_KEYS.test(key)) return [key, "<redacted>"];
    if (IDENTIFIER_KEYS.test(key)) return [key, "<opaque-id>"];
    return [key, `<${jsonType(value)}>`];
  }));
}

export function jsonType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

export function observeObjectSchema(value: unknown): CommasFieldObservation[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, child]) => ({
      field,
      types: [jsonType(child)],
      nullable: child === null,
      sensitive: SENSITIVE_KEYS.test(field),
    }));
}

export type CommasBoundedTraversalSummary = {
  resource: "customers" | "transactions";
  pagesRequested: [1, 2];
  perPage: 2;
  page1Count: number;
  page2Count: number;
  distinctIdCount: number;
  repeatedIdCount: number;
  page1: Pick<CommasDiscoverySummary, "pagination" | "rateLimit" | "fields">;
  page2: Pick<CommasDiscoverySummary, "pagination" | "rateLimit" | "fields">;
};

export function summarizeTwoPageTraversal(
  resource: "customers" | "transactions",
  page1: CommasPage<Record<string, unknown>>,
  page2: CommasPage<Record<string, unknown>>,
): CommasBoundedTraversalSummary {
  const firstIds = new Set(page1.items.map((item) => String(item.id)));
  const secondIds = new Set(page2.items.map((item) => String(item.id)));
  const repeatedIdCount = [...secondIds].filter((id) => firstIds.has(id)).length;
  const first = summarizeCommasDiscovery(resource, page1);
  const second = summarizeCommasDiscovery(resource, page2);
  return {
    resource,
    pagesRequested: [1, 2],
    perPage: 2,
    page1Count: page1.items.length,
    page2Count: page2.items.length,
    distinctIdCount: new Set([...firstIds, ...secondIds]).size,
    repeatedIdCount,
    page1: { pagination: first.pagination, rateLimit: first.rateLimit, fields: first.fields },
    page2: { pagination: second.pagination, rateLimit: second.rateLimit, fields: second.fields },
  };
}

export function summarizeNestedTransactions(transactions: CommasTransaction[]) {
  const firstObject = (field: keyof CommasTransaction) => transactions.map((item) => item[field]).find((value) => value && typeof value === "object" && !Array.isArray(value));
  const refund = transactions.flatMap((item) => Array.isArray(item.refunds) ? item.refunds : []).find((item) => item && typeof item === "object");
  return {
    fan: observeObjectSchema(firstObject("fan")),
    product: observeObjectSchema(firstObject("product")),
    service: observeObjectSchema(firstObject("service")),
    servicePayment: observeObjectSchema(firstObject("servicePayment")),
    refundItem: observeObjectSchema(refund),
  };
}

export function summarizeObservedProducts(transactions: CommasTransaction[]) {
  const products = new Map<string, { transactionCount: number; titlePresent: boolean; internalNameClassification: string; observedPrices: Set<string> }>();
  for (const transaction of transactions) {
    const product = objectRecord(transaction.product) ?? objectRecord(transaction.service);
    if (!product || product.id === undefined || product.id === null) continue;
    const id = String(product.id);
    const entry = products.get(id) ?? { transactionCount: 0, titlePresent: false, internalNameClassification: "unclassified", observedPrices: new Set<string>() };
    entry.transactionCount += 1;
    entry.titlePresent ||= typeof product.title === "string" && product.title.trim().length > 0;
    entry.internalNameClassification = classifyInternalName(product.internal_name);
    if (typeof product.price === "string" || typeof product.price === "number") entry.observedPrices.add(String(product.price));
    products.set(id, entry);
  }
  return [...products.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([providerProductId, entry]) => ({
    providerProductId,
    title: entry.titlePresent ? "<present-redacted>" : "<absent>",
    internalNameClassification: entry.internalNameClassification,
    observedPrices: [...entry.observedPrices].sort(),
    transactionCount: entry.transactionCount,
  }));
}

export function compareProductAndService(transactions: CommasTransaction[]) {
  let bothPresent = 0;
  let identical = 0;
  const differingFields = new Set<string>();
  for (const transaction of transactions) {
    const product = objectRecord(transaction.product);
    const service = objectRecord(transaction.service);
    if (!product || !service) continue;
    bothPresent += 1;
    const fields = new Set([...Object.keys(product), ...Object.keys(service)]);
    const differences = [...fields].filter((field) => JSON.stringify(product[field]) !== JSON.stringify(service[field]));
    if (differences.length === 0) identical += 1;
    else differences.forEach((field) => differingFields.add(field));
  }
  return {
    bothPresent,
    identical,
    materiallyDifferent: bothPresent - identical,
    differingFields: [...differingFields].sort(),
    conclusion: bothPresent === 0 ? "unobserved" : identical === bothPresent ? "identical-in-bounded-sample" : "materially-different-in-bounded-sample",
  };
}

export function compareTransactionListAndDetail(listItem: CommasTransaction, detailItem: CommasTransaction) {
  const listFields = Object.keys(listItem).sort();
  const detailFields = Object.keys(detailItem).sort();
  return {
    listFields,
    detailFields,
    detailOnlyFields: detailFields.filter((field) => !listFields.includes(field)),
    listOnlyFields: listFields.filter((field) => !detailFields.includes(field)),
    nestedList: summarizeNestedTransactions([listItem]),
    nestedDetail: summarizeNestedTransactions([detailItem]),
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function classifyInternalName(value: unknown) {
  if (typeof value !== "string") return "absent";
  const upper = value.toUpperCase();
  if (/\bMAIN\b/.test(upper) || /^GR\s*$/.test(upper)) return "front-end-candidate";
  if (/\bOB\b/.test(upper)) return "order-bump-candidate";
  const oto = upper.match(/\bOTO\s*([1-9]\d*)\b/);
  const ds = upper.match(/\bDS\s*([1-9]\d*)\b/);
  if (oto && ds) return `upsell-${oto[1]}-discount-${ds[1]}-candidate`;
  if (oto) return `upsell-${oto[1]}-candidate`;
  return "unclassified";
}

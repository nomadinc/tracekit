import { redactCommasText } from "./errors.ts";

const ALLOWED_PATHS = ["/public-api/disputes", "/public-api/chargebacks"] as const;

export type CommasDisputeProbeResult = {
  url: string;
  method: "GET";
  status: number;
  classification: "exists" | "requires_different_permissions" | "not_found" | "provider_error" | "undocumented_but_functional";
  responseHeaders: Record<string, string>;
  providerRequestIdPresent: boolean;
  topLevelResponseKeys: string[];
  paginationKeys: string[];
  redactedErrorMessage: string | null;
  bodyStructure: Array<{ path: string; type: string }>;
  sanitizedFixture: unknown;
  contract: CommasDisputeContract;
  jsonParsed: boolean;
};

export type CommasDisputeContract = {
  durableDisputeId: boolean;
  durableTransactionId: boolean;
  durablePaymentId: boolean;
  durableOrderId: boolean;
  lifecycleFields: boolean;
  reasonCode: boolean;
  financialFields: boolean;
  deterministicReconciliation: boolean;
};

export async function probeCommasDisputeCollections(args: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  includeSanitizedFixture?: boolean;
}): Promise<{ endpointsTested: number; results: CommasDisputeProbeResult[] }> {
  const apiKey = String(args.apiKey ?? "").trim();
  if (!apiKey) throw new Error("A selected Commas account credential is required.");
  const baseUrl = new URL(args.baseUrl ?? "https://www.fanbasis.com");
  if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) throw new Error("Commas base URL must be an origin.");
  const fetcher = args.fetch ?? fetch;
  const timeoutMs = args.timeoutMs ?? 15_000;
  const results: CommasDisputeProbeResult[] = [];

  for (const path of ALLOWED_PATHS) {
    const url = new URL(path, baseUrl);
    url.searchParams.set("page", "1");
    url.searchParams.set("per_page", "2");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
    let response: Response;
    let text = "";
    let parsed: unknown | undefined;
    try {
      response = await fetcher(url.toString(), {
        method: "GET",
        headers: { accept: "application/json", "x-api-key": apiKey },
        signal: controller.signal,
      });
      text = await response.text();
      parsed = safeJson(text);
    } catch (error) {
      results.push({
        url: `${url.origin}${url.pathname}?page=1&per_page=2`, method: "GET", status: 0,
        classification: "provider_error", responseHeaders: {}, providerRequestIdPresent: false,
        topLevelResponseKeys: [], paginationKeys: [], redactedErrorMessage: redactCommasText(error instanceof Error ? error.message : "Provider request failed."),
        bodyStructure: [], sanitizedFixture: null, contract: emptyContract(), jsonParsed: false,
      });
      continue;
    } finally {
      clearTimeout(timeout);
    }
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id") || object(parsed)?.request_id;
    results.push({
      url: `${url.origin}${url.pathname}?page=1&per_page=2`,
      method: "GET",
      status: response.status,
      classification: classify(response.status),
      responseHeaders: safeResponseHeaders(response.headers),
      providerRequestIdPresent: typeof requestId === "string" && requestId.length > 0,
      topLevelResponseKeys: Object.keys(object(parsed) ?? {}).sort(),
      paginationKeys: paginationKeys(parsed),
      redactedErrorMessage: response.ok ? null : providerMessage(parsed, text),
      bodyStructure: bodyStructure(parsed),
      sanitizedFixture: args.includeSanitizedFixture ? sanitizeCommasFixture(parsed) : null,
      contract: inferContract(parsed),
      jsonParsed: parsed !== undefined,
    });
  }
  return { endpointsTested: ALLOWED_PATHS.length, results };
}

function emptyContract(): CommasDisputeContract {
  return { durableDisputeId: false, durableTransactionId: false, durablePaymentId: false, durableOrderId: false, lifecycleFields: false, reasonCode: false, financialFields: false, deterministicReconciliation: false };
}

function inferContract(value: unknown): CommasDisputeContract {
  const paths = bodyStructure(value).map((entry) => entry.path.toLowerCase());
  const has = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  const durableDisputeId = has(/(?:^|\.)(?:dispute_id|chargeback_id|processor_dispute_id|dispute\.id)$/);
  const durableTransactionId = has(/(?:^|\.)(?:transaction_id|transaction\.id|seller_transaction_id|buyer_transaction_id|processor_transaction_id)$/);
  const durablePaymentId = has(/(?:^|\.)(?:payment_id|payment\.id)$/);
  const durableOrderId = has(/(?:^|\.)(?:order_id|external_order_id|platform_order_id|invoice_id)$/);
  const lifecycleFields = has(/(?:status|state|outcome|closed_date|close_date|update_time|updated_at|dispute_life_cycle|representment|retrieval|reversal|deadline)/);
  const reasonCode = has(/(?:reason_code|reason\.code|dispute_reason_code)/);
  const financialFields = has(/(?:amount|currency|fee|principal|gross_amount|dispute_amount)/);
  return { durableDisputeId, durableTransactionId, durablePaymentId, durableOrderId, lifecycleFields, reasonCode, financialFields, deterministicReconciliation: durableDisputeId && durableTransactionId };
}

/** Preserve shape and relationship-bearing values without retaining provider data. */
export function sanitizeCommasFixture(value: unknown): unknown {
  const ids = new Map<string, string>();
  const visit = (item: unknown, key = ""): unknown => {
    if (Array.isArray(item)) return item.map((child) => visit(child, key));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([childKey, child]) => [safeKey(childKey), visit(child, childKey)]));
    if (typeof item !== "string") return item;
    const normalized = key.toLowerCase();
    if (/token|secret|password|credential|authorization|cookie|card|cvv|cvc|iban|routing|address|phone|email|name/.test(normalized)) {
      const bucket = /email/.test(normalized) ? "email" : /phone/.test(normalized) ? "phone" : "redacted";
      if (!ids.has(`${bucket}:${item}`)) ids.set(`${bucket}:${item}`, `${bucket}_${stableToken(item)}`);
      return ids.get(`${bucket}:${item}`);
    }
    if (/(^|_)(id|identifier)$/.test(normalized) || /(?:transaction|payment|order|dispute|chargeback|customer|account).*id/.test(normalized)) {
      if (!ids.has(`id:${item}`)) ids.set(`id:${item}`, `id_${stableToken(item)}`);
      return ids.get(`id:${item}`);
    }
    return item;
  };
  return visit(value);
}

function stableToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function classify(status: number): CommasDisputeProbeResult["classification"] {
  if (status >= 200 && status < 300) return "undocumented_but_functional";
  if (status === 401 || status === 403) return "requires_different_permissions";
  if (status === 404) return "not_found";
  if (status >= 500) return "provider_error";
  return "exists";
}

function safeJson(text: string): unknown | undefined {
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return undefined; }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function paginationKeys(value: unknown) {
  const root = object(value);
  const data = object(root?.data);
  const pagination = object(data?.pagination) ?? object(root?.pagination) ?? object(root?.meta);
  return Object.keys(pagination ?? {}).sort();
}

function providerMessage(value: unknown, text: string) {
  const root = object(value);
  const error = object(root?.error);
  return redactCommasText(root?.message ?? error?.message ?? (value === undefined ? text : "Provider returned an error."));
}

function safeResponseHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = /authorization|cookie|key|secret|token/i.test(key) ? "<redacted>" : redactCommasText(value);
  });
  return result;
}

function bodyStructure(value: unknown) {
  const result = new Map<string, string>();
  const visit = (item: unknown, path: string, depth: number) => {
    if (depth > 8 || result.size >= 500) return;
    if (Array.isArray(item)) {
      result.set(path, "array");
      if (item[0] !== undefined) visit(item[0], `${path}[]`, depth + 1);
      return;
    }
    if (item !== null && typeof item === "object") {
      if (path) result.set(path, "object");
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        visit(child, path ? `${path}.${safeKey(key)}` : safeKey(key), depth + 1);
      }
      return;
    }
    if (path) result.set(path, item === null ? "null" : typeof item);
  };
  visit(value, "", 0);
  return Array.from(result.entries()).filter(([path]) => path).sort(([a], [b]) => a.localeCompare(b)).map(([path, type]) => ({ path, type }));
}

function safeKey(key: string) {
  return /@|https?:|\b\+?\d[\d(). -]{7,}\d\b/i.test(key) ? "<redacted-key>" : key.slice(0, 120);
}

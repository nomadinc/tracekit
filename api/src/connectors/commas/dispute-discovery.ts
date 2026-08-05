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
  jsonParsed: boolean;
};

export async function probeCommasDisputeCollections(args: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
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
    try {
      response = await fetcher(url.toString(), {
        method: "GET",
        headers: { accept: "application/json", "x-api-key": apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    const parsed = safeJson(text);
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
      jsonParsed: parsed !== undefined,
    });
  }
  return { endpointsTested: ALLOWED_PATHS.length, results };
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
  return [...result.entries()].filter(([path]) => path).sort(([a], [b]) => a.localeCompare(b)).map(([path, type]) => ({ path, type }));
}

function safeKey(key: string) {
  return /@|https?:|\b\+?\d[\d(). -]{7,}\d\b/i.test(key) ? "<redacted-key>" : key.slice(0, 120);
}

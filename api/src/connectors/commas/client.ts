import {
  CommasConfigurationError,
  CommasTransientError,
  commasErrorForStatus,
  redactCommasDiscoveryBody,
  redactCommasText,
} from "./errors.ts";
import { parseCommasObject, parseCommasPage, validateCommasPageNumber } from "./pagination.ts";
import type {
  CommasClientConfig,
  CommasCustomer,
  CommasCustomerListOptions,
  CommasJsonObject,
  CommasListOptions,
  CommasPage,
  CommasProduct,
  CommasRateLimit,
  CommasRequestContext,
  CommasResponseShape,
  CommasTransaction,
  CommasTransactionListOptions,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://www.fanbasis.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;
const DEFAULT_BACKOFF_CAP_MS = 5_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type CommasClientDependencies = {
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  correlationId?: () => string;
  discoveryDiagnostic?: (event: CommasDiscoveryDiagnosticEvent) => void;
};

export type CommasDiscoveryDiagnosticEvent = {
  phase: "request" | "response" | "network_failure" | "json_parse_failure";
  attempt: number;
  method: "GET";
  url: string;
  query: Record<string, string>;
  correlationId: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  providerRequestId?: string | null;
  bodyPreview?: string;
  jsonParsed?: boolean;
  error?: { name: string; message: string };
};

type TransportResult = {
  body: unknown;
  headers: Headers;
  providerRequestId: string | null;
  correlationId: string;
};

export class CommasClient {
  readonly environment: "production" | "custom";
  readonly baseUrl: string;
  readonly supportedMethods = Object.freeze([
    "listProducts",
    "listCustomers",
    "listTransactions",
    "getTransaction",
  ] as const);

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly createCorrelationId: () => string;
  private readonly discoveryDiagnostic?: (event: CommasDiscoveryDiagnosticEvent) => void;

  constructor(config: CommasClientConfig, dependencies: CommasClientDependencies = {}) {
    this.apiKey = String(config.apiKey ?? "").trim();
    if (!this.apiKey) throw configurationError("COMMAS_API_KEY is required.");

    const parsedBaseUrl = safeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    const isProduction = parsedBaseUrl.origin === DEFAULT_BASE_URL;
    if (!isProduction && !config.allowCustomBaseUrl) {
      throw configurationError("A custom Commas base URL requires explicit allowCustomBaseUrl configuration.");
    }
    if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.hostname !== "127.0.0.1" && parsedBaseUrl.hostname !== "localhost") {
      throw configurationError("Commas base URL must use HTTPS outside local tests.");
    }

    this.environment = isProduction ? "production" : "custom";
    if (config.environment && config.environment !== this.environment) {
      throw configurationError("Commas environment does not match the configured base URL.");
    }
    this.baseUrl = parsedBaseUrl.origin;
    this.timeoutMs = positiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.maxAttempts = positiveInteger(config.maxAttempts, DEFAULT_MAX_ATTEMPTS, "maxAttempts");
    this.backoffBaseMs = positiveInteger(config.backoffBaseMs, DEFAULT_BACKOFF_BASE_MS, "backoffBaseMs");
    this.backoffCapMs = positiveInteger(config.backoffCapMs, DEFAULT_BACKOFF_CAP_MS, "backoffCapMs");
    this.fetcher = dependencies.fetch ?? fetch;
    this.sleep = dependencies.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.random = dependencies.random ?? Math.random;
    this.now = dependencies.now ?? Date.now;
    this.createCorrelationId = dependencies.correlationId ?? (() => crypto.randomUUID());
    this.discoveryDiagnostic = dependencies.discoveryDiagnostic;
  }

  async listProducts(options: CommasListOptions = {}, context: CommasRequestContext = {}) {
    return this.list<CommasProduct>("products", "/public-api/products", ["products"], options, {}, context);
  }

  async listCustomers(options: CommasCustomerListOptions = {}, context: CommasRequestContext = {}) {
    return this.list<CommasCustomer>("customers", "/public-api/customers", ["customers"], options, {
      search: optionalText(options.search),
    }, context);
  }

  async listTransactions(options: CommasTransactionListOptions = {}, context: CommasRequestContext = {}) {
    return this.list<CommasTransaction>(
      "transactions",
      "/public-api/checkout-sessions/transactions",
      ["transactions"],
      options,
      { product_id: optionalText(options.productId), customer_id: optionalText(options.customerId) },
      context,
    );
  }

  async getTransaction(transactionId: string, context: CommasRequestContext = {}) {
    const id = requiredOpaqueId(transactionId, "transactionId");
    const response = await this.request("transaction", `/public-api/transactions/${encodeURIComponent(id)}`, new URLSearchParams(), context);
    const parsed = parseCommasObject<CommasTransaction>(response.body);
    return {
      item: parsed.item,
      rateLimit: parseRateLimit(response.headers),
      providerRequestId: response.providerRequestId,
      correlationId: response.correlationId,
      shape: parsed.shape,
    };
  }

  async *iterateProducts(options: Omit<CommasListOptions, "page"> & { maxPages?: number } = {}, context: CommasRequestContext = {}) {
    yield* this.iterate((page) => this.listProducts({ page, perPage: options.perPage ?? 20 }, context), options.maxPages);
  }

  async *iterateCustomers(options: Omit<CommasCustomerListOptions, "page"> & { maxPages?: number } = {}, context: CommasRequestContext = {}) {
    yield* this.iterate((page) => this.listCustomers({ ...options, page, perPage: options.perPage ?? 20 }, context), options.maxPages);
  }

  async *iterateTransactions(options: Omit<CommasTransactionListOptions, "page"> & { maxPages?: number } = {}, context: CommasRequestContext = {}) {
    yield* this.iterate((page) => this.listTransactions({ ...options, page, perPage: options.perPage ?? 20 }, context), options.maxPages);
  }

  private async *iterate<T>(load: (page: number) => Promise<CommasPage<T>>, maxPages = 100) {
    const safeMaxPages = positiveInteger(maxPages, 100, "maxPages");
    let pageNumber = 1;
    for (let visited = 0; visited < safeMaxPages; visited += 1) {
      const page = await load(pageNumber);
      yield page;
      if (!page.pagination.hasMore || page.pagination.nextPage === null) return;
      if (page.pagination.nextPage <= pageNumber) throw configurationError("Commas pagination did not advance.");
      pageNumber = page.pagination.nextPage;
    }
    throw configurationError(`Commas pagination exceeded the configured ${safeMaxPages}-page bound.`);
  }

  private async list<T>(
    resource: string,
    path: string,
    itemKeys: readonly string[],
    options: CommasListOptions,
    extra: Record<string, string | undefined>,
    context: CommasRequestContext,
  ): Promise<CommasPage<T>> {
    const page = validateCommasPageNumber(options.page, "page") ?? 1;
    const perPage = validateCommasPageNumber(options.perPage, "per_page");
    const params = new URLSearchParams({ page: String(page) });
    if (perPage !== undefined) params.set("per_page", String(perPage));
    for (const [key, value] of Object.entries(extra)) if (value !== undefined) params.set(key, value);

    const response = await this.request(resource, path, params, context);
    const parsed = parseCommasPage<T>(response.body, itemKeys, page);
    return {
      ...parsed,
      rateLimit: parseRateLimit(response.headers),
      providerRequestId: response.providerRequestId,
      correlationId: response.correlationId,
    };
  }

  private async request(resource: string, path: string, params: URLSearchParams, context: CommasRequestContext): Promise<TransportResult> {
    const correlationId = context.correlationId || this.createCorrelationId();
    const url = new URL(path, this.baseUrl);
    url.search = params.toString();
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      this.emitDiagnostic({
        phase: "request",
        attempt,
        method: "GET",
        url: safeDiagnosticUrl(url, resource),
        query: safeDiagnosticQuery(url.searchParams),
        correlationId,
      });
      try {
        const response = await this.fetchWithTimeout(url.toString(), context.signal);
        const text = await response.text();
        const diagnosticRequestId = providerRequestIdFrom(response.headers, safelyParseForRequestId(text));
        this.emitDiagnostic({
          phase: "response",
          attempt,
          method: "GET",
          url: safeDiagnosticUrl(url, resource),
          query: safeDiagnosticQuery(url.searchParams),
          correlationId,
          status: response.status,
          responseHeaders: safeDiagnosticHeaders(response.headers),
          providerRequestId: diagnosticRequestId,
          bodyPreview: redactCommasDiscoveryBody(text),
          jsonParsed: canParseJson(text),
        });
        const body = parseResponseBody(text, response, (error) => this.emitDiagnostic({
          phase: "json_parse_failure",
          attempt,
          method: "GET",
          url: safeDiagnosticUrl(url, resource),
          query: safeDiagnosticQuery(url.searchParams),
          correlationId,
          status: response.status,
          providerRequestId: diagnosticRequestId,
          bodyPreview: redactCommasDiscoveryBody(text),
          error: safeDiagnosticError(error),
        }));
        const providerRequestId = providerRequestIdFrom(response.headers, body);
        if (response.ok) return { body, headers: response.headers, providerRequestId, correlationId };

        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"), this.now());
        const provider = providerErrorFields(body);
        const error = commasErrorForStatus({
          message: provider.message?.replaceAll(this.apiKey, "<redacted-credential>")
            || `Commas ${resource} request failed with HTTP ${response.status}.`,
          status: response.status,
          resource,
          correlationId,
          providerRequestId,
          providerCode: provider.code?.replaceAll(this.apiKey, "<redacted-credential>") ?? null,
          retryAfterMs,
        });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === this.maxAttempts) throw error;
        await this.sleep(retryDelayMs(attempt, retryAfterMs, this.backoffBaseMs, this.backoffCapMs, this.random));
        lastError = error;
      } catch (error) {
        if (error instanceof CommasConfigurationError || (error instanceof Error && error.name.startsWith("Commas"))) throw error;
        this.emitDiagnostic({
          phase: "network_failure",
          attempt,
          method: "GET",
          url: safeDiagnosticUrl(url, resource),
          query: safeDiagnosticQuery(url.searchParams),
          correlationId,
          error: safeDiagnosticError(error),
        });
        lastError = error;
        if (attempt === this.maxAttempts) {
          throw new CommasTransientError({
            kind: "transient",
            message: isAbortError(error) ? "Commas request timed out." : "Commas request failed due to a transient network error.",
            status: isAbortError(error) ? 408 : 503,
            retryable: true,
            resource,
            correlationId,
          });
        }
        await this.sleep(retryDelayMs(attempt, null, this.backoffBaseMs, this.backoffCapMs, this.random));
      }
    }

    throw lastError;
  }

  private emitDiagnostic(event: CommasDiscoveryDiagnosticEvent) {
    this.discoveryDiagnostic?.(event);
  }

  private async fetchWithTimeout(url: string, callerSignal?: AbortSignal) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort("caller-aborted");
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    try {
      return await this.fetcher(url, {
        method: "GET",
        headers: { accept: "application/json", "x-api-key": this.apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function safeBaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("base URL must be an origin");
    return parsed;
  } catch {
    throw configurationError("COMMAS_BASE_URL must be a valid origin URL.");
  }
}

function positiveInteger(value: unknown, fallback: number, field: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw configurationError(`${field} must be a positive integer.`);
  return parsed;
}

function configurationError(message: string) {
  return new CommasConfigurationError({
    kind: "configuration",
    message,
    status: 0,
    retryable: false,
    resource: "configuration",
    correlationId: "configuration",
  });
}

function requiredOpaqueId(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 200 || /[/?#]/.test(text)) throw configurationError(`${field} must be a valid opaque identifier.`);
  return text;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function parseResponseBody(text: string, response: Response, onParseFailure: (error: unknown) => void) {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    onParseFailure(error);
    if (response.ok) {
      throw new CommasTransientError({
        kind: "transient",
        message: "Commas returned malformed JSON.",
        status: 502,
        retryable: false,
        resource: "response",
        correlationId: "response-validation",
      });
    }
    return { message: "Commas returned a non-JSON error response." };
  }
}

function safeDiagnosticQuery(params: URLSearchParams) {
  return Object.fromEntries(Array.from(params.entries(), ([key, value]) => {
    if (/^(?:page|per_page)$/i.test(key)) return [key, value];
    return [key, /search|email|phone/i.test(key) ? "<redacted>" : "<opaque-id>"];
  }));
}

function safeDiagnosticUrl(url: URL, resource: string) {
  if (resource === "transaction") return `${url.origin}/public-api/transactions/:transactionId`;
  return `${url.origin}${url.pathname}`;
}

function canParseJson(text: string) {
  if (!text) return true;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function safeDiagnosticHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = /authorization|cookie|key|secret|token/i.test(key)
      ? "<redacted>"
      : /rate.?limit.?reset/i.test(key) && /^\d+$/.test(value)
        ? value
        : redactCommasText(value);
  });
  return result;
}

function safeDiagnosticError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown };
  return {
    name: redactCommasText(candidate?.name ?? "Error"),
    message: redactCommasText(candidate?.message ?? "Unknown transport failure"),
  };
}

function providerErrorFields(body: unknown) {
  const root = body !== null && typeof body === "object" ? body as CommasJsonObject : {};
  const error = root.error !== null && typeof root.error === "object" ? root.error as CommasJsonObject : {};
  return {
    code: redactCommasText(root.code ?? error.code ?? "") || null,
    message: redactCommasText(root.message ?? error.message ?? "") || null,
  };
}

function providerRequestIdFrom(headers: Headers, body: unknown) {
  const header = headers.get("x-request-id") || headers.get("request-id");
  const root = body !== null && typeof body === "object" ? body as CommasJsonObject : {};
  const value = header || root.request_id;
  return value === undefined || value === null ? null : safeProviderRequestId(value);
}

function safelyParseForRequestId(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function safeProviderRequestId(value: unknown) {
  const text = String(value).trim();
  return /^[A-Za-z0-9._:-]{1,200}$/.test(text) ? text : "<redacted-request-id>";
}

export function parseRateLimit(headers: Headers): CommasRateLimit {
  return {
    limit: numericHeader(headers.get("X-RateLimit-Limit")),
    remaining: numericHeader(headers.get("X-RateLimit-Remaining")),
    reset: headers.get("X-RateLimit-Reset"),
    retryAfterSeconds: numericHeader(headers.get("Retry-After")),
  };
}

function numericHeader(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

export function retryDelayMs(
  attempt: number,
  retryAfterMs: number | null,
  baseMs: number,
  capMs: number,
  random: () => number,
) {
  if (retryAfterMs !== null) return Math.min(capMs, retryAfterMs);
  const exponential = Math.min(capMs, baseMs * (2 ** Math.max(0, attempt - 1)));
  return Math.min(capMs, Math.round(exponential * (0.75 + random() * 0.5)));
}

function isAbortError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown };
  return String(candidate?.name ?? "").toLowerCase() === "aborterror"
    || String(candidate?.message ?? "").toLowerCase().includes("abort");
}

export type CommasObjectResult<T> = {
  item: T;
  rateLimit: CommasRateLimit;
  providerRequestId: string | null;
  correlationId: string;
  shape: CommasResponseShape;
};

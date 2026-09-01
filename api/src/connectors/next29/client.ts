import { next29ConfigurationError, next29ErrorForStatus, Next29ProviderError, redactNext29Text } from "./errors.ts";
import type {
  Next29ClientConfig,
  Next29Order,
  Next29OrderSummary,
  Next29Page,
  Next29RequestContext,
  Next29Subscription,
  Next29SubscriptionSummary,
} from "./types.ts";
import { NEXT29_STABLE_API_VERSION } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type Next29ClientDependencies = {
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  correlationId?: () => string;
};

type TransportResult = {
  body: unknown;
  headers: Headers;
  providerRequestId: string | null;
  correlationId: string;
};

type ListOptions = {
  cursor?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export class Next29Client {
  readonly store: string;
  readonly baseUrl: string;
  readonly apiVersion: string;

  private readonly accessToken: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly createCorrelationId: () => string;

  constructor(config: Next29ClientConfig, dependencies: Next29ClientDependencies = {}) {
    this.store = normalizeStore(config.store);
    this.accessToken = String(config.accessToken ?? "").trim();
    if (!this.accessToken) throw next29ConfigurationError("29Next access token is required.");

    const expected = `https://${this.store}.29next.store/api/admin/`;
    const parsed = safeUrl(config.baseUrl ?? expected);
    const custom = parsed.toString() !== expected;
    if (custom && !config.allowCustomBaseUrl) throw next29ConfigurationError("A custom 29Next base URL requires explicit allowCustomBaseUrl configuration.");
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw next29ConfigurationError("29Next base URL must use HTTPS outside local tests.");
    }
    if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";

    this.baseUrl = parsed.toString();
    this.apiVersion = String(config.apiVersion ?? NEXT29_STABLE_API_VERSION).trim();
    if (!this.apiVersion) throw next29ConfigurationError("29Next API version is required.");
    this.timeoutMs = positiveInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.maxAttempts = positiveInteger(config.maxAttempts, DEFAULT_MAX_ATTEMPTS, "maxAttempts");
    this.fetcher = dependencies.fetch ?? fetch;
    this.sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = dependencies.random ?? Math.random;
    this.now = dependencies.now ?? Date.now;
    this.createCorrelationId = dependencies.correlationId ?? (() => crypto.randomUUID());
  }

  async listOrders(options: ListOptions = {}, context: Next29RequestContext = {}): Promise<Next29Page<Next29OrderSummary>> {
    return this.listResource<Next29OrderSummary>("orders", "orders/", options, context);
  }

  async getOrder(number: string, context: Next29RequestContext = {}): Promise<{ item: Next29Order; providerRequestId: string | null; correlationId: string }> {
    const orderNumber = requiredId(number, "order number");
    const response = await this.request("order", `orders/${encodeURIComponent(orderNumber)}/`, new URLSearchParams(), context);
    if (!isObject(response.body)) throw next29ConfigurationError("29Next order response was not an object.");
    return { item: response.body as Next29Order, providerRequestId: response.providerRequestId, correlationId: response.correlationId };
  }

  async listSubscriptions(options: ListOptions = {}, context: Next29RequestContext = {}): Promise<Next29Page<Next29SubscriptionSummary>> {
    return this.listResource<Next29SubscriptionSummary>("subscriptions", "subscriptions/", options, context);
  }

  async getSubscription(id: string | number, context: Next29RequestContext = {}): Promise<{ item: Next29Subscription; providerRequestId: string | null; correlationId: string }> {
    const subscriptionId = requiredId(id, "subscription id");
    const response = await this.request("subscription", `subscriptions/${encodeURIComponent(subscriptionId)}/`, new URLSearchParams(), context);
    if (!isObject(response.body)) throw next29ConfigurationError("29Next subscription response was not an object.");
    return { item: response.body as Next29Subscription, providerRequestId: response.providerRequestId, correlationId: response.correlationId };
  }

  async *iterateOrders(options: { maxPages?: number; query?: ListOptions["query"] } = {}, context: Next29RequestContext = {}) {
    yield* this.iterateResource<Next29OrderSummary>("orders", "orders/", options, context);
  }

  async *iterateSubscriptions(options: { maxPages?: number; query?: ListOptions["query"] } = {}, context: Next29RequestContext = {}) {
    yield* this.iterateResource<Next29SubscriptionSummary>("subscriptions", "subscriptions/", options, context);
  }

  private async listResource<T>(resource: string, path: string, options: ListOptions, context: Next29RequestContext): Promise<Next29Page<T>> {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
    }
    return parsePage<T>(await this.request(resource, path, params, context));
  }

  private async *iterateResource<T>(resource: string, path: string, options: { maxPages?: number; query?: ListOptions["query"] }, context: Next29RequestContext) {
    const maxPages = positiveInteger(options.maxPages, 100, "maxPages");
    let nextUrl: string | null = null;
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const page = nextUrl
        ? parsePage<T>(await this.requestAbsolute(resource, nextUrl, context))
        : await this.listResource<T>(resource, path, { query: options.query }, context);
      yield page;
      if (!page.next) return;
      nextUrl = this.validatePaginationUrl(page.next);
    }
    throw next29ConfigurationError(`29Next pagination exceeded the configured ${maxPages}-page bound.`);
  }

  private async request(resource: string, path: string, params: URLSearchParams, context: Next29RequestContext) {
    const url = new URL(path, this.baseUrl);
    url.search = params.toString();
    return this.requestUrl(resource, url, context);
  }

  private async requestAbsolute(resource: string, absoluteUrl: string, context: Next29RequestContext) {
    return this.requestUrl(resource, new URL(this.validatePaginationUrl(absoluteUrl)), context);
  }

  private validatePaginationUrl(value: string) {
    let candidate: URL;
    try { candidate = new URL(value); } catch { throw next29ConfigurationError("29Next pagination URL was invalid."); }
    const base = new URL(this.baseUrl);
    if (candidate.origin !== base.origin || !candidate.pathname.startsWith(base.pathname)) {
      throw next29ConfigurationError("29Next pagination URL escaped the configured Admin API origin.");
    }
    return candidate.toString();
  }

  private async requestUrl(resource: string, url: URL, context: Next29RequestContext): Promise<TransportResult> {
    const correlationId = context.correlationId || this.createCorrelationId();
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url.toString(), context.signal);
        const text = await response.text();
        const body = parseJson(text, response.status);
        const providerRequestId = requestIdFrom(response.headers);
        const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"), this.now());
        if (response.ok) return { body, headers: response.headers, providerRequestId, correlationId };
        const error = next29ErrorForStatus({ status: response.status, message: providerMessage(body) || `29Next ${resource} request failed with HTTP ${response.status}.`, resource, correlationId, providerRequestId, retryAfterMs });
        if (!RETRYABLE_STATUSES.has(response.status) || attempt === this.maxAttempts) throw error;
        lastError = error;
        await this.sleep(retryDelay(attempt, retryAfterMs, this.random));
      } catch (error) {
        if (error instanceof Next29ProviderError) throw error;
        if (context.signal?.aborted) throw error;
        lastError = error;
        if (attempt === this.maxAttempts) {
          throw next29ErrorForStatus({ status: 503, message: `29Next ${resource} request failed: ${redactNext29Text(error instanceof Error ? error.message : error)}`, resource, correlationId });
        }
        await this.sleep(retryDelay(attempt, null, this.random));
      }
    }
    throw lastError instanceof Error ? lastError : next29ConfigurationError("29Next request failed unexpectedly.");
  }

  private async fetchWithTimeout(url: string, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await this.fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${this.accessToken}`, "X-29Next-Api-Version": this.apiVersion, Accept: "application/json" }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

function parsePage<T>(response: TransportResult): Next29Page<T> {
  if (!isObject(response.body) || !Array.isArray(response.body.results)) throw next29ConfigurationError("29Next list response did not contain a results array.");
  return { results: response.body.results as T[], next: optionalUrl(response.body.next), previous: optionalUrl(response.body.previous), providerRequestId: response.providerRequestId, correlationId: response.correlationId, rateLimit: parseRateLimit(response.headers) };
}
function parseJson(text: string, status: number): unknown { if (!text.trim()) return null; try { return JSON.parse(text); } catch { throw next29ConfigurationError(`29Next returned invalid JSON for HTTP ${status}.`); } }
function providerMessage(body: unknown) { if (!isObject(body)) return null; const candidate = body.detail ?? body.message ?? body.error; return typeof candidate === "string" ? redactNext29Text(candidate) : null; }
function requestIdFrom(headers: Headers) { return headers.get("x-request-id") || headers.get("x-29next-request-id") || headers.get("request-id"); }
function parseRateLimit(headers: Headers) { return { limit: optionalInteger(headers.get("x-ratelimit-limit")), remaining: optionalInteger(headers.get("x-ratelimit-remaining")), retryAfterMs: parseRetryAfterMs(headers.get("Retry-After"), Date.now()) }; }
function parseRetryAfterMs(value: string | null, now: number) { if (!value) return null; const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000); const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null; }
function retryDelay(attempt: number, retryAfterMs: number | null, random: () => number) { if (retryAfterMs !== null) return Math.min(retryAfterMs, 30_000); const exponential = Math.min(MAX_BACKOFF_MS, DEFAULT_BACKOFF_MS * 2 ** Math.max(0, attempt - 1)); return Math.round(exponential * (0.75 + random() * 0.5)); }
function normalizeStore(value: unknown) { const store = String(value ?? "").trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(store)) throw next29ConfigurationError("29Next store slug is invalid."); return store; }
function safeUrl(value: string) { try { return new URL(value); } catch { throw next29ConfigurationError("29Next base URL is invalid."); } }
function positiveInteger(value: unknown, fallback: number, label: string) { const candidate = value === undefined ? fallback : Number(value); if (!Number.isInteger(candidate) || candidate < 1) throw next29ConfigurationError(`29Next ${label} must be a positive integer.`); return candidate; }
function requiredId(value: unknown, label: string) { const result = String(value ?? "").trim(); if (!result || result.length > 200) throw next29ConfigurationError(`29Next ${label} is invalid.`); return result; }
function optionalInteger(value: string | null) { if (value === null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function optionalUrl(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function isObject(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

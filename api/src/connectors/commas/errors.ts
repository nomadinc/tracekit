const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?\d[\d().\s-]{7,}\d)/g;
const ISO_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_QUERY_PATTERN = /((?:^|[?&\s])(?:api[_-]?key|token|secret|password)=)[^&\s]+/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;
const SENSITIVE_JSON_KEY_PATTERN = /(?:account|address|authorization|bank|billing|card|credential|cvv|cvc|email|expiry|holder|iban|last4|name|pan|password|payment|phone|postal|routing|secret|token|zip)/i;

export function redactCommasText(value: unknown): string {
  const timestamps: string[] = [];
  return String(value ?? "")
    .replace(ISO_TIMESTAMP_PATTERN, (timestamp) => `__COMMAS_TIMESTAMP_${timestamps.push(timestamp) - 1}__`)
    .replace(EMAIL_PATTERN, "<redacted-email>")
    .replace(PHONE_PATTERN, "<redacted-phone>")
    .replace(BEARER_PATTERN, "<redacted-auth>")
    .replace(SECRET_QUERY_PATTERN, "$1<redacted>")
    .replace(LONG_TOKEN_PATTERN, "<redacted-token>")
    .replace(/__COMMAS_TIMESTAMP_(\d+)__/g, (_match, index: string) => timestamps[Number(index)] ?? "<redacted-timestamp>")
    .slice(0, 300);
}

/** Discovery-only body preview. It is deliberately stricter than provider-error redaction. */
export function redactCommasDiscoveryBody(value: string, maximumLength = 2_048): string {
  const source = value.slice(0, maximumLength);
  try {
    return JSON.stringify(redactDiscoveryValue(JSON.parse(source))).slice(0, maximumLength);
  } catch {
    return source
      .replace(/("(?:account|address|authorization|bank|billing|card|credential|cvv|cvc|email|expiry|holder|iban|last4|name|pan|password|payment|phone|postal|routing|secret|token|zip)[^"]*"\s*:\s*)"(?:[^"\\]|\\.)*"/gi, "$1\"<redacted>\"")
      .replace(EMAIL_PATTERN, "<redacted-email>")
      .replace(PHONE_PATTERN, "<redacted-phone>")
      .replace(BEARER_PATTERN, "<redacted-auth>")
      .replace(SECRET_QUERY_PATTERN, "$1<redacted>")
      .replace(LONG_TOKEN_PATTERN, "<redacted-token>")
      .slice(0, maximumLength);
  }
}

function redactDiscoveryValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_JSON_KEY_PATTERN.test(key)) return "<redacted>";
  if (Array.isArray(value)) return value.map((item) => redactDiscoveryValue(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactDiscoveryValue(child, childKey)]));
  }
  return typeof value === "string" ? redactCommasText(value) : value;
}

export type CommasErrorKind =
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "validation"
  | "not_found"
  | "transient"
  | "configuration";

export type CommasErrorArgs = {
  kind: CommasErrorKind;
  message: string;
  status: number;
  retryable: boolean;
  resource: string;
  correlationId: string;
  providerRequestId?: string | null;
  providerCode?: string | null;
  retryAfterMs?: number | null;
};

export class CommasProviderError extends Error {
  readonly kind: CommasErrorKind;
  readonly status: number;
  readonly retryable: boolean;
  readonly resource: string;
  readonly correlationId: string;
  readonly providerRequestId: string | null;
  readonly providerCode: string | null;
  readonly retryAfterMs: number | null;

  constructor(args: CommasErrorArgs) {
    super(redactCommasText(args.message));
    this.name = new.target.name;
    this.kind = args.kind;
    this.status = args.status;
    this.retryable = args.retryable;
    this.resource = args.resource;
    this.correlationId = args.correlationId;
    this.providerRequestId = args.providerRequestId ?? null;
    this.providerCode = args.providerCode ? redactCommasText(args.providerCode) : null;
    this.retryAfterMs = args.retryAfterMs ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      status: this.status,
      retryable: this.retryable,
      resource: this.resource,
      correlationId: this.correlationId,
      providerRequestId: this.providerRequestId,
      providerCode: this.providerCode,
      retryAfterMs: this.retryAfterMs,
      message: redactCommasText(this.message),
    };
  }
}

export class CommasAuthenticationError extends CommasProviderError {}
export class CommasAuthorizationError extends CommasProviderError {}
export class CommasRateLimitError extends CommasProviderError {}
export class CommasValidationError extends CommasProviderError {}
export class CommasNotFoundError extends CommasProviderError {}
export class CommasTransientError extends CommasProviderError {}
export class CommasConfigurationError extends CommasProviderError {}

export function commasErrorForStatus(args: Omit<CommasErrorArgs, "kind" | "retryable">) {
  const common = { ...args, message: redactCommasText(args.message) };
  if (args.status === 401) return new CommasAuthenticationError({ ...common, kind: "authentication", retryable: false });
  if (args.status === 403) return new CommasAuthorizationError({ ...common, kind: "authorization", retryable: false });
  if (args.status === 404) return new CommasNotFoundError({ ...common, kind: "not_found", retryable: false });
  if (args.status === 429) return new CommasRateLimitError({ ...common, kind: "rate_limit", retryable: true });
  if (args.status === 400 || args.status === 422) {
    return new CommasValidationError({ ...common, kind: "validation", retryable: false });
  }
  if (args.status >= 500 || args.status === 408) {
    return new CommasTransientError({ ...common, kind: "transient", retryable: true });
  }
  return new CommasValidationError({ ...common, kind: "validation", retryable: false });
}

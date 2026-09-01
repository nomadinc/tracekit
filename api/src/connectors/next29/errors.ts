const AUTH_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const LONG_SECRET_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g;

export type Next29ErrorKind =
  | "authentication"
  | "authorization"
  | "rate_limit"
  | "validation"
  | "not_found"
  | "transient"
  | "configuration";

export function redactNext29Text(value: unknown) {
  return String(value ?? "")
    .replace(AUTH_PATTERN, "Bearer <redacted>")
    .replace(LONG_SECRET_PATTERN, "<redacted-token>")
    .slice(0, 500);
}

export class Next29ProviderError extends Error {
  readonly kind: Next29ErrorKind;
  readonly status: number;
  readonly retryable: boolean;
  readonly resource: string;
  readonly correlationId: string;
  readonly providerRequestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(args: {
    kind: Next29ErrorKind;
    message: string;
    status: number;
    retryable: boolean;
    resource: string;
    correlationId: string;
    providerRequestId?: string | null;
    retryAfterMs?: number | null;
  }) {
    super(redactNext29Text(args.message));
    this.name = "Next29ProviderError";
    this.kind = args.kind;
    this.status = args.status;
    this.retryable = args.retryable;
    this.resource = args.resource;
    this.correlationId = args.correlationId;
    this.providerRequestId = args.providerRequestId ?? null;
    this.retryAfterMs = args.retryAfterMs ?? null;
  }
}

export function next29ConfigurationError(message: string) {
  return new Next29ProviderError({
    kind: "configuration",
    message,
    status: 0,
    retryable: false,
    resource: "configuration",
    correlationId: "configuration",
  });
}

export function next29ErrorForStatus(args: {
  status: number;
  message: string;
  resource: string;
  correlationId: string;
  providerRequestId?: string | null;
  retryAfterMs?: number | null;
}) {
  const common = { ...args };
  if (args.status === 401) return new Next29ProviderError({ ...common, kind: "authentication", retryable: false });
  if (args.status === 403) return new Next29ProviderError({ ...common, kind: "authorization", retryable: false });
  if (args.status === 404) return new Next29ProviderError({ ...common, kind: "not_found", retryable: false });
  if (args.status === 429) return new Next29ProviderError({ ...common, kind: "rate_limit", retryable: true });
  if (args.status === 408 || args.status >= 500) return new Next29ProviderError({ ...common, kind: "transient", retryable: true });
  return new Next29ProviderError({ ...common, kind: "validation", retryable: false });
}

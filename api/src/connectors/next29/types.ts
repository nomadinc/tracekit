export const NEXT29_STABLE_API_VERSION = "2024-04-01" as const;

export type Next29ClientConfig = {
  store: string;
  accessToken: string;
  apiVersion?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  allowCustomBaseUrl?: boolean;
};

export type Next29RequestContext = {
  correlationId?: string;
  signal?: AbortSignal;
};

export type Next29Page<T> = {
  results: T[];
  next: string | null;
  previous: string | null;
  providerRequestId: string | null;
  correlationId: string;
  rateLimit: {
    limit: number | null;
    remaining: number | null;
    retryAfterMs: number | null;
  };
};

export type Next29Attribution = {
  affiliate?: string | null;
  funnel?: string | null;
  gclid?: string | null;
  subaffiliate1?: string | null;
  subaffiliate2?: string | null;
  subaffiliate3?: string | null;
  subaffiliate4?: string | null;
  subaffiliate5?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_medium?: string | null;
  utm_source?: string | null;
  utm_term?: string | null;
  metadata?: unknown;
  [key: string]: unknown;
};

export type Next29OrderSummary = {
  number: string;
  created_at?: string | null;
  updated_at?: string | null;
  date_placed?: string | null;
  currency?: string | null;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  total_incl_tax?: string | null;
  total_excl_tax?: string | null;
  total_tax?: string | null;
  total_discount?: string | null;
  source?: string | null;
  is_test?: boolean | null;
  user?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type Next29Order = Next29OrderSummary & {
  attribution?: Next29Attribution | null;
  lines?: unknown[];
  billing_address?: Record<string, unknown> | null;
  shipping_address?: Record<string, unknown> | null;
};

export type Next29EvidenceResource = "orders" | "order";

export type Next29EvidenceEnvelope = {
  provider: "next29";
  apiVersion: string;
  resource: Next29EvidenceResource;
  sourceObjectId: string;
  observedAt: string;
  payload: unknown;
};

export type Next29EvidenceSink = {
  putImmutable(input: {
    organizationId: string;
    connectionId: string;
    providerAccountId: string;
    sourceObjectType: string;
    sourceObjectId: string;
    observedAt: string;
    payload: Uint8Array;
    contentType: "application/json";
  }): Promise<{
    storageReference: string;
    payloadHash: string;
    byteSize: number;
  }>;
};

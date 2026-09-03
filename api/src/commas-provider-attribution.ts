export const COMMAS_ATTRIBUTION_EVENT_TYPES = ["product.purchased", "subscription.created"] as const;
export type CommasAttributionEventType = typeof COMMAS_ATTRIBUTION_EVENT_TYPES[number];
export const COMMAS_WEBHOOK_EVENT_TYPES = ["dispute.created", "dispute.updated", ...COMMAS_ATTRIBUTION_EVENT_TYPES] as const;

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const bounded = (value: unknown, maximum = 512) => {
  const candidate = text(value);
  return candidate && candidate.length <= maximum ? candidate : null;
};

const SECRET_KEY = /(?:^|[_-])(secret|token|password|authorization|cookie|api[_-]?key)(?:$|[_-])/i;
const KNOWN_KEYS = new Set(["affid", "sub1", "sub4", "_ef_transaction_id", "transaction_id", "tid", "c1"]);

export type CommasAttributionParameters = {
  affiliateId: string | null;
  sub1: string | null;
  sub4: string | null;
  efTransactionId: string | null;
  transactionId: string | null;
  tid: string | null;
  c1: string | null;
  aliasState: "all_agree" | "single_alias" | "conflict" | "none";
  restrictedMetadata: {
    additional_param_keys: string[];
    unknown_param_keys: string[];
    rejected_normalized_keys: string[];
    secret_like_keys_present: boolean;
  };
};

export type NormalizedCommasAttributionEvent = {
  providerEventId: string;
  eventType: CommasAttributionEventType;
  providerCreatedAt: string | null;
  paymentPublicTransactionId: string | null;
  paymentIdentityState: "valid" | "malformed" | "missing";
  subscriptionProviderId: string | null;
  parameters: CommasAttributionParameters;
};

export function isValidCommasPublicTransactionId(value: unknown): value is string {
  return typeof value === "string" && /^ORD-[A-Za-z0-9_-]{1,120}$/.test(value.trim());
}

export function normalizeCommasAdditionalParams(value: unknown): CommasAttributionParameters {
  const params = object(value);
  const keys = Object.keys(params).filter((key) => key.length <= 128).sort();
  const rejected: string[] = [];
  const read = (key: string, maximum = 512) => {
    const raw = text(params[key]);
    const normalized = bounded(params[key], maximum);
    if (raw && !normalized) rejected.push(key);
    return normalized;
  };
  const efTransactionId = read("_ef_transaction_id");
  const transactionId = read("transaction_id");
  const tid = read("tid");
  const c1 = read("c1");
  const aliases = [efTransactionId, transactionId, tid, c1].filter((item): item is string => Boolean(item));
  const distinct = new Set(aliases);
  const aliasState = aliases.length === 0 ? "none" : aliases.length === 1 ? "single_alias" : distinct.size === 1 ? "all_agree" : "conflict";
  return {
    affiliateId: read("affid", 256),
    sub1: read("sub1"),
    sub4: read("sub4"),
    efTransactionId,
    transactionId,
    tid,
    c1,
    aliasState,
    restrictedMetadata: {
      additional_param_keys: keys,
      unknown_param_keys: keys.filter((key) => !KNOWN_KEYS.has(key) && !SECRET_KEY.test(key)),
      rejected_normalized_keys: [...new Set(rejected)].sort(),
      secret_like_keys_present: keys.some((key) => SECRET_KEY.test(key)),
    },
  };
}

export function normalizeCommasAttributionEvent(payload: unknown): NormalizedCommasAttributionEvent | null {
  const root = object(payload);
  const eventType = text(root.type || root.event_type);
  if (!eventType || !COMMAS_ATTRIBUTION_EVENT_TYPES.includes(eventType as CommasAttributionEventType)) return null;
  const data = object(root.data);
  const providerEventId = bounded(root.id || root.event_id, 256);
  if (!providerEventId) return null;
  if (eventType === "product.purchased") {
    const paymentId = bounded(root.payment_id ?? data.payment_id, 256);
    return {
      providerEventId,
      eventType,
      providerCreatedAt: bounded(root.created_at ?? data.created_at, 64),
      paymentPublicTransactionId: paymentId,
      paymentIdentityState: !paymentId ? "missing" : isValidCommasPublicTransactionId(paymentId) ? "valid" : "malformed",
      subscriptionProviderId: null,
      parameters: normalizeCommasAdditionalParams(root.additional_params),
    };
  }
  const subscription = object(root.subscription ?? data.subscription);
  return {
    providerEventId,
    eventType: eventType as CommasAttributionEventType,
    providerCreatedAt: bounded(root.created_at ?? subscription.created_at, 64),
    paymentPublicTransactionId: null,
    paymentIdentityState: "missing",
    subscriptionProviderId: bounded(subscription.id ?? subscription.subscription_id, 256),
    parameters: normalizeCommasAdditionalParams(subscription.additional_params),
  };
}

export type EverflowAttributionIdentity = { transactionId?: unknown; affiliateId?: unknown; sub1?: unknown; sub4?: unknown };
export function compareCommasAttributionToEverflow(parameters: CommasAttributionParameters, everflow: EverflowAttributionIdentity | null) {
  const commasTid = parameters.aliasState === "conflict" ? null : parameters.efTransactionId || parameters.transactionId || parameters.tid || parameters.c1;
  if (!commasTid) return { state: "no_commas_tid" as const, matched_fields: [], conflicting_fields: [] };
  if (!everflow) return { state: "no_everflow_record" as const, matched_fields: [], conflicting_fields: [] };
  const pairs: Array<[string, string | null, string | null]> = [
    ["transaction_id", commasTid, bounded(everflow.transactionId)],
    ["affiliate_id", parameters.affiliateId, bounded(everflow.affiliateId, 256)],
    ["sub1", parameters.sub1, bounded(everflow.sub1)],
    ["sub4", parameters.sub4, bounded(everflow.sub4)],
  ];
  const matched = pairs.filter(([, left, right]) => left && right && left === right).map(([field]) => field);
  const conflicting = pairs.filter(([, left, right]) => left && right && left !== right).map(([field]) => field);
  return {
    state: conflicting.length ? "conflict" as const : matched.length === pairs.filter(([, left, right]) => left && right).length ? "exact_match" as const : "partial_match" as const,
    matched_fields: matched,
    conflicting_fields: conflicting,
  };
}

export function attributionWebhookStoragePath(organizationId: string, connectionId: string, providerAccountId: string, eventType: CommasAttributionEventType, payloadHash: string) {
  return `${organizationId}/${connectionId}/${providerAccountId}/commas-attribution-webhook/${eventType}/${payloadHash}.json`;
}

export const COMMAS_DISPUTE_EVENT_TYPES = ["dispute.created", "dispute.updated"] as const;
/** Provider-confirmed platform currency; never infer it from an absent payload field. */
export const COMMAS_CURRENCY = "USD" as const;
export const LIVE_COMMAS_DISPUTE_RECOVERY_POSTING = "UNSUPPORTED" as const;
export const COMMAS_DISPUTE_WALLET_POSTING = "UNSUPPORTED" as const;
/** Neither a dispute status nor webhook event ID identifies a wallet movement. */
export function hasProviderEconomicEntryIdentity(value: { providerLedgerEntryId?: string | null }) {
  return Boolean(text(value.providerLedgerEntryId));
}
export type CommasDisputeEventType = typeof COMMAS_DISPUTE_EVENT_TYPES[number];

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const numberValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export type NormalizedCommasDisputeEvent = {
  providerEventId: string;
  eventType: CommasDisputeEventType;
  createdAt: string | null;
  updatedAt: string | null;
  providerDisputeId: string;
  processorDisputeId: string | null;
  paymentIntentId: string | null;
  paymentId: string | null;
  providerTransactionId: string | null;
  orderId: string | null;
  externalOrderId: string | null;
  amount: number | null;
  currency: string | null;
  fee: number | null;
  totalAmount: number | null;
  status: string | null;
  state: string | null;
  reason: string | null;
  reasonCode: string | null;
  responseDeadline: string | null;
  openedAt: string | null;
  closedAt: string | null;
  buyerReference: string | null;
  productReference: string | null;
};

function disputeData(payload: Record<string, unknown>) {
  const data = object(payload.data);
  return object(data.dispute || data.chargeback || data.object || data);
}

export function normalizeCommasDisputeEvent(payload: unknown): NormalizedCommasDisputeEvent | null {
  const root = object(payload);
  const eventType = text(root.type || root.event_type);
  if (!eventType || !COMMAS_DISPUTE_EVENT_TYPES.includes(eventType as CommasDisputeEventType)) return null;
  const data = disputeData(root);
  const providerEventId = text(root.id || root.event_id);
  const providerDisputeId = text(data.dispute_id || data.chargeback_id || data.id);
  if (!providerEventId || !providerDisputeId) return null;
  const buyer = object(data.buyer || data.customer);
  const product = object(data.product || data.item);
  const suppliedCurrency = text(data.currency)?.toUpperCase();
  if (suppliedCurrency && suppliedCurrency !== COMMAS_CURRENCY) return null;
  return {
    providerEventId,
    eventType: eventType as CommasDisputeEventType,
    createdAt: text(root.created_at || data.created_at),
    updatedAt: text(data.updated_at || root.updated_at),
    providerDisputeId,
    processorDisputeId: text(data.processor_dispute_id || data.processor_id),
    paymentIntentId: text(data.payment_intent_id),
    paymentId: text(data.payment_id),
    providerTransactionId: text(data.transaction_id || data.provider_transaction_id),
    orderId: text(data.order_id),
    externalOrderId: text(data.external_order_id || data.external_order_reference),
    amount: numberValue(data.amount),
    currency: COMMAS_CURRENCY,
    fee: numberValue(data.dispute_fee || data.fee),
    totalAmount: numberValue(data.total_amount),
    status: text(data.status),
    state: text(data.state),
    reason: text(data.reason),
    reasonCode: text(data.reason_code),
    responseDeadline: text(data.due_by || data.response_deadline),
    openedAt: text(data.opened_at || data.dispute_date || data.created_at),
    closedAt: text(data.closed_at || data.closed_date),
    buyerReference: text(buyer.id || data.buyer_id || data.customer_id),
    productReference: text(product.id || data.product_id || data.sku),
  };
}

/** Provider event IDs dedupe observations, never economic wallet movements. */
export type DisputeProjectionDecision = "create" | "advance" | "stale" | "safe_tie_noop" | "ambiguous_tie" | "terminal_conflict";
// Both warning variants are observed in retained lifecycle Evidence; their
// needs_response -> under_review transition has also been observed.
const statusRank: Record<string, number> = { needs_response: 0, warning_needs_response: 0, under_review: 1, warning_under_review: 1, won: 2, lost: 2 };
const stateFields = ["providerDisputeId", "processorDisputeId", "paymentIntentId", "paymentId", "providerTransactionId", "orderId", "externalOrderId", "amount", "currency", "fee", "totalAmount", "status", "state", "reason", "reasonCode", "responseDeadline", "openedAt", "closedAt", "buyerReference", "productReference"] as const;
export function classifyCommasDisputeProjection(incoming: NormalizedCommasDisputeEvent, current: NormalizedCommasDisputeEvent | null): DisputeProjectionDecision {
  if (!current) return "create";
  const nextTime = Date.parse(incoming.updatedAt || "");
  const priorTime = Date.parse(current.updatedAt || "");
  if (!Number.isFinite(nextTime) || !Number.isFinite(priorTime) || incoming.providerDisputeId !== current.providerDisputeId) throw new Error("dispute_provider_state_unorderable");
  const nextRank = incoming.status ? statusRank[incoming.status] : undefined;
  const priorRank = current.status ? statusRank[current.status] : undefined;
  if ((nextRank === undefined || priorRank === undefined) && incoming.status !== current.status) return "ambiguous_tie";
  if (nextRank !== undefined && priorRank !== undefined) {
    if (nextRank === 2 && priorRank === 2 && incoming.status !== current.status) return "terminal_conflict";
    if (nextRank > priorRank) return "advance";
    if (nextRank < priorRank) return "stale";
  }
  if (nextTime > priorTime) return "advance";
  if (nextTime < priorTime) return "stale";
  return stateFields.every(field => incoming[field] === current[field]) ? "safe_tie_noop" : "ambiguous_tie";
}

export function commasDisputeProjectionValues(event: NormalizedCommasDisputeEvent, scope: { organizationId: string; accountId: string; connectionId: string; providerAccountId: string; eventId: string; evidenceId: string }) {
  if (!event.updatedAt || !Number.isFinite(Date.parse(event.updatedAt))) throw new Error("dispute_provider_state_unorderable");
  return { organization_id: scope.organizationId, account_id: scope.accountId, connection_id: scope.connectionId, provider_account_id: scope.providerAccountId, provider_dispute_id: event.providerDisputeId, latest_event_id: scope.eventId, latest_evidence_id: scope.evidenceId, provider_transaction_id: event.providerTransactionId, payment_intent_id: event.paymentIntentId, payment_id: event.paymentId, order_id: event.orderId, external_order_id: event.externalOrderId, amount: event.amount, currency: event.currency, fee: event.fee, status: event.status, state: event.state, reason: event.reason, reason_code: event.reasonCode, response_deadline: event.responseDeadline, opened_at: event.openedAt, updated_at: event.updatedAt, closed_at: event.closedAt, buyer_reference: event.buyerReference, product_reference: event.productReference };
}

const encoder = new TextEncoder();
export async function sha256HexBytes(input: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, Uint8Array.from(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyCommasWebhookSignature(rawBody: Uint8Array, supplied: string | null, secret: string | null | undefined) {
  return verifyCommasWebhookSignatureAgainstSecrets(rawBody, supplied, secret == null ? [] : [secret]);
}

/** Verify against the bounded primary/overlap secret set without exposing which matched. */
export async function verifyCommasWebhookSignatureAgainstSecrets(rawBody: Uint8Array, supplied: string | null, secrets: readonly (string | null | undefined)[]) {
  if (!supplied) return false;
  const primary = secrets[0];
  if (typeof primary !== "string" || primary.trim().length === 0) return false;
  const active = secrets.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
  if (active.length === 0 || active.length > 2) return false;
  if (new Set(active).size !== active.length) return false;
  let valid = false;
  for (const secret of active) valid = (await verifyCommasWebhookSignatureSingle(rawBody, supplied, secret)) || valid;
  return valid;
}

async function verifyCommasWebhookSignatureSingle(rawBody: Uint8Array, supplied: string, secret: string) {
  const expected = await hmacSha256Hex(secret, rawBody);
  const actual = supplied.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(actual) || actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return mismatch === 0;
}

export function webhookStoragePath(organizationId: string, connectionId: string, providerAccountId: string, payloadHash: string) {
  return `${organizationId}/${connectionId}/${providerAccountId}/commas-dispute-webhook/${payloadHash}.json`;
}

/** Logical overlap duplicate: transport/event IDs may differ across subscriptions. */
export function isLogicalDisputeDeliveryDuplicate(existing: { providerDisputeId?: string; eventType?: string; payloadHash?: string } | null | undefined, event: Pick<NormalizedCommasDisputeEvent, "providerDisputeId" | "eventType">, payloadHash: string) {
  return Boolean(existing && existing.providerDisputeId === event.providerDisputeId && existing.eventType === event.eventType && existing.payloadHash === payloadHash);
}

export const COMMAS_DISPUTE_EVENT_TYPES = ["dispute.created", "dispute.updated"] as const;
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
  const currency = text(data.currency)?.toUpperCase() || null;
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
    currency,
    fee: numberValue(data.dispute_fee || data.fee),
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

const encoder = new TextEncoder();
export async function sha256HexBytes(input: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, body);
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyCommasWebhookSignature(rawBody: Uint8Array, supplied: string | null, secret: string | null | undefined) {
  if (!supplied || !secret) return false;
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

export function deriveCommasDisputeLedgerEvents(event: NormalizedCommasDisputeEvent, processorAccountId: string) {
  if (!event.providerTransactionId || !event.currency || event.amount === null || !["lost", "lost_rdr"].includes(String(event.status || "").toLowerCase())) return [];
  const base = { transaction_id: event.providerTransactionId, processor_account_id: processorAccountId, currency: event.currency, occurred_at: event.updatedAt || event.closedAt || event.createdAt || new Date().toISOString(), status: event.status, reason: event.reason, dispute_id: event.providerDisputeId, platform: "commas", event_source: "commas", ingestion_method: "webhook", connector_id: "commas", source_direction: "debit" };
  const effects = [{ ...base, ledger_type: "chargeback", amount: event.amount, source_event_id: event.providerEventId, source_amount: event.amount }];
  if (event.fee !== null && event.fee !== 0) effects.push({ ...base, ledger_type: "chargeback_fee", amount: event.fee, source_event_id: `${event.providerEventId}:fee`, source_amount: event.fee });
  return effects;
}

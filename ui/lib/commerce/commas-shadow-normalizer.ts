import { createHash } from "node:crypto";
import { decodeHex, encodeHex } from "./web-encoding.ts";

type Json = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value.trim() || null : value == null ? null : String(value).trim() || null;
const object = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;

function decimal(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error("Commas transaction contains an invalid monetary value.");
  return String(parsed);
}

function timestamp(value: unknown) {
  const candidate = text(value);
  if (!candidate || Number.isNaN(Date.parse(candidate))) throw new Error("Commas transaction timestamp is invalid.");
  return new Date(candidate).toISOString();
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Json).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function sha256(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }

export function deterministicUuid(scope: string) {
  const bytes = decodeHex(sha256(scope).slice(0, 32));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = encodeHex(bytes);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function normalizeEmail(value: unknown) { return text(value)?.toLowerCase() ?? null; }
export function normalizePhone(value: unknown) {
  const candidate = text(value); if (!candidate) return null;
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

export type NormalizedCommasTransaction = ReturnType<typeof normalizeCommasTransaction>;

export function normalizeCommasTransaction(input: Json, scope: { connectionId: string; providerAccountId: string }) {
  const transactionId = text(input.id); const fan = object(input.fan); const product = object(input.product) || object(input.service); const payment = object(input.servicePayment);
  const fanId = text(fan?.id); const productId = text(product?.id);
  if (!transactionId || !fanId || !productId) throw new Error("Commas transaction identity is incomplete.");
  const transactionAt = timestamp(input.transaction_date);
  const customerEmail = normalizeEmail(fan?.email); const customerPhone = normalizePhone(fan?.phone);
  const root = `${scope.connectionId}:${scope.providerAccountId}`;
  const personId = deterministicUuid(`${root}:customer:${fanId}`);
  const productUuid = deterministicUuid(`${root}:product:${productId}`);
  const canonicalOrderId = deterministicUuid(`${root}:transaction:${transactionId}`);
  const productTitle = text(product?.title) ?? "Unknown provider Product";
  const paymentLink = text(product?.payment_link);
  const paymentType = text(payment?.payment_type);
  const fundReleased = typeof payment?.fund_released === "boolean" ? String(payment.fund_released) : null;
  return {
    transaction_id: transactionId,
    public_transaction_id: text(input.public_transaction_id),
    platform_order_id: `commas:${scope.connectionId}:${scope.providerAccountId}:${transactionId}`,
    canonical_order_id: canonicalOrderId,
    order_mapping_id: deterministicUuid(`${root}:mapping:transaction:${transactionId}`),
    order_line_id: deterministicUuid(`${root}:line:${transactionId}:product:0`),
    sale_event_id: deterministicUuid(`${root}:event:sale:${transactionId}`),
    fee_event_id: deterministicUuid(`${root}:event:provider_fee:${transactionId}`),
    fan_id: fanId,
    person_id: personId,
    customer_identity_id: deterministicUuid(`${root}:identity:customer:${fanId}`),
    email_identity_id: deterministicUuid(`${root}:identity:email:${fanId}:${customerEmail ?? "missing"}`),
    customer_name: text(fan?.name), customer_email: customerEmail, customer_phone: customerPhone,
    product_id: productId, product_uuid: productUuid, product_title: productTitle,
    product_internal_name: text(product?.internal_name), product_description: text(product?.description),
    product_price: decimal(product?.price), payment_link_hash: paymentLink ? sha256(paymentLink) : null,
    transaction_at: transactionAt, gross_amount: decimal(input.amount), provider_fee: decimal(input.fee_amount), provider_net: decimal(input.net_amount),
    currency: null, payment_reference: text(payment?.id), payment_type: paymentType,
    fund_release_on: text(payment?.fund_release_on), fund_released: fundReleased,
    payload_hash: sha256(stable(input)), refunds: normalizeRefunds(input,scope),
  };
}

export function refundSchemaObservations(transactions: Json[]) {
  const refund = transactions.flatMap((item) => Array.isArray(item.refunds) ? item.refunds : []).find((item) => object(item));
  if (!refund) return null;
  return Object.fromEntries(Object.entries(refund as Json).map(([key,value]) => [key, value === null ? "null" : Array.isArray(value) ? "array" : typeof value]).sort(([a],[b]) => a.localeCompare(b)));
}

const VERIFIED_REFUND_KEYS = ["amount","amount_gross","created_at","fee","id","payment_id","refund_cost"];
export function normalizeRefunds(input: Json, scope: { connectionId: string; providerAccountId: string }) {
  if (!Array.isArray(input.refunds)) return [];
  const transactionId=text(input.id); if(!transactionId)throw new Error("Refund parent Transaction identity is missing.");
  return input.refunds.map((value)=>{
    const refund=object(value); if(!refund)throw new Error("Commas Refund item is malformed.");
    const keys=Object.keys(refund).sort(); if(keys.some((key)=>!VERIFIED_REFUND_KEYS.includes(key)))throw new Error("Commas Refund schema changed and requires review.");
    const refundId=text(refund.id),occurredAt=timestamp(refund.created_at);if(!refundId)throw new Error("Commas Refund identity is missing.");
    const root=`${scope.connectionId}:${scope.providerAccountId}:refund:${refundId}`;
    return {refund_id:refundId,refund_uuid:deterministicUuid(root),mapping_id:deterministicUuid(`${root}:mapping`),refund_event_id:deterministicUuid(`${root}:event`),refund_fee_event_id:deterministicUuid(`${root}:fee-event`),payment_id:text(refund.payment_id),amount:decimal(refund.amount),amount_gross:decimal(refund.amount_gross),fee:decimal(refund.fee),refund_cost:decimal(refund.refund_cost),occurred_at:occurredAt,payload_hash:sha256(stable(refund))};
  });
}

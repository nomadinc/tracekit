import "server-only";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { CanonicalConversion } from "../../../api/src/everflow-scrubber.ts";
import type { MockForwardOutcome, ScrubberMockForwarder } from "./everflow-scrubber-gateway";

export const EVERFLOW_TRANSACTION_ID_CONVERSION_URL = "https://api.eflow.team/v1/networks/conversions/reporting/transaction_ids";
export const EVERFLOW_FORWARD_TIMEOUT_MS = 10_000;

export type EverflowTransactionIdConversionPayload = {
  is_now: true;
  offer_id: number;
  timezone_id: number;
  event_id: number;
  transaction_ids: string[];
  is_payout_amount_submitted: false;
  revenue_amount?: number;
  is_revenue_amount_submitted?: true;
  order_id?: string;
  coupon_code?: string;
  email?: string;
  adv1?: string;
  adv2?: string;
  adv3?: string;
  adv4?: string;
  adv5?: string;
  adv6?: string;
  adv7?: string;
  adv8?: string;
  adv9?: string;
  adv10?: string;
};

function eventId(conversion: CanonicalConversion) {
  if (!conversion.eventId) return 0;
  if (!/^[0-9]+$/.test(conversion.eventId)) throw new Error("Everflow event_id must be a non-negative integer.");
  const value = Number(conversion.eventId);
  if (!Number.isSafeInteger(value)) throw new Error("Everflow event_id is outside the supported integer range.");
  return value;
}

export function buildEverflowTransactionIdConversionPayload(input: {
  conversion: CanonicalConversion;
  timezoneId: number;
}): EverflowTransactionIdConversionPayload {
  const offerId = Number(input.conversion.offerId);
  if (!Number.isSafeInteger(offerId) || offerId <= 0) throw new Error("Everflow offer_id is invalid.");
  if (!Number.isSafeInteger(input.timezoneId) || input.timezoneId <= 0) throw new Error("Everflow timezone_id is invalid.");
  const payload: EverflowTransactionIdConversionPayload = {
    is_now: true,
    offer_id: offerId,
    timezone_id: input.timezoneId,
    event_id: eventId(input.conversion),
    transaction_ids: [input.conversion.transactionId],
    is_payout_amount_submitted: false,
  };
  if (input.conversion.amount !== null) {
    payload.revenue_amount = input.conversion.amount;
    payload.is_revenue_amount_submitted = true;
  }
  if (input.conversion.orderId) payload.order_id = input.conversion.orderId;
  if (input.conversion.couponCode) payload.coupon_code = input.conversion.couponCode;
  if (input.conversion.email) payload.email = input.conversion.email;
  for (let index = 1; index <= 10; index += 1) {
    const key = `adv${index}` as keyof EverflowTransactionIdConversionPayload;
    const value = input.conversion.adv[`adv${index}`];
    if (value) (payload as Record<string, unknown>)[key] = value;
  }
  return payload;
}

export async function forwardEverflowTransactionIdConversion(input: {
  apiKey: string;
  payload: EverflowTransactionIdConversionPayload;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MockForwardOutcome> {
  if (input.apiKey.trim().length < 8) return { outcome: "permanent_failure", errorCode: "everflow_authentication_unavailable" };
  const controller = new AbortController();
  const timeoutMs = Math.min(EVERFLOW_FORWARD_TIMEOUT_MS, Math.max(1_000, input.timeoutMs || EVERFLOW_FORWARD_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl || fetch)(EVERFLOW_TRANSACTION_ID_CONVERSION_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Eflow-Api-Key": input.apiKey },
      body: JSON.stringify(input.payload),
    });
    const body = await response.json().catch(() => null) as { result?: unknown; message?: unknown; error?: unknown } | null;
    if (response.ok && body?.result === true) return { outcome: "succeeded", httpStatus: response.status, responseReference: "everflow:result:true" };
    const errorCode = response.status === 401 || response.status === 403 ? "everflow_authentication_failed"
      : response.status === 429 ? "everflow_rate_limited"
      : response.status >= 500 ? "everflow_unavailable"
      : response.ok ? "everflow_result_false" : `everflow_http_${response.status}`;
    if (response.status === 429 || response.status >= 500) return { outcome: "retryable_failure", errorCode, retryAt: new Date(Date.now() + 60_000).toISOString() };
    return { outcome: "permanent_failure", errorCode, httpStatus: response.status };
  } catch (error) {
    const timeout = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    return { outcome: "retryable_failure", errorCode: timeout ? "everflow_timeout" : "everflow_unavailable", retryAt: new Date(Date.now() + 60_000).toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

export function liveEverflowForwardingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.LIVE_EVERFLOW_FORWARDING_ENABLED === "true";
}

export class DisabledEverflowForwarder implements ScrubberMockForwarder {
  async forward(): Promise<MockForwardOutcome> { throw new Error("Live Everflow forwarding is disabled."); }
}

export class RealEverflowForwarder implements ScrubberMockForwarder {
  async forward(input: { conversionId: string; conversion: CanonicalConversion }): Promise<MockForwardOutcome> {
    if (!liveEverflowForwardingEnabled()) throw new Error("Live Everflow forwarding is disabled.");
    const conversionRows = await commercePersistenceRequest(`everflow_scrubber_conversions?id=eq.${encodeURIComponent(input.conversionId)}&select=organization_id,connection_id&limit=1`);
    const row = conversionRows[0];
    if (!row) return { outcome: "permanent_failure", errorCode: "scrubber_conversion_unavailable" };
    const connectionRows = await commercePersistenceRequest(`commerce_provider_connections?id=eq.${encodeURIComponent(String(row.connection_id))}&organization_id=eq.${encodeURIComponent(String(row.organization_id))}&provider=eq.everflow&status=in.(connected,degraded)&select=capabilities&limit=1`);
    const network = (connectionRows[0]?.capabilities as { everflowNetwork?: { timezoneId?: unknown } } | undefined)?.everflowNetwork;
    const timezoneId = Number(network?.timezoneId);
    const credentialRows = await commercePersistenceRequest(`commerce_provider_credentials?connection_id=eq.${encodeURIComponent(String(row.connection_id))}&organization_id=eq.${encodeURIComponent(String(row.organization_id))}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&order=created_at.desc&limit=1`);
    const credential = credentialRows[0];
    if (!credential) return { outcome: "permanent_failure", errorCode: "everflow_credential_unavailable" };
    const apiKey = await decryptCommerceCredential({
      keyId: String(credential.encryption_key_id), encryptionVersion: Number(credential.encryption_version),
      iv: bytea(String(credential.secret_iv)), ciphertext: bytea(String(credential.secret_ciphertext)),
    }, decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
    return forwardEverflowTransactionIdConversion({ apiKey, payload: buildEverflowTransactionIdConversionPayload({ conversion: input.conversion, timezoneId }) });
  }
}

export function configuredEverflowForwarder(): ScrubberMockForwarder {
  return liveEverflowForwardingEnabled() ? new RealEverflowForwarder() : new DisabledEverflowForwarder();
}

function bytea(value: string) {
  const text = String(value || "");
  if (text.startsWith("\\x")) return Uint8Array.from(Buffer.from(text.slice(2), "hex"));
  return Uint8Array.from(Buffer.from(text, "base64"));
}

import "server-only";

import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  buildEverflowForwardingParameters,
  conversionIdempotencyKey,
  normalizeConversionPayload,
  type CanonicalConversion,
} from "../../../api/src/everflow-scrubber.ts";

const MAX_BODY_BYTES = 64 * 1024;

type SourceScope = {
  id: string;
  organizationId: string;
  connectionId: string;
  sourceKey: string;
  eligibleEventKeys: string[];
};

export type GatewayDecision = {
  conversionId: string;
  decision: "PASS" | "SCRUB";
  reason: string;
  duplicate: boolean;
  forwardStatus: string;
  rulePeriodId: string | null;
  effectivePassRate: number | null;
};

export type MockForwardOutcome =
  | { outcome: "succeeded"; httpStatus: number; responseReference: string }
  | { outcome: "retryable_failure"; errorCode: string; retryAt: string };

export interface ScrubberGatewayRepository {
  authenticate(tokenSha256: string): Promise<SourceScope | null>;
  recordRejected(input: { requestId: string; source: SourceScope | null; reason: "REJECT_INVALID_REQUEST" | "REJECT_UNAUTHORIZED_REQUEST"; payloadSha256: string; errors: string[] }): Promise<void>;
  decide(input: {
    requestId: string;
    source: SourceScope;
    conversion: CanonicalConversion;
    idempotencyKey: string;
    eligible: boolean;
    randomUnit: number;
    requestPayload: Record<string, unknown>;
    forwardingPayload: Record<string, string>;
  }): Promise<GatewayDecision>;
  recordMockForward(conversionId: string, outcome: MockForwardOutcome): Promise<{ forwardStatus: string; attemptNumber: number; nextRetryAt: string | null }>;
}

export interface ScrubberMockForwarder {
  forward(input: { conversionId: string; parameters: URLSearchParams }): Promise<MockForwardOutcome>;
}

export class ScrubberGatewayError extends Error {
  constructor(readonly status: number, readonly code: string, readonly requestId: string) {
    super(code);
    this.name = "ScrubberGatewayError";
  }
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const randomUnit = () => randomInt(0, 2 ** 32) / 2 ** 32;

function bearerToken(header: string | null) {
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(String(header || ""));
  return match?.[1] || null;
}

function redactedPayload(conversion: CanonicalConversion) {
  return {
    transaction_id: conversion.transactionId,
    oid: conversion.offerId,
    affid: conversion.affiliateId,
    order_id: conversion.orderId,
    amount: conversion.amount,
    currency: conversion.currency,
    user_ip: conversion.userIp,
    coupon_code: conversion.couponCode,
    event_key: conversion.eventKey,
    event_id: conversion.eventId,
    adv_event_id: conversion.advertiserEventId,
    aid: conversion.aid,
    ...conversion.adv,
    email_sha256: conversion.email ? sha256(conversion.email.trim().toLowerCase()) : null,
  };
}

export async function processEverflowScrubberRequest(input: {
  authorization: string | null;
  rawBody: string;
  repository: ScrubberGatewayRepository;
  forwarder: ScrubberMockForwarder;
  requestId?: string;
  random?: () => number;
}) {
  const requestId = input.requestId || randomUUID();
  const payloadSha256 = sha256(input.rawBody);
  const token = bearerToken(input.authorization);
  const source = token ? await input.repository.authenticate(sha256(token)) : null;
  if (!source) {
    await input.repository.recordRejected({ requestId, source: null, reason: "REJECT_UNAUTHORIZED_REQUEST", payloadSha256, errors: [] });
    throw new ScrubberGatewayError(401, "REJECT_UNAUTHORIZED_REQUEST", requestId);
  }
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) {
    await input.repository.recordRejected({ requestId, source, reason: "REJECT_INVALID_REQUEST", payloadSha256, errors: ["payload exceeds 64 KiB"] });
    throw new ScrubberGatewayError(413, "REJECT_INVALID_REQUEST", requestId);
  }

  let payload: unknown;
  try { payload = JSON.parse(input.rawBody); }
  catch { payload = null; }
  const normalized = normalizeConversionPayload(payload, source.sourceKey);
  if (!normalized.ok) {
    await input.repository.recordRejected({ requestId, source, reason: "REJECT_INVALID_REQUEST", payloadSha256, errors: normalized.errors });
    throw new ScrubberGatewayError(400, "REJECT_INVALID_REQUEST", requestId);
  }

  const conversion = normalized.conversion;
  const forwardingParameters = buildEverflowForwardingParameters(conversion);
  const decision = await input.repository.decide({
    requestId,
    source,
    conversion,
    idempotencyKey: sha256(conversionIdempotencyKey(conversion)),
    eligible: source.eligibleEventKeys.includes(conversion.eventKey),
    randomUnit: (input.random || randomUnit)(),
    requestPayload: redactedPayload(conversion),
    forwardingPayload: Object.fromEntries(Array.from(forwardingParameters.entries()).filter(([key]) => key !== "email")),
  });
  if (decision.duplicate || decision.decision !== "PASS") return { requestId, ...decision };

  const outcome = await input.forwarder.forward({ conversionId: decision.conversionId, parameters: forwardingParameters });
  const recorded = await input.repository.recordMockForward(decision.conversionId, outcome);
  return { requestId, ...decision, forwardStatus: recorded.forwardStatus, forwardAttemptNumber: recorded.attemptNumber, nextRetryAt: recorded.nextRetryAt };
}

type Row = Record<string, unknown>;

export class SupabaseScrubberGatewayRepository implements ScrubberGatewayRepository {
  async authenticate(tokenSha256: string) {
    const rows = await rest(`everflow_scrubber_sources?token_sha256=eq.${encodeURIComponent(tokenSha256)}&active=eq.true&select=id,organization_id,connection_id,source_key&limit=2`);
    if (rows.length !== 1) return null;
    const row = rows[0];
    const settings = await rest(`everflow_scrubber_settings?organization_id=eq.${encodeURIComponent(String(row.organization_id))}&connection_id=eq.${encodeURIComponent(String(row.connection_id))}&select=eligible_event_keys&limit=1`);
    if (!settings[0]) return null;
    return {
      id: String(row.id), organizationId: String(row.organization_id), connectionId: String(row.connection_id), sourceKey: String(row.source_key),
      eligibleEventKeys: Array.isArray(settings[0].eligible_event_keys) ? settings[0].eligible_event_keys.map(String) : ["purchase"],
    };
  }

  async recordRejected(input: { requestId: string; source: SourceScope | null; reason: "REJECT_INVALID_REQUEST" | "REJECT_UNAUTHORIZED_REQUEST"; payloadSha256: string; errors: string[] }) {
    await rest("everflow_scrubber_ingress_attempts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
      organization_id: input.source?.organizationId || null, connection_id: input.source?.connectionId || null,
      source_id: input.source?.id || null, request_id: input.requestId, result: "rejected",
      reason_code: input.reason, payload_sha256: input.payloadSha256, validation_errors: input.errors,
    }) });
  }

  async decide(input: Parameters<ScrubberGatewayRepository["decide"]>[0]): Promise<GatewayDecision> {
    const c = input.conversion;
    const rows = await rest("rpc/decide_everflow_scrubber_conversion_v1", { method: "POST", body: JSON.stringify({
      p_request_id: input.requestId, p_source_id: input.source.id, p_idempotency_key: input.idempotencyKey,
      p_transaction_id: c.transactionId, p_network_offer_id: c.offerId, p_network_affiliate_id: c.affiliateId,
      p_order_id: c.orderId, p_event_key: c.eventKey, p_event_id: c.eventId, p_adv_event_id: c.advertiserEventId,
      p_amount: c.amount, p_currency: c.currency, p_user_ip: c.userIp, p_coupon_code: c.couponCode,
      p_email_sha256: c.email ? sha256(c.email.trim().toLowerCase()) : null, p_is_eligible: input.eligible,
      p_random_unit: input.randomUnit, p_request_payload: input.requestPayload, p_forwarding_payload: input.forwardingPayload,
    }) });
    const row = rows[0];
    if (!row) throw new Error("Scrubber decision was not persisted.");
    return {
      conversionId: String(row.conversion_id), decision: String(row.decision) as "PASS" | "SCRUB",
      reason: String(row.decision_reason), duplicate: Boolean(row.duplicate), forwardStatus: String(row.forward_status),
      rulePeriodId: row.rule_period_id ? String(row.rule_period_id) : null,
      effectivePassRate: row.effective_pass_rate === null ? null : Number(row.effective_pass_rate),
    };
  }

  async recordMockForward(conversionId: string, outcome: MockForwardOutcome) {
    const rows = await rest("rpc/record_everflow_scrubber_mock_forward_v1", { method: "POST", body: JSON.stringify({
      p_conversion_id: conversionId, p_outcome: outcome.outcome,
      p_http_status: outcome.outcome === "succeeded" ? outcome.httpStatus : null,
      p_response_reference: outcome.outcome === "succeeded" ? outcome.responseReference : null,
      p_error_code: outcome.outcome === "retryable_failure" ? outcome.errorCode : null,
      p_retry_at: outcome.outcome === "retryable_failure" ? outcome.retryAt : null,
    }) });
    const row = rows[0];
    if (!row) throw new Error("Mock forward result was not persisted.");
    return { forwardStatus: String(row.forward_status), attemptNumber: Number(row.attempt_number), nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null };
  }
}

export class M2MockEverflowForwarder implements ScrubberMockForwarder {
  async forward(input: { conversionId: string }): Promise<MockForwardOutcome> {
    return { outcome: "succeeded", httpStatus: 204, responseReference: `m2-mock:${input.conversionId}` };
  }
}

async function rest(path: string, init: RequestInit = {}): Promise<Row[]> {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!base || !key) throw new Error("Scrubber persistence is unavailable.");
  const response = await fetch(`${base}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new Error(`Scrubber persistence failed (${response.status}).`);
  if (response.status === 204) return [];
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

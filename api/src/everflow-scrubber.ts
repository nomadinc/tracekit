export const SCRUBBER_REASON_CODES = [
  "PASS_RULE_TARGET",
  "SCRUB_RULE_TARGET",
  "PASS_GLOBAL_BYPASS",
  "PASS_FAIL_OPEN",
  "PASS_NON_ELIGIBLE_EVENT",
  "REJECT_INVALID_REQUEST",
  "REJECT_UNAUTHORIZED_REQUEST",
  "DUPLICATE_SUPPRESSED",
] as const;

export type ScrubberReasonCode = typeof SCRUBBER_REASON_CODES[number];
export type RuleSource = "pair" | "offer" | "global";

export type CanonicalConversion = {
  transactionId: string;
  offerId: string;
  affiliateId: string;
  source: string;
  orderId: string | null;
  amount: number | null;
  currency: string | null;
  userIp: string | null;
  couponCode: string | null;
  email: string | null;
  eventKey: string;
  eventId: string | null;
  advertiserEventId: string | null;
  aid: string | null;
  adv: Record<string, string>;
};

export type ValidationResult =
  | { ok: true; conversion: CanonicalConversion }
  | { ok: false; errors: string[] };

const boundedText = (value: unknown, max: number) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text.length <= max ? text : null;
};

function strictEverflowId(value: unknown) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^[1-9][0-9]*$/.test(text) ? text : null;
}

function optionalAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

export function normalizeConversionPayload(payload: unknown, source: string): ValidationResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, errors: ["payload must be an object"] };
  const row = payload as Record<string, unknown>;
  const errors: string[] = [];
  const transactionId = boundedText(row.transaction_id, 500);
  const offerId = strictEverflowId(row.oid);
  const affiliateId = strictEverflowId(row.affid);
  if (!transactionId) errors.push("transaction_id is required and must be at most 500 characters");
  if (!offerId) errors.push("oid must be a positive integer without signs, decimals, or exponent notation");
  if (!affiliateId) errors.push("affid must be a positive integer without signs, decimals, or exponent notation");

  const amount = optionalAmount(row.amount);
  if (row.amount !== null && row.amount !== undefined && row.amount !== "" && amount === null) errors.push("amount must be a non-negative JSON number");
  const currency = boundedText(row.currency, 3)?.toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push("currency must be a three-letter ISO code");
  const eventKey = (boundedText(row.event_key ?? row.event_type, 64) || "purchase").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(eventKey)) errors.push("event_key is malformed");
  if (errors.length || !transactionId || !offerId || !affiliateId) return { ok: false, errors };

  const adv: Record<string, string> = {};
  for (let index = 1; index <= 10; index += 1) {
    const value = boundedText(row[`adv${index}`], 500);
    if (value) adv[`adv${index}`] = value;
  }
  return {
    ok: true,
    conversion: {
      transactionId,
      offerId,
      affiliateId,
      source,
      orderId: boundedText(row.order_id, 500),
      amount,
      currency,
      userIp: boundedText(row.user_ip, 64),
      couponCode: boundedText(row.coupon_code, 500),
      email: boundedText(row.email, 1000),
      eventKey,
      eventId: boundedText(row.event_id, 500),
      advertiserEventId: boundedText(row.adv_event_id, 500),
      aid: boundedText(row.aid, 500),
      adv,
    },
  };
}

export function conversionIdempotencyKey(conversion: CanonicalConversion) {
  const eventIdentity = conversion.advertiserEventId || conversion.eventId || conversion.eventKey;
  const commerceIdentity = conversion.orderId || conversion.transactionId;
  return `${conversion.source}\u001f${commerceIdentity}\u001f${eventIdentity}`;
}

export type ResolvedRule = { source: RuleSource; ruleId: string | null; passRate: number };

export function resolveScrubRule(input: {
  globalPassRate: number;
  offerRule?: { id: string; passRate: number } | null;
  pairRule?: { id: string; passRate: number } | null;
}): ResolvedRule {
  if (input.pairRule) return { source: "pair", ruleId: input.pairRule.id, passRate: input.pairRule.passRate };
  if (input.offerRule) return { source: "offer", ruleId: input.offerRule.id, passRate: input.offerRule.passRate };
  return { source: "global", ruleId: null, passRate: input.globalPassRate };
}

export function controllerPassProbability(input: {
  targetPassRate: number;
  eligibleCount: number;
  passedCount: number;
  correctionGain?: number;
}) {
  const target = Math.min(1, Math.max(0, input.targetPassRate));
  if (target === 0 || target === 1) return target;
  const count = Math.max(0, Math.trunc(input.eligibleCount));
  const passed = Math.max(0, Math.trunc(input.passedCount));
  const deficit = target * count - passed;
  const gain = Math.min(1, Math.max(0, input.correctionGain ?? 0.35));
  return Math.min(1, Math.max(0, target + gain * deficit));
}

export function decideEligibleConversion(input: {
  targetPassRate: number;
  eligibleCount: number;
  passedCount: number;
  randomUnit: number;
}) {
  if (!(input.randomUnit >= 0 && input.randomUnit < 1)) throw new Error("randomUnit must be in [0, 1)");
  const probability = controllerPassProbability(input);
  const pass = input.randomUnit < probability;
  return {
    decision: pass ? "PASS" as const : "SCRUB" as const,
    reason: pass ? "PASS_RULE_TARGET" as const : "SCRUB_RULE_TARGET" as const,
    probability,
  };
}

export function buildEverflowForwardingParameters(conversion: CanonicalConversion) {
  const parameters = new URLSearchParams({ transaction_id: conversion.transactionId });
  if (conversion.amount !== null) parameters.set("amount", String(conversion.amount));
  if (conversion.currency) parameters.set("currency", conversion.currency);
  if (conversion.orderId) parameters.set("order_id", conversion.orderId);
  if (conversion.couponCode) parameters.set("coupon_code", conversion.couponCode);
  if (conversion.userIp) parameters.set("user_ip", conversion.userIp);
  if (conversion.email) parameters.set("email", conversion.email);
  if (conversion.eventId) parameters.set("event_id", conversion.eventId);
  if (conversion.advertiserEventId) parameters.set("adv_event_id", conversion.advertiserEventId);
  if (conversion.aid) parameters.set("aid", conversion.aid);
  for (const [key, value] of Object.entries(conversion.adv)) parameters.set(key, value);
  return parameters;
}

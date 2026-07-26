import { cleanText } from "./identity-normalization.ts";
import {
  decodeJourneyTimelineCursor,
  encodeJourneyTimelineCursor,
  journeyBackfillDateRange,
  normalizeJourneyAmount,
  normalizeJourneyCurrency,
  normalizeJourneyMetadata,
  normalizeJourneyTimestamp,
  type JourneyEventType,
  type JourneyTimelineCursor,
} from "./journey-events.ts";
import {
  type JourneyEventWithJourney,
  type JourneyListCursor,
  type JourneyRow,
} from "./journeys.ts";
import {
  buildAttributionDomainEvent,
  type DomainEventInput,
} from "./domain-events.ts";

export const TOUCHPOINT_ELIGIBILITY_VERSION = "touchpoint_eligibility_v1";
export const ATTRIBUTION_MODEL_VERSION = "v1";
export const ATTRIBUTION_BACKFILL_CONNECTOR_ID = "attribution-engine-backfill";
export const ATTRIBUTION_BACKFILL_JOB_TYPE = "attribution_backfill";
export const ATTRIBUTION_BACKFILL_PHASE = "calculate_attribution";
export const ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE = 1;
export const ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE = 1;

export const ATTRIBUTION_BACKFILL_INDEX = {
  table: "journeys",
  columns: ["workspace_id", "started_at", "id"],
  filters: [
    "workspace_id = ?",
    "started_at >= ?",
    "started_at < ?",
    "(started_at, id) > cursor when cursor exists",
  ],
  order_by: ["started_at asc", "id asc"],
} as const;

export const ATTRIBUTION_MODELS = ["first_touch", "last_touch"] as const;
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];
export type AttributionStatus = "attributed" | "unattributed";
export type TouchpointChannel =
  | "affiliate"
  | "paid_search"
  | "paid_social"
  | "organic_search"
  | "email"
  | "sms"
  | "direct"
  | "referral"
  | "call"
  | "other";

export const ELIGIBLE_TOUCHPOINT_EVENT_TYPES: readonly JourneyEventType[] = [
  "click",
  "lead_created",
  "checkout_started",
  "email_click",
  "landing_page",
  "session_start",
  "page_view",
  "sms",
  "call",
];

export const ATTRIBUTABLE_CONVERSION_EVENT_TYPES: readonly JourneyEventType[] = [
  "purchase",
  "upsell",
  "subscription_started",
  "subscription_renewed",
];

export const DEFAULT_ATTRIBUTION_WINDOW_CONFIG = {
  default_click_days: 30,
  default_view_days: 1,
  channels: {
    email: { click_days: 7 },
    sms: { click_days: 7 },
    affiliate: { click_days: 30 },
    call: { click_days: 30 },
  },
} as const;

export type TouchpointClassification = {
  eligible: boolean;
  channel: TouchpointChannel | null;
  source: string | null;
  medium: string | null;
  campaign_id: string | null;
  affiliate_id: string | null;
  offer_id: string | null;
  touchpoint_id: string | null;
  transaction_id: string | null;
  eligibility_version: string;
  reason?: string | null;
};

export type AttributionCreditInput = {
  workspace_id: string;
  journey_id: string;
  person_id: string;
  conversion_event_id: string;
  touchpoint_event_id: string | null;
  conversion_event_time: string;
  touchpoint_event_time: string | null;
  model: AttributionModel;
  model_version: string;
  touchpoint_eligibility_version: string;
  status: AttributionStatus;
  reason: string | null;
  credit_fraction: string;
  credit_percent: string;
  credit_amount: string | null;
  currency: string | null;
  touchpoint_channel: TouchpointChannel | null;
  source: string | null;
  medium: string | null;
  campaign_id: string | null;
  affiliate_id: string | null;
  offer_id: string | null;
  calculated_at: string;
  metadata: Record<string, any>;
};

export type AttributionCreditRow = AttributionCreditInput & {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AttributionPersistResult = {
  inserted: number;
  replaced: number;
  already_current: number;
};

export type AttributionDomainEventPublisher = (event: DomainEventInput) => Promise<void>;

export type AttributionBackfillCursor = JourneyListCursor;

export type AttributionBackfillRequest = {
  workspace_id: string;
  models: AttributionModel[];
  platforms: string[];
  from: string;
  to: string;
  batch_size: number;
  cursor: string | null;
  job_id: string | null;
  force_recalculate: boolean;
};

export type AttributionBackfillBatchResult = {
  ok: boolean;
  journeys_discovered: number;
  journeys_processed: number;
  conversions_discovered: number;
  conversions_attributed_first_touch: number;
  conversions_attributed_last_touch: number;
  conversions_unattributed: number;
  credits_inserted: number;
  credits_replaced: number;
  credits_already_current: number;
  records_failed: number;
  errors: Array<{ journey_id: string | null; message: string }>;
};

export type JourneyAttributionParams = {
  workspace_id: string;
  journey_id: string;
  models: AttributionModel[];
  conversion_event_id: string | null;
};

export type PersonAttributionParams = {
  workspace_id: string;
  person_id: string;
  model: AttributionModel | null;
  from: string | null;
  to: string | null;
  limit: number;
  cursor: JourneyTimelineCursor | null;
};

export type RecalculateJourneyAttributionParams = {
  workspace_id: string;
  journey_id: string;
  models: AttributionModel[];
  force_recalculate: boolean;
};

export type AttributionRouteMatch =
  | { kind: "journey_attribution"; journey_id: string }
  | { kind: "journey_attribution_recalculate"; journey_id: string }
  | { kind: "person_attribution"; person_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export interface AttributionRepository {
  getPersonById(workspaceId: string, personId: string): Promise<{ id: string; workspace_id: string } | null>;
  getJourneyById(workspaceId: string, journeyId: string): Promise<JourneyRow | null>;
  queryJourneyEvents(workspaceId: string, journeyId: string): Promise<JourneyEventWithJourney[]>;
  queryAttributionCreditsForJourney(args: {
    workspace_id: string;
    journey_id: string;
    model?: AttributionModel | null;
    conversion_event_id?: string | null;
  }): Promise<AttributionCreditRow[]>;
  queryAttributionCreditsForPerson(args: PersonAttributionParams & { limit: number }): Promise<AttributionCreditRow[]>;
  queryBackfillJourneys(args: {
    workspace_id: string;
    from_ts: string;
    to_exclusive_ts: string;
    cursor: AttributionBackfillCursor | null;
    limit: number;
  }): Promise<JourneyRow[]>;
  findCreditsForRecalculation(args: {
    workspace_id: string;
    conversion_event_id: string;
    model: AttributionModel;
    model_version: string;
  }): Promise<AttributionCreditRow[]>;
  replaceAttributionCredits(args: {
    workspace_id: string;
    conversion_event_id: string;
    model: AttributionModel;
    model_version: string;
    credits: AttributionCreditInput[];
  }): Promise<{ inserted: number; replaced: number }>;
}

export class AttributionValidationError extends Error {
  status = 400;
  code = "bad_request";
}

export class AttributionNotFoundError extends Error {
  status = 404;
  code = "not_found";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function normalizeLimit(value: unknown, fallback = 50, max = 100) {
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

function normalizeBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toLowerCase();
  return ["1", "true", "yes", "y"].includes(text);
}

export function isAttributionModel(value: unknown): value is AttributionModel {
  return (ATTRIBUTION_MODELS as readonly string[]).includes(cleanText(value));
}

export function normalizeAttributionModel(value: unknown): AttributionModel {
  const model = cleanText(value);
  if (!isAttributionModel(model)) throw new AttributionValidationError(`Invalid attribution model: ${model || "(empty)"}`);
  return model;
}

export function normalizeAttributionModels(value: unknown): AttributionModel[] {
  const raw = Array.isArray(value) ? value : value ? [value] : ATTRIBUTION_MODELS;
  const models = Array.from(new Set(raw.map(normalizeAttributionModel)));
  return models.length ? models : [...ATTRIBUTION_MODELS];
}

export function normalizeAttributionPlatforms(value: unknown) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(raw.map((item) => cleanText(item).toLowerCase()).filter(Boolean))).sort();
}

function normalizeAttributionDate(value: unknown, field: string) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return normalizeJourneyTimestamp(`${text}T00:00:00.000Z`, field);
  return normalizeJourneyTimestamp(text, field);
}

export function normalizeAttributionBackfillRequest(body: any): { ok: true; value: AttributionBackfillRequest } | { ok: false; status: number; error: string; message: string } {
  const from = cleanText(body?.from);
  const to = cleanText(body?.to);
  const range = journeyBackfillDateRange(from, to);
  if (!from || !to) return { ok: false, status: 400, error: "bad_request", message: "from and to are required in YYYY-MM-DD format." };
  if (!range) return { ok: false, status: 400, error: "bad_request", message: "from/to must be valid YYYY-MM-DD dates and from must be on or before to." };
  try {
    return {
      ok: true,
      value: {
        workspace_id: cleanText(body?.workspace_id || body?.workspaceId) || "default",
        models: normalizeAttributionModels(body?.models || body?.model),
        platforms: normalizeAttributionPlatforms(body?.platforms || body?.platform),
        from,
        to,
        batch_size: normalizeLimit(
          body?.batch_size ?? body?.batchSize,
          ATTRIBUTION_BACKFILL_DEFAULT_JOURNEY_BATCH_SIZE,
          ATTRIBUTION_BACKFILL_MAX_JOURNEY_BATCH_SIZE,
        ),
        cursor: nullableText(body?.cursor),
        job_id: nullableText(body?.job_id || body?.jobId),
        force_recalculate: normalizeBool(body?.force_recalculate ?? body?.forceRecalculate),
      },
    };
  } catch (error: any) {
    return { ok: false, status: error?.status || 400, error: error?.code || "bad_request", message: error?.message || String(error) };
  }
}

export function normalizeJourneyAttributionParams(args: {
  workspace_id?: unknown;
  journey_id?: unknown;
  model?: unknown;
  conversion_event_id?: unknown;
}): JourneyAttributionParams {
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    journey_id: cleanText(args.journey_id) || "",
    models: args.model ? [normalizeAttributionModel(args.model)] : [...ATTRIBUTION_MODELS],
    conversion_event_id: nullableText(args.conversion_event_id),
  };
}

export function normalizePersonAttributionParams(args: {
  workspace_id?: unknown;
  person_id?: unknown;
  model?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  cursor?: unknown;
}): PersonAttributionParams {
  const from = normalizeAttributionDate(args.from, "from");
  const to = normalizeAttributionDate(args.to, "to");
  if (from && to && Date.parse(from) > Date.parse(to)) throw new AttributionValidationError("from must be on or before to.");
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    person_id: cleanText(args.person_id) || "",
    model: args.model ? normalizeAttributionModel(args.model) : null,
    from,
    to,
    limit: normalizeLimit(args.limit, 50, 100),
    cursor: decodeJourneyTimelineCursor(args.cursor),
  };
}

export function normalizeRecalculateJourneyAttributionParams(args: {
  workspace_id?: unknown;
  journey_id?: unknown;
  models?: unknown;
  model?: unknown;
  force_recalculate?: unknown;
  forceRecalculate?: unknown;
}): RecalculateJourneyAttributionParams {
  return {
    workspace_id: cleanText(args.workspace_id) || "default",
    journey_id: cleanText(args.journey_id) || "",
    models: normalizeAttributionModels(args.models || args.model),
    force_recalculate: normalizeBool(args.force_recalculate ?? args.forceRecalculate ?? true),
  };
}

export function matchAttributionRoutes(method: string, path: string): AttributionRouteMatch | null {
  const recalcMatch = path.match(/^\/v1\/journeys\/([^/]+)\/attribution\/recalculate\/?$/);
  if (recalcMatch) {
    if (method !== "POST") return { kind: "method_not_allowed", path: "/v1/journeys/:journey_id/attribution/recalculate", allowed_methods: ["POST"] };
    return { kind: "journey_attribution_recalculate", journey_id: decodeURIComponent(recalcMatch[1] || "") };
  }
  const journeyMatch = path.match(/^\/v1\/journeys\/([^/]+)\/attribution\/?$/);
  if (journeyMatch) {
    if (method !== "GET") return { kind: "method_not_allowed", path: "/v1/journeys/:journey_id/attribution", allowed_methods: ["GET"] };
    return { kind: "journey_attribution", journey_id: decodeURIComponent(journeyMatch[1] || "") };
  }
  const personMatch = path.match(/^\/v1\/persons\/([^/]+)\/attribution\/?$/);
  if (personMatch) {
    if (method !== "GET") return { kind: "method_not_allowed", path: "/v1/persons/:person_id/attribution", allowed_methods: ["GET"] };
    return { kind: "person_attribution", person_id: decodeURIComponent(personMatch[1] || "") };
  }
  return null;
}

function lowerText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function hasAcquisitionContext(event: JourneyEventWithJourney) {
  return Boolean(
    nullableText(event.affiliate_id)
    || nullableText(event.campaign_id)
    || nullableText(event.source)
    || nullableText(event.medium)
    || nullableText(event.offer_id)
    || nullableText(event.touchpoint_id)
    || nullableText(event.transaction_id),
  );
}

function classifyChannel(event: JourneyEventWithJourney): TouchpointChannel {
  const source = lowerText(event.source);
  const medium = lowerText(event.medium);
  const eventType = cleanText(event.event_type);
  if (eventType === "email_click" || source.includes("email") || medium.includes("email")) return "email";
  if (eventType === "sms" || source.includes("sms") || medium.includes("sms")) return "sms";
  if (eventType === "call" || source.includes("call") || medium.includes("call")) return "call";
  if (nullableText(event.affiliate_id) || nullableText(event.offer_id)) return "affiliate";
  if (["cpc", "ppc", "paid_search", "sem"].includes(medium)) return "paid_search";
  if (["paid_social", "social_paid"].includes(medium)) return "paid_social";
  if (medium === "organic" || medium === "organic_search") return "organic_search";
  if (medium === "referral") return "referral";
  if (medium === "direct" || source === "direct") return "direct";
  return "other";
}

export function classifyTouchpoint(event: JourneyEventWithJourney): TouchpointClassification {
  const eventType = cleanText(event.event_type);
  const eligibleType = (ELIGIBLE_TOUCHPOINT_EVENT_TYPES as readonly string[]).includes(eventType);
  const eligible = eligibleType && hasAcquisitionContext(event);
  return {
    eligible,
    channel: eligible ? classifyChannel(event) : null,
    source: nullableText(event.source),
    medium: nullableText(event.medium),
    campaign_id: nullableText(event.campaign_id),
    affiliate_id: nullableText(event.affiliate_id),
    offer_id: nullableText(event.offer_id),
    touchpoint_id: nullableText(event.touchpoint_id),
    transaction_id: nullableText(event.transaction_id),
    eligibility_version: TOUCHPOINT_ELIGIBILITY_VERSION,
    reason: eligible ? null : eligibleType ? "missing_acquisition_context" : "ineligible_event_type",
  };
}

export function isEligibleTouchpoint(event: JourneyEventWithJourney) {
  return classifyTouchpoint(event).eligible;
}

export function isAttributableConversionEvent(event: JourneyEventWithJourney) {
  return (ATTRIBUTABLE_CONVERSION_EVENT_TYPES as readonly string[]).includes(cleanText(event.event_type));
}

function sanitizeAttributionWindowConfig(value: unknown) {
  const metadata = normalizeJourneyMetadata(value);
  const channels = metadata.channels && typeof metadata.channels === "object" && !Array.isArray(metadata.channels) ? metadata.channels : {};
  return {
    default_click_days: Number(metadata.default_click_days || DEFAULT_ATTRIBUTION_WINDOW_CONFIG.default_click_days),
    default_view_days: Number(metadata.default_view_days || DEFAULT_ATTRIBUTION_WINDOW_CONFIG.default_view_days),
    channels,
  };
}

function positiveDays(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveAttributionWindowDays(touchpoint: JourneyEventWithJourney, journey: JourneyRow) {
  const classification = classifyTouchpoint(touchpoint);
  const config = sanitizeAttributionWindowConfig(journey.attribution_window_config);
  const isView = ["landing_page", "session_start", "page_view"].includes(cleanText(touchpoint.event_type));
  const defaultDays = isView
    ? positiveDays(config.default_view_days, DEFAULT_ATTRIBUTION_WINDOW_CONFIG.default_view_days)
    : positiveDays(config.default_click_days, DEFAULT_ATTRIBUTION_WINDOW_CONFIG.default_click_days);
  const channelConfig = classification.channel ? (config.channels as any)[classification.channel] || {} : {};
  const channelDays = isView ? channelConfig.view_days : channelConfig.click_days;
  return positiveDays(channelDays, defaultDays);
}

function decimalToMicros(value: unknown) {
  const normalized = normalizeJourneyAmount(value);
  if (normalized === null) return null;
  const negative = normalized.startsWith("-");
  const absolute = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = absolute.split(".");
  const micros = BigInt(whole || "0") * 1000000n + BigInt(fraction.padEnd(6, "0").slice(0, 6) || "0");
  return negative ? -micros : micros;
}

function microsToDecimal(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000000n;
  const fraction = String(absolute % 1000000n).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function fullCreditAmount(conversion: JourneyEventWithJourney) {
  const micros = decimalToMicros(conversion.amount);
  return micros === null ? null : microsToDecimal(micros);
}

function sameAttributionScope(journey: JourneyRow, conversion: JourneyEventWithJourney, event: JourneyEventWithJourney) {
  return cleanText(event.workspace_id) === cleanText(journey.workspace_id)
    && cleanText(conversion.workspace_id) === cleanText(journey.workspace_id)
    && cleanText(event.journey_id) === cleanText(journey.id)
    && cleanText(conversion.journey_id) === cleanText(journey.id)
    && cleanText(event.person_id) === cleanText(journey.person_id)
    && cleanText(conversion.person_id) === cleanText(journey.person_id);
}

export function eligibleTouchpointsForConversion(journey: JourneyRow, events: JourneyEventWithJourney[], conversion: JourneyEventWithJourney) {
  const conversionMs = Date.parse(normalizeJourneyTimestamp(conversion.event_time));
  return events
    .filter((event) => event.id !== conversion.id)
    .filter((event) => sameAttributionScope(journey, conversion, event))
    .filter(isEligibleTouchpoint)
    .filter((event) => {
      const touchpointMs = Date.parse(normalizeJourneyTimestamp(event.event_time));
      if (touchpointMs > conversionMs) return false;
      const windowDays = resolveAttributionWindowDays(event, journey);
      return conversionMs - touchpointMs <= windowDays * 86400000;
    });
}

function buildCredit(args: {
  journey: JourneyRow;
  conversion: JourneyEventWithJourney;
  touchpoint: JourneyEventWithJourney | null;
  model: AttributionModel;
  reason?: string | null;
  calculated_at?: string;
}): AttributionCreditInput {
  const classification = args.touchpoint ? classifyTouchpoint(args.touchpoint) : null;
  const windowDays = args.touchpoint ? resolveAttributionWindowDays(args.touchpoint, args.journey) : null;
  const status: AttributionStatus = args.touchpoint ? "attributed" : "unattributed";
  return {
    workspace_id: args.journey.workspace_id,
    journey_id: args.journey.id,
    person_id: args.journey.person_id,
    conversion_event_id: args.conversion.id,
    touchpoint_event_id: args.touchpoint?.id || null,
    conversion_event_time: normalizeJourneyTimestamp(args.conversion.event_time),
    touchpoint_event_time: args.touchpoint ? normalizeJourneyTimestamp(args.touchpoint.event_time) : null,
    model: args.model,
    model_version: ATTRIBUTION_MODEL_VERSION,
    touchpoint_eligibility_version: TOUCHPOINT_ELIGIBILITY_VERSION,
    status,
    reason: status === "unattributed" ? args.reason || "no_eligible_touchpoint" : null,
    credit_fraction: status === "attributed" ? "1.000000" : "0.000000",
    credit_percent: status === "attributed" ? "100.0000" : "0.0000",
    credit_amount: status === "attributed" ? fullCreditAmount(args.conversion) : null,
    currency: status === "attributed" ? normalizeJourneyCurrency(args.conversion.currency) : normalizeJourneyCurrency(args.conversion.currency),
    touchpoint_channel: classification?.channel || null,
    source: classification?.source || null,
    medium: classification?.medium || null,
    campaign_id: classification?.campaign_id || null,
    affiliate_id: classification?.affiliate_id || null,
    offer_id: classification?.offer_id || null,
    calculated_at: args.calculated_at || new Date().toISOString(),
    metadata: {
      attribution_window_days: windowDays,
      attribution_window_inclusive: true,
      conversion_event_type: args.conversion.event_type,
      touchpoint_event_type: args.touchpoint?.event_type || null,
      eligibility_reason: classification?.reason || null,
    },
  };
}

export function calculateConversionAttribution(journey: JourneyRow, events: JourneyEventWithJourney[], conversion: JourneyEventWithJourney, model: AttributionModel, args: { calculated_at?: string } = {}) {
  if (!isAttributableConversionEvent(conversion)) return null;
  const eligible = eligibleTouchpointsForConversion(journey, events, conversion);
  const sorted = eligible.sort((a, b) => {
    const left = Date.parse(normalizeJourneyTimestamp(a.event_time));
    const right = Date.parse(normalizeJourneyTimestamp(b.event_time));
    return model === "first_touch"
      ? left - right || a.id.localeCompare(b.id)
      : right - left || b.id.localeCompare(a.id);
  });
  const winner = sorted[0] || null;
  if (!winner) {
    console.log("attribution.calculation.unattributed", {
      workspace_id: journey.workspace_id,
      journey_id: journey.id,
      person_id: journey.person_id,
      conversion_event_id: conversion.id,
      model,
      model_version: ATTRIBUTION_MODEL_VERSION,
      eligibility_version: TOUCHPOINT_ELIGIBILITY_VERSION,
      status: "unattributed",
    });
  }
  return buildCredit({
    journey,
    conversion,
    touchpoint: winner,
    model,
    reason: "no_eligible_touchpoint",
    calculated_at: args.calculated_at,
  });
}

export function calculateJourneyAttribution(journey: JourneyRow, events: JourneyEventWithJourney[], models: AttributionModel[], args: { platforms?: string[]; calculated_at?: string } = {}) {
  const platformSet = new Set((args.platforms || []).map((platform) => cleanText(platform).toLowerCase()).filter(Boolean));
  const conversions = events
    .filter((event) => sameAttributionScope(journey, event, event))
    .filter(isAttributableConversionEvent)
    .filter((event) => !platformSet.size || platformSet.has(cleanText(event.source_platform).toLowerCase()))
    .sort((a, b) => Date.parse(normalizeJourneyTimestamp(a.event_time)) - Date.parse(normalizeJourneyTimestamp(b.event_time)) || a.id.localeCompare(b.id));
  const credits: AttributionCreditInput[] = [];
  for (const conversion of conversions) {
    for (const model of models) {
      const credit = calculateConversionAttribution(journey, events, conversion, model, { calculated_at: args.calculated_at });
      if (credit) credits.push(credit);
    }
  }
  return { conversions, credits };
}

function attributionCreditKey(credit: AttributionCreditInput | AttributionCreditRow) {
  return [
    credit.workspace_id,
    credit.journey_id,
    credit.person_id,
    credit.conversion_event_id,
    credit.conversion_event_time,
    credit.model,
    credit.model_version,
    credit.touchpoint_eligibility_version,
    credit.touchpoint_event_id || "unattributed",
    credit.touchpoint_event_time || "",
    credit.status,
    credit.reason || "",
    credit.credit_fraction,
    credit.credit_percent,
    credit.credit_amount || "",
    credit.currency || "",
    credit.touchpoint_channel || "",
    credit.source || "",
    credit.medium || "",
    credit.campaign_id || "",
    credit.affiliate_id || "",
    credit.offer_id || "",
    JSON.stringify(credit.metadata || {}),
  ].map((part) => cleanText(part)).join("|");
}

export function attributionCreditsEquivalent(existing: AttributionCreditRow[], incoming: AttributionCreditInput[]) {
  if (existing.length !== incoming.length) return false;
  const existingKeys = new Set(existing.map(attributionCreditKey));
  return incoming.every((credit) => existingKeys.has(attributionCreditKey(credit)));
}

export async function persistAttributionCredits(repo: AttributionRepository, credits: AttributionCreditInput[], args: {
  force_recalculate?: boolean;
  on_domain_event?: AttributionDomainEventPublisher | null;
} = {}): Promise<AttributionPersistResult> {
  const result = { inserted: 0, replaced: 0, already_current: 0 };
  const groups = new Map<string, AttributionCreditInput[]>();
  for (const credit of credits) {
    const key = [credit.workspace_id, credit.conversion_event_id, credit.model, credit.model_version].join("|");
    const group = groups.get(key) || [];
    group.push(credit);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const existing = await repo.findCreditsForRecalculation({
      workspace_id: first.workspace_id,
      conversion_event_id: first.conversion_event_id,
      model: first.model,
      model_version: first.model_version,
    });
    if (!args.force_recalculate && attributionCreditsEquivalent(existing, group)) {
      result.already_current += group.length;
      continue;
    }
    const replaced = await repo.replaceAttributionCredits({
      workspace_id: first.workspace_id,
      conversion_event_id: first.conversion_event_id,
      model: first.model,
      model_version: first.model_version,
      credits: group,
    });
    result.inserted += replaced.inserted;
    result.replaced += replaced.replaced;
    if (args.on_domain_event) {
      for (const credit of group) {
        await args.on_domain_event(buildAttributionDomainEvent(credit, { changed: replaced.replaced > 0 }));
      }
    }
    for (const credit of group) {
      console.log(replaced.replaced ? "attribution.credit.replaced" : "attribution.credit.created", {
        workspace_id: credit.workspace_id,
        journey_id: credit.journey_id,
        person_id: credit.person_id,
        conversion_event_id: credit.conversion_event_id,
        touchpoint_event_id: credit.touchpoint_event_id,
        model: credit.model,
        model_version: credit.model_version,
        eligibility_version: credit.touchpoint_eligibility_version,
        status: credit.status,
      });
    }
  }
  return result;
}

export async function recalculateJourneyAttribution(repo: AttributionRepository, params: RecalculateJourneyAttributionParams, options: {
  on_domain_event?: AttributionDomainEventPublisher | null;
} = {}) {
  const started = Date.now();
  const journey = await repo.getJourneyById(params.workspace_id, params.journey_id);
  if (!journey) throw new AttributionNotFoundError("Journey not found.");
  const events = await repo.queryJourneyEvents(params.workspace_id, params.journey_id);
  console.log("attribution.calculation.started", {
    workspace_id: params.workspace_id,
    journey_id: params.journey_id,
    person_id: journey.person_id,
    model: params.models.join(","),
    model_version: ATTRIBUTION_MODEL_VERSION,
    eligibility_version: TOUCHPOINT_ELIGIBILITY_VERSION,
  });
  const calculated = calculateJourneyAttribution(journey, events, params.models);
  const persisted = await persistAttributionCredits(repo, calculated.credits, {
    force_recalculate: params.force_recalculate,
    on_domain_event: options.on_domain_event,
  });
  console.log("attribution.calculation.completed", {
    workspace_id: params.workspace_id,
    journey_id: params.journey_id,
    person_id: journey.person_id,
    duration_ms: Date.now() - started,
    inserted_count: persisted.inserted,
    replaced_count: persisted.replaced,
    unattributed_count: calculated.credits.filter((credit) => credit.status === "unattributed").length,
  });
  return {
    ok: true,
    journey_id: params.journey_id,
    models: params.models,
    conversions_discovered: calculated.conversions.length,
    credits_inserted: persisted.inserted,
    credits_replaced: persisted.replaced,
    credits_already_current: persisted.already_current,
    conversions_unattributed: calculated.credits.filter((credit) => credit.status === "unattributed").length,
  };
}

export async function processAttributionBackfillJourneys(repo: AttributionRepository, journeys: JourneyRow[], request: AttributionBackfillRequest, options: {
  on_domain_event?: AttributionDomainEventPublisher | null;
} = {}): Promise<AttributionBackfillBatchResult> {
  const result: AttributionBackfillBatchResult = {
    ok: true,
    journeys_discovered: journeys.length,
    journeys_processed: 0,
    conversions_discovered: 0,
    conversions_attributed_first_touch: 0,
    conversions_attributed_last_touch: 0,
    conversions_unattributed: 0,
    credits_inserted: 0,
    credits_replaced: 0,
    credits_already_current: 0,
    records_failed: 0,
    errors: [],
  };
  for (const journey of journeys) {
    try {
      const events = await repo.queryJourneyEvents(request.workspace_id, journey.id);
      const calculated = calculateJourneyAttribution(journey, events, request.models, { platforms: request.platforms });
      if (!calculated.conversions.length) {
        result.journeys_processed += 1;
        continue;
      }
      const persisted = await persistAttributionCredits(repo, calculated.credits, {
        force_recalculate: request.force_recalculate,
        on_domain_event: options.on_domain_event,
      });
      result.journeys_processed += 1;
      result.conversions_discovered += calculated.conversions.length;
      result.conversions_attributed_first_touch += calculated.credits.filter((credit) => credit.model === "first_touch" && credit.status === "attributed").length;
      result.conversions_attributed_last_touch += calculated.credits.filter((credit) => credit.model === "last_touch" && credit.status === "attributed").length;
      result.conversions_unattributed += calculated.credits.filter((credit) => credit.status === "unattributed").length;
      result.credits_inserted += persisted.inserted;
      result.credits_replaced += persisted.replaced;
      result.credits_already_current += persisted.already_current;
    } catch (error: any) {
      result.ok = false;
      result.records_failed += 1;
      result.errors.push({ journey_id: journey.id || null, message: error?.message || String(error) });
    }
  }
  return result;
}

function compactConversionEvent(event: JourneyEventWithJourney) {
  return {
    id: event.id,
    event_type: event.event_type,
    event_time: normalizeJourneyTimestamp(event.event_time),
    amount: event.amount === null || event.amount === undefined ? null : String(event.amount),
    currency: event.currency || null,
  };
}

function compactTouchpoint(event: JourneyEventWithJourney | null, credit: AttributionCreditRow | AttributionCreditInput) {
  if (!event) {
    if (!credit.touchpoint_event_id) return null;
    return {
      event_id: credit.touchpoint_event_id,
      event_type: null,
      event_time: credit.touchpoint_event_time ? normalizeJourneyTimestamp(credit.touchpoint_event_time) : null,
      channel: credit.touchpoint_channel || null,
      source: credit.source || null,
      medium: credit.medium || null,
      affiliate_id: credit.affiliate_id || null,
      campaign_id: credit.campaign_id || null,
      offer_id: credit.offer_id || null,
    };
  }
  return {
    event_id: event.id,
    event_type: event.event_type,
    event_time: normalizeJourneyTimestamp(event.event_time),
    channel: credit.touchpoint_channel || classifyTouchpoint(event).channel,
    source: credit.source || null,
    medium: credit.medium || null,
    affiliate_id: credit.affiliate_id || null,
    campaign_id: credit.campaign_id || null,
    offer_id: credit.offer_id || null,
  };
}

function compactAttributionCredit(credit: AttributionCreditRow | AttributionCreditInput, touchpoint: JourneyEventWithJourney | null) {
  if (credit.status === "unattributed") {
    return {
      status: "unattributed",
      reason: credit.reason || "no_eligible_touchpoint",
    };
  }
  return {
    status: "attributed",
    touchpoint: compactTouchpoint(touchpoint, credit),
    credit_fraction: credit.credit_fraction,
    credit_percent: credit.credit_percent,
    credit_amount: credit.credit_amount,
    currency: credit.currency,
    model_version: credit.model_version,
    touchpoint_eligibility_version: credit.touchpoint_eligibility_version,
  };
}

export async function getJourneyAttribution(repo: AttributionRepository, params: JourneyAttributionParams) {
  const journey = await repo.getJourneyById(params.workspace_id, params.journey_id);
  if (!journey) throw new AttributionNotFoundError("Journey not found.");
  const events = await repo.queryJourneyEvents(params.workspace_id, params.journey_id);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const credits = await repo.queryAttributionCreditsForJourney({
    workspace_id: params.workspace_id,
    journey_id: params.journey_id,
    model: params.models.length === 1 ? params.models[0] : null,
    conversion_event_id: params.conversion_event_id,
  });
  const creditsByConversionModel = new Map(credits.map((credit) => [`${credit.conversion_event_id}:${credit.model}`, credit]));
  const conversions = events
    .filter(isAttributableConversionEvent)
    .filter((event) => !params.conversion_event_id || event.id === params.conversion_event_id)
    .sort((a, b) => Date.parse(normalizeJourneyTimestamp(a.event_time)) - Date.parse(normalizeJourneyTimestamp(b.event_time)) || a.id.localeCompare(b.id))
    .map((conversion) => {
      const attribution: Record<string, any> = {};
      for (const model of params.models) {
        const credit = creditsByConversionModel.get(`${conversion.id}:${model}`);
        attribution[model] = credit
          ? compactAttributionCredit(credit, credit.touchpoint_event_id ? eventById.get(credit.touchpoint_event_id) || null : null)
          : { status: "not_calculated" };
      }
      return {
        conversion_event: compactConversionEvent(conversion),
        attribution,
      };
    });
  return {
    ok: true,
    journey_id: params.journey_id,
    models: params.models,
    conversions,
  };
}

export async function getPersonAttribution(repo: AttributionRepository, params: PersonAttributionParams) {
  const person = await repo.getPersonById(params.workspace_id, params.person_id);
  if (!person) throw new AttributionNotFoundError("Person not found.");
  const rows = await repo.queryAttributionCreditsForPerson({ ...params, limit: params.limit + 1 });
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  return {
    ok: true,
    person_id: params.person_id,
    attribution: page.map((credit) => ({
      journey_id: credit.journey_id,
      conversion_event_id: credit.conversion_event_id,
      conversion_event_time: normalizeJourneyTimestamp(credit.conversion_event_time),
      model: credit.model,
      ...compactAttributionCredit(credit, null),
    })),
    next_cursor: rows.length > params.limit && last
      ? encodeJourneyTimelineCursor({ event_time: normalizeJourneyTimestamp(last.conversion_event_time), id: last.id })
      : null,
  };
}

export function createSupabaseAttributionRepository(supabase: any): AttributionRepository {
  return {
    async getPersonById(workspaceId, personId) {
      const { data, error } = await supabase
        .from("people")
        .select("id,workspace_id")
        .eq("workspace_id", workspaceId)
        .eq("id", personId)
        .maybeSingle();
      if (error) throw new Error(`Person lookup failed: ${error.message}`);
      return data || null;
    },
    async getJourneyById(workspaceId, journeyId) {
      const { data, error } = await supabase
        .from("journeys")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", journeyId)
        .maybeSingle();
      if (error) throw new Error(`Journey lookup failed: ${error.message}`);
      return data || null;
    },
    async queryJourneyEvents(workspaceId, journeyId) {
      const { data, error } = await supabase
        .from("journey_events")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("journey_id", journeyId)
        .order("event_time", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw new Error(`Journey events lookup failed: ${error.message}`);
      return data || [];
    },
    async queryAttributionCreditsForJourney(args) {
      let query = supabase
        .from("journey_attribution_credits")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .eq("journey_id", args.journey_id)
        .order("conversion_event_time", { ascending: true })
        .order("conversion_event_id", { ascending: true })
        .order("model", { ascending: true });
      if (args.model) query = query.eq("model", args.model);
      if (args.conversion_event_id) query = query.eq("conversion_event_id", args.conversion_event_id);
      const { data, error } = await query;
      if (error) throw new Error(`Journey attribution lookup failed: ${error.message}`);
      return data || [];
    },
    async queryAttributionCreditsForPerson(args) {
      let query = supabase
        .from("journey_attribution_credits")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .eq("person_id", args.person_id)
        .order("conversion_event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(args.limit);
      if (args.model) query = query.eq("model", args.model);
      if (args.from) query = query.gte("conversion_event_time", args.from);
      if (args.to) query = query.lte("conversion_event_time", args.to);
      if (args.cursor) query = query.or(`conversion_event_time.gt.${args.cursor.event_time},and(conversion_event_time.eq.${args.cursor.event_time},id.gt.${args.cursor.id})`);
      const { data, error } = await query;
      if (error) throw new Error(`Person attribution lookup failed: ${error.message}`);
      return data || [];
    },
    async queryBackfillJourneys(args) {
      let query = supabase
        .from("journeys")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .gte("started_at", args.from_ts)
        .lt("started_at", args.to_exclusive_ts)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(args.limit);
      if (args.cursor) query = query.or(`started_at.gt.${args.cursor.started_at},and(started_at.eq.${args.cursor.started_at},id.gt.${args.cursor.id})`);
      const { data, error } = await query;
      if (error) throw new Error(`Attribution backfill journey scan failed: ${error.message}`);
      return data || [];
    },
    async findCreditsForRecalculation(args) {
      const { data, error } = await supabase
        .from("journey_attribution_credits")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .eq("conversion_event_id", args.conversion_event_id)
        .eq("model", args.model)
        .eq("model_version", args.model_version);
      if (error) throw new Error(`Attribution credit lookup failed: ${error.message}`);
      return data || [];
    },
    async replaceAttributionCredits(args) {
      const { data, error } = await supabase.rpc("replace_journey_attribution_credits", {
        p_workspace_id: args.workspace_id,
        p_conversion_event_id: args.conversion_event_id,
        p_model: args.model,
        p_model_version: args.model_version,
        p_credits: args.credits,
      });
      if (error) throw new Error(`Attribution credit replace failed: ${error.message}`);
      return {
        inserted: Number(data?.inserted || args.credits.length),
        replaced: Number(data?.replaced || 0),
      };
    },
  };
}

import { cleanText } from "./identity-normalization.ts";
import {
  buildCommissionDomainEvent,
  type DomainEventInput,
} from "./domain-events.ts";

export const PAYOUT_ENGINE_VERSION = "payout_engine_v1";
export const PAYOUT_ATTRIBUTION_MODELS = ["first_touch", "last_touch", "linear", "position_based"] as const;
export const PAYOUT_DEFAULT_MODEL_VERSION = "v1";
export const PAYOUT_DEFAULT_LIMIT = 100;
export const PAYOUT_MAX_LIMIT = 500;
export const DEFAULT_CURRENCY_MINOR_UNITS = 2;

export type PayoutAttributionModel = (typeof PAYOUT_ATTRIBUTION_MODELS)[number];
export type AffiliateCommissionStatus = "draft" | "pending" | "approved" | "exported" | "paid" | "held" | "voided";

export type WorkspaceAttributionPolicy = {
  id: string | null;
  workspace_id: string;
  active_model: PayoutAttributionModel;
  model_version: string;
  default_commission_rate: string | number;
  status: "active" | "inactive";
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WorkspaceAttributionPolicyInput = {
  workspace_id: string;
  active_model: PayoutAttributionModel;
  model_version: string;
  default_commission_rate: number;
  status: "active" | "inactive";
  metadata: Record<string, any>;
};

export type AttributionCreditForPayout = {
  id: string;
  workspace_id: string;
  journey_id: string;
  person_id: string;
  conversion_event_id: string;
  touchpoint_event_id: string | null;
  conversion_event_time: string;
  touchpoint_event_time: string | null;
  model: PayoutAttributionModel;
  model_version: string;
  touchpoint_eligibility_version: string;
  status: "attributed" | "unattributed";
  reason: string | null;
  credit_fraction: string | number;
  credit_percent: string | number;
  credit_amount: string | number | null;
  currency: string | null;
  touchpoint_channel: string | null;
  source: string | null;
  medium: string | null;
  campaign_id: string | null;
  publisher_id: string | null;
  affiliate_id: string | null;
  offer_id: string | null;
  calculated_at: string;
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AffiliateCommissionRow = {
  id?: string;
  workspace_id: string;
  commission_event_id: string;
  policy_id: string | null;
  journey_attribution_credit_id: string;
  journey_id: string;
  person_id: string;
  conversion_event_id: string;
  touchpoint_event_id: string | null;
  conversion_event_time: string;
  touchpoint_event_time: string | null;
  affiliate_id: string;
  offer_id: string | null;
  campaign_id: string | null;
  touchpoint_source: string | null;
  touchpoint_medium: string | null;
  publisher_id: string | null;
  model: PayoutAttributionModel;
  model_version: string;
  credit_fraction: string | number;
  credit_percent: string | number;
  credit_amount: string | number | null;
  attributed_amount: string | number | null;
  currency: string | null;
  commission_rate: string | number;
  commission_amount: string | number;
  status: AffiliateCommissionStatus;
  source: string;
  source_credit_created_at: string | null;
  generated_at: string;
  policy_snapshot: Record<string, any>;
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PayoutCursor = {
  conversion_event_time: string;
  id: string;
};

export type PayoutGenerationRequest = {
  workspace_id: string;
  from: string | null;
  to: string | null;
  from_ts: string | null;
  to_exclusive_ts: string | null;
  cursor: PayoutCursor | null;
  limit: number;
  dry_run: boolean;
};

export type PayoutDomainEventPublisher = (event: DomainEventInput) => Promise<void>;

export type AffiliateCommissionListParams = {
  workspace_id: string;
  affiliate_id: string | null;
  status: AffiliateCommissionStatus | null;
  from_ts: string | null;
  to_exclusive_ts: string | null;
  cursor: PayoutCursor | null;
  limit: number;
};

export type PayoutRouteMatch =
  | { kind: "get_policy" }
  | { kind: "set_policy" }
  | { kind: "generate_commissions" }
  | { kind: "list_commissions" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export interface PayoutRepository {
  getWorkspaceAttributionPolicy(workspaceId: string): Promise<WorkspaceAttributionPolicy | null>;
  upsertWorkspaceAttributionPolicy(policy: WorkspaceAttributionPolicyInput): Promise<WorkspaceAttributionPolicy>;
  queryAttributionCreditsForPayout(args: {
    workspace_id: string;
    model: PayoutAttributionModel;
    model_version: string;
    from_ts: string | null;
    to_exclusive_ts: string | null;
    cursor: PayoutCursor | null;
    limit: number;
  }): Promise<AttributionCreditForPayout[]>;
  findAffiliateCommissionsByEventIds(workspaceId: string, commissionEventIds: string[]): Promise<AffiliateCommissionRow[]>;
  findAffiliateCommissionsByConversionEventIds(workspaceId: string, conversionEventIds: string[]): Promise<AffiliateCommissionRow[]>;
  insertAffiliateCommissions(rows: AffiliateCommissionRow[]): Promise<AffiliateCommissionRow[]>;
  listAffiliateCommissions(args: AffiliateCommissionListParams): Promise<AffiliateCommissionRow[]>;
}

export class PayoutValidationError extends Error {
  status = 400;
  code = "bad_request";
}

function nullableText(value: unknown) {
  return cleanText(value) || null;
}

function lowerText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeLimit(value: unknown, fallback = PAYOUT_DEFAULT_LIMIT, max = PAYOUT_MAX_LIMIT) {
  const n = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, n);
}

function normalizeBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = lowerText(value);
  return ["1", "true", "yes", "y"].includes(text);
}

function normalizeNumber(value: unknown, fallback: number, field: string) {
  const raw = value ?? fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new PayoutValidationError(`${field} must be a number.`);
  return n;
}

function normalizeCommissionRate(value: unknown, fallback = 0) {
  const n = normalizeNumber(value, fallback, "default_commission_rate");
  if (n < 0 || n > 1) throw new PayoutValidationError("default_commission_rate must be between 0 and 1.");
  return n;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export function isPayoutAttributionModel(value: unknown): value is PayoutAttributionModel {
  return (PAYOUT_ATTRIBUTION_MODELS as readonly string[]).includes(cleanText(value));
}

export function normalizePayoutAttributionModel(value: unknown): PayoutAttributionModel {
  const model = cleanText(value);
  if (!isPayoutAttributionModel(model)) throw new PayoutValidationError(`Invalid payout attribution model: ${model || "(empty)"}`);
  return model;
}

function normalizePolicyStatus(value: unknown): "active" | "inactive" {
  const status = lowerText(value || "active");
  if (status === "active" || status === "inactive") return status;
  throw new PayoutValidationError("status must be active or inactive.");
}

function normalizeCommissionStatus(value: unknown): AffiliateCommissionStatus | null {
  const status = lowerText(value);
  if (!status) return null;
  if (["draft", "pending", "approved", "exported", "paid", "held", "voided"].includes(status)) return status as AffiliateCommissionStatus;
  throw new PayoutValidationError("status must be draft, pending, approved, exported, paid, held, or voided.");
}

function parseTimestamp(value: unknown, field: string) {
  const text = cleanText(value);
  if (!text) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new PayoutValidationError(`${field} must be a valid date or timestamp.`);
  return date.toISOString();
}

function parseToExclusiveTimestamp(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new PayoutValidationError("to must be a valid date.");
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  return parseTimestamp(text, "to");
}

export function encodePayoutCursor(cursor: PayoutCursor | null) {
  if (!cursor) return null;
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodePayoutCursor(value: unknown): PayoutCursor | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(text));
    const conversionEventTime = parseTimestamp(parsed?.conversion_event_time, "cursor.conversion_event_time");
    const id = cleanText(parsed?.id);
    if (!conversionEventTime || !id) return null;
    return { conversion_event_time: conversionEventTime, id };
  } catch {
    return null;
  }
}

export function defaultWorkspaceAttributionPolicy(workspaceId: string): WorkspaceAttributionPolicy {
  const now = new Date(0).toISOString();
  return {
    id: null,
    workspace_id: cleanText(workspaceId) || "default",
    active_model: "first_touch",
    model_version: PAYOUT_DEFAULT_MODEL_VERSION,
    default_commission_rate: 0,
    status: "active",
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

export function normalizeWorkspaceAttributionPolicyRequest(body: any): { ok: true; value: WorkspaceAttributionPolicyInput } | { ok: false; status: number; error: string; message: string } {
  try {
    return {
      ok: true,
      value: {
        workspace_id: cleanText(body?.workspace_id || body?.workspaceId) || "default",
        active_model: normalizePayoutAttributionModel(body?.active_model ?? body?.activeModel ?? "first_touch"),
        model_version: cleanText(body?.model_version ?? body?.modelVersion) || PAYOUT_DEFAULT_MODEL_VERSION,
        default_commission_rate: normalizeCommissionRate(body?.default_commission_rate ?? body?.defaultCommissionRate, 0),
        status: normalizePolicyStatus(body?.status || "active"),
        metadata: normalizeMetadata(body?.metadata),
      },
    };
  } catch (error: any) {
    return { ok: false, status: error?.status || 400, error: error?.code || "bad_request", message: error?.message || String(error) };
  }
}

export function normalizePayoutGenerationRequest(body: any): { ok: true; value: PayoutGenerationRequest } | { ok: false; status: number; error: string; message: string } {
  try {
    const from = nullableText(body?.from);
    const to = nullableText(body?.to);
    const fromTs = parseTimestamp(from, "from");
    const toExclusiveTs = parseToExclusiveTimestamp(to);
    if (fromTs && toExclusiveTs && Date.parse(fromTs) >= Date.parse(toExclusiveTs)) {
      throw new PayoutValidationError("from must be before to.");
    }
    return {
      ok: true,
      value: {
        workspace_id: cleanText(body?.workspace_id || body?.workspaceId) || "default",
        from,
        to,
        from_ts: fromTs,
        to_exclusive_ts: toExclusiveTs,
        cursor: decodePayoutCursor(body?.cursor),
        limit: normalizeLimit(body?.limit, PAYOUT_DEFAULT_LIMIT, PAYOUT_MAX_LIMIT),
        dry_run: normalizeBool(body?.dry_run ?? body?.dryRun),
      },
    };
  } catch (error: any) {
    return { ok: false, status: error?.status || 400, error: error?.code || "bad_request", message: error?.message || String(error) };
  }
}

export function normalizeAffiliateCommissionListParams(args: Record<string, unknown>): { ok: true; value: AffiliateCommissionListParams } | { ok: false; status: number; error: string; message: string } {
  try {
    const fromTs = parseTimestamp(args.from, "from");
    const toExclusiveTs = parseToExclusiveTimestamp(args.to);
    if (fromTs && toExclusiveTs && Date.parse(fromTs) >= Date.parse(toExclusiveTs)) {
      throw new PayoutValidationError("from must be before to.");
    }
    return {
      ok: true,
      value: {
        workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
        affiliate_id: nullableText(args.affiliate_id || args.affiliateId),
        status: normalizeCommissionStatus(args.status),
        from_ts: fromTs,
        to_exclusive_ts: toExclusiveTs,
        cursor: decodePayoutCursor(args.cursor),
        limit: normalizeLimit(args.limit, 50, 200),
      },
    };
  } catch (error: any) {
    return { ok: false, status: error?.status || 400, error: error?.code || "bad_request", message: error?.message || String(error) };
  }
}

export function matchPayoutRoutes(method: string, path: string): PayoutRouteMatch | null {
  if (/^\/v1\/payouts\/attribution-policy\/?$/.test(path)) {
    if (method === "GET") return { kind: "get_policy" };
    if (method === "PUT" || method === "POST") return { kind: "set_policy" };
    return { kind: "method_not_allowed", path: "/v1/payouts/attribution-policy", allowed_methods: ["GET", "PUT", "POST"] };
  }
  if (/^\/v1\/payouts\/affiliate-commissions\/generate\/?$/.test(path)) {
    if (method === "POST") return { kind: "generate_commissions" };
    return { kind: "method_not_allowed", path: "/v1/payouts/affiliate-commissions/generate", allowed_methods: ["POST"] };
  }
  if (/^\/v1\/payouts\/affiliate-commissions\/?$/.test(path)) {
    if (method === "GET") return { kind: "list_commissions" };
    return { kind: "method_not_allowed", path: "/v1/payouts/affiliate-commissions", allowed_methods: ["GET"] };
  }
  return null;
}

function normalizeCurrency(value: unknown) {
  const currency = cleanText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

const CURRENCY_MINOR_UNITS: Record<string, number> = {
  BHD: 3,
  CLP: 0,
  JPY: 0,
  KWD: 3,
  OMR: 3,
  USD: 2,
};

function currencyMinorUnits(currency: string | null) {
  return currency ? CURRENCY_MINOR_UNITS[currency] ?? DEFAULT_CURRENCY_MINOR_UNITS : DEFAULT_CURRENCY_MINOR_UNITS;
}

function pow10(n: number) {
  return 10n ** BigInt(n);
}

function parseDecimal(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const units = BigInt(`${whole}${fraction}` || "0");
  return {
    units: sign === "-" ? -units : units,
    scale: fraction.length,
  };
}

function roundScaledInteger(value: bigint, fromScale: number, toScale: number) {
  if (fromScale <= toScale) return value * pow10(toScale - fromScale);
  const factor = pow10(fromScale - toScale);
  const quotient = value / factor;
  const remainder = value < 0n ? -(value % factor) : value % factor;
  if (remainder * 2n < factor) return quotient;
  return quotient + (value < 0n ? -1n : 1n);
}

function formatScaledDecimal(value: bigint, scale: number) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale <= 0) return `${negative ? "-" : ""}${absolute.toString()}`;
  const divisor = pow10(scale);
  const whole = absolute / divisor;
  const fraction = String(absolute % divisor).padStart(scale, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function normalizeCreditAmount(value: unknown) {
  const parsed = parseDecimal(value);
  if (!parsed) return null;
  const formatted = formatScaledDecimal(roundScaledInteger(parsed.units, parsed.scale, 6), 6);
  return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
}

export function calculateCommissionAmount(creditAmount: unknown, commissionRate: unknown, currency: unknown) {
  const amount = parseDecimal(creditAmount);
  const rate = parseDecimal(commissionRate);
  if (!amount || !rate) return null;
  const currencyCode = normalizeCurrency(currency);
  const amountMicros = roundScaledInteger(amount.units, amount.scale, 6);
  const rateMicros = roundScaledInteger(rate.units, rate.scale, 6);
  const minorUnits = currencyMinorUnits(currencyCode);
  const commissionMinorUnits = roundScaledInteger(amountMicros * rateMicros, 12, minorUnits);
  return formatScaledDecimal(commissionMinorUnits, minorUnits);
}

function extractPublisherId(credit: AttributionCreditForPayout) {
  return nullableText(
    credit.metadata?.publisher_id
    ?? credit.metadata?.publisherId
    ?? credit.metadata?.touchpoint?.publisher_id
    ?? credit.metadata?.touchpoint?.publisherId
    ?? null,
  );
}

export function payoutCommissionEventId(policy: WorkspaceAttributionPolicy, credit: AttributionCreditForPayout) {
  return [
    "payout",
    PAYOUT_ENGINE_VERSION,
    credit.workspace_id,
    credit.conversion_event_id,
    "commission",
  ].join(":");
}

export function buildAffiliateCommissionFromCredit(credit: AttributionCreditForPayout, policy: WorkspaceAttributionPolicy): AffiliateCommissionRow | null {
  if (credit.status !== "attributed") return null;
  const affiliateId = cleanText(credit.affiliate_id);
  if (!affiliateId) return null;
  if (!credit.touchpoint_event_id) return null;
  const creditAmount = normalizeCreditAmount(credit.credit_amount);
  if (creditAmount === null) return null;
  const commissionRate = normalizeCommissionRate(policy.default_commission_rate, 0);
  const currency = normalizeCurrency(credit.currency);
  const commissionAmount = calculateCommissionAmount(creditAmount, commissionRate, currency);
  if (commissionAmount === null) return null;
  const policySnapshot = {
    policy_id: policy.id || null,
    active_model: policy.active_model,
    model_version: policy.model_version,
    default_commission_rate: commissionRate,
    status: policy.status,
    metadata: policy.metadata || {},
  };
  const generatedAt = new Date().toISOString();
  return {
    workspace_id: credit.workspace_id,
    commission_event_id: payoutCommissionEventId(policy, credit),
    policy_id: policy.id || null,
    journey_attribution_credit_id: credit.id,
    journey_id: credit.journey_id,
    person_id: credit.person_id,
    conversion_event_id: credit.conversion_event_id,
    touchpoint_event_id: credit.touchpoint_event_id,
    conversion_event_time: credit.conversion_event_time,
    touchpoint_event_time: credit.touchpoint_event_time,
    affiliate_id: affiliateId,
    offer_id: nullableText(credit.offer_id),
    campaign_id: nullableText(credit.campaign_id),
    touchpoint_source: nullableText(credit.source),
    touchpoint_medium: nullableText(credit.medium),
    publisher_id: extractPublisherId(credit),
    model: policy.active_model,
    model_version: policy.model_version,
    credit_fraction: credit.credit_fraction,
    credit_percent: credit.credit_percent,
    credit_amount: creditAmount,
    attributed_amount: creditAmount,
    currency,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    status: "draft",
    source: PAYOUT_ENGINE_VERSION,
    source_credit_created_at: credit.created_at || null,
    generated_at: generatedAt,
    policy_snapshot: policySnapshot,
    metadata: {
      payout_engine_version: PAYOUT_ENGINE_VERSION,
      attribution_credit_id: credit.id,
      attribution_model: credit.model,
      attribution_model_version: credit.model_version,
      touchpoint_eligibility_version: credit.touchpoint_eligibility_version,
      publisher_id: extractPublisherId(credit),
      policy: policySnapshot,
    },
  };
}

function compactPolicy(policy: WorkspaceAttributionPolicy, configured = true) {
  return {
    id: policy.id,
    workspace_id: policy.workspace_id,
    active_model: policy.active_model,
    model_version: policy.model_version,
    default_commission_rate: Number(policy.default_commission_rate || 0),
    status: policy.status,
    configured,
    metadata: policy.metadata || {},
    created_at: policy.created_at || null,
    updated_at: policy.updated_at || null,
  };
}

function compactCommission(row: AffiliateCommissionRow) {
  return {
    id: row.id || null,
    workspace_id: row.workspace_id,
    commission_event_id: row.commission_event_id,
    journey_attribution_credit_id: row.journey_attribution_credit_id,
    journey_id: row.journey_id,
    person_id: row.person_id,
    conversion_event_id: row.conversion_event_id,
    touchpoint_event_id: row.touchpoint_event_id,
    conversion_event_time: row.conversion_event_time,
    touchpoint_event_time: row.touchpoint_event_time,
    affiliate_id: row.affiliate_id,
    publisher_id: row.publisher_id,
    offer_id: row.offer_id,
    campaign_id: row.campaign_id,
    model: row.model,
    model_version: row.model_version,
    credit_amount: row.credit_amount === null ? null : Number(row.credit_amount),
    attributed_amount: row.attributed_amount === null ? null : Number(row.attributed_amount),
    currency: row.currency,
    commission_rate: Number(row.commission_rate || 0),
    commission_amount: Number(row.commission_amount || 0),
    status: row.status,
    source: row.source,
    generated_at: row.generated_at || null,
    policy_snapshot: row.policy_snapshot || {},
    created_at: row.created_at || null,
  };
}

export async function getPayoutAttributionPolicy(repo: PayoutRepository, workspaceId: unknown) {
  const workspace_id = cleanText(workspaceId) || "default";
  const policy = await repo.getWorkspaceAttributionPolicy(workspace_id);
  return {
    ok: true,
    policy: compactPolicy(policy || defaultWorkspaceAttributionPolicy(workspace_id), Boolean(policy)),
  };
}

export async function setPayoutAttributionPolicy(repo: PayoutRepository, policy: WorkspaceAttributionPolicyInput) {
  const saved = await repo.upsertWorkspaceAttributionPolicy(policy);
  return {
    ok: true,
    policy: compactPolicy(saved),
  };
}

export async function generateAffiliateCommissions(repo: PayoutRepository, request: PayoutGenerationRequest, options: {
  on_domain_event?: PayoutDomainEventPublisher | null;
} = {}) {
  const storedPolicy = await repo.getWorkspaceAttributionPolicy(request.workspace_id);
  const policy = storedPolicy || defaultWorkspaceAttributionPolicy(request.workspace_id);
  const credits = await repo.queryAttributionCreditsForPayout({
    workspace_id: request.workspace_id,
    model: policy.active_model,
    model_version: policy.model_version,
    from_ts: request.from_ts,
    to_exclusive_ts: request.to_exclusive_ts,
    cursor: request.cursor,
    limit: request.limit,
  });

  const drafts: AffiliateCommissionRow[] = [];
  let skippedUnpayable = 0;
  let duplicateCreditsForConversionSkipped = 0;
  const draftByConversionId = new Map<string, AffiliateCommissionRow>();
  for (const credit of credits) {
    const draft = buildAffiliateCommissionFromCredit(credit, policy);
    if (!draft) {
      skippedUnpayable += 1;
      continue;
    }
    if (draftByConversionId.has(draft.conversion_event_id)) {
      duplicateCreditsForConversionSkipped += 1;
      continue;
    }
    draftByConversionId.set(draft.conversion_event_id, draft);
    drafts.push(draft);
  }

  const eventIds = Array.from(new Set(drafts.map((row) => row.commission_event_id)));
  const conversionEventIds = Array.from(new Set(drafts.map((row) => row.conversion_event_id)));
  const [existingByEventId, existingByConversionId] = eventIds.length
    ? await Promise.all([
      repo.findAffiliateCommissionsByEventIds(request.workspace_id, eventIds),
      repo.findAffiliateCommissionsByConversionEventIds(request.workspace_id, conversionEventIds),
    ])
    : [[], []];
  const existingIds = new Set(existingByEventId.map((row) => row.commission_event_id));
  const existingConversionIds = new Set(existingByConversionId.map((row) => row.conversion_event_id));
  const newRows = drafts.filter((row) => !existingIds.has(row.commission_event_id) && !existingConversionIds.has(row.conversion_event_id));
  const inserted = request.dry_run || !newRows.length ? [] : await repo.insertAffiliateCommissions(newRows);
  if (options.on_domain_event) {
    for (const commission of inserted) {
      await options.on_domain_event(buildCommissionDomainEvent(commission));
    }
  }
  const lastCredit = credits[credits.length - 1] || null;

  return {
    ok: true,
    workspace_id: request.workspace_id,
    policy: compactPolicy(policy, Boolean(storedPolicy)),
    dry_run: request.dry_run,
    credits_scanned: credits.length,
    eligible_credits: drafts.length,
    commissions_inserted: inserted.length,
    commissions_generated: request.dry_run ? newRows.length : inserted.length,
    duplicate_commissions_skipped: drafts.length - newRows.length,
    duplicate_credit_commissions_skipped: duplicateCreditsForConversionSkipped,
    skipped_unpayable: skippedUnpayable,
    has_more: credits.length >= request.limit,
    next_cursor: lastCredit && credits.length >= request.limit ? encodePayoutCursor({ conversion_event_time: lastCredit.conversion_event_time, id: lastCredit.id }) : null,
    sample: (request.dry_run ? newRows : inserted).slice(0, 10).map(compactCommission),
  };
}

export async function listAffiliateCommissions(repo: PayoutRepository, params: AffiliateCommissionListParams) {
  const rows = await repo.listAffiliateCommissions(params);
  const last = rows[rows.length - 1] || null;
  return {
    ok: true,
    workspace_id: params.workspace_id,
    commissions: rows.map(compactCommission),
    has_more: rows.length >= params.limit,
    next_cursor: last && rows.length >= params.limit ? encodePayoutCursor({ conversion_event_time: last.conversion_event_time, id: last.id || last.commission_event_id }) : null,
  };
}

export function createSupabasePayoutRepository(supabase: any): PayoutRepository {
  return {
    async getWorkspaceAttributionPolicy(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_attribution_policy")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw new Error(`Workspace attribution policy lookup failed: ${error.message}`);
      return data || null;
    },
    async upsertWorkspaceAttributionPolicy(policy) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("workspace_attribution_policy")
        .upsert({
          ...policy,
          updated_at: now,
        }, { onConflict: "workspace_id" })
        .select("*")
        .single();
      if (error) throw new Error(`Workspace attribution policy save failed: ${error.message}`);
      return data;
    },
    async queryAttributionCreditsForPayout(args) {
      let query = supabase
        .from("journey_attribution_credits")
        .select([
          "id",
          "workspace_id",
          "journey_id",
          "person_id",
          "conversion_event_id",
          "touchpoint_event_id",
          "conversion_event_time",
          "touchpoint_event_time",
          "model",
          "model_version",
          "touchpoint_eligibility_version",
          "status",
          "reason",
          "credit_fraction",
          "credit_percent",
          "credit_amount",
          "currency",
          "touchpoint_channel",
          "source",
          "medium",
          "campaign_id",
          "affiliate_id",
          "offer_id",
          "calculated_at",
          "metadata",
          "created_at",
          "updated_at",
        ].join(","))
        .eq("workspace_id", args.workspace_id)
        .eq("model", args.model)
        .eq("model_version", args.model_version)
        .eq("status", "attributed")
        .not("affiliate_id", "is", null)
        .order("conversion_event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(args.limit);
      if (args.from_ts) query = query.gte("conversion_event_time", args.from_ts);
      if (args.to_exclusive_ts) query = query.lt("conversion_event_time", args.to_exclusive_ts);
      if (args.cursor) query = query.or(`conversion_event_time.gt.${args.cursor.conversion_event_time},and(conversion_event_time.eq.${args.cursor.conversion_event_time},id.gt.${args.cursor.id})`);
      const { data, error } = await query;
      if (error) throw new Error(`Attribution credits payout scan failed: ${error.message}`);
      return data || [];
    },
    async findAffiliateCommissionsByEventIds(workspaceId, commissionEventIds) {
      if (!commissionEventIds.length) return [];
      const { data, error } = await supabase
        .from("affiliate_commissions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("commission_event_id", commissionEventIds);
      if (error) throw new Error(`Affiliate commission dedupe lookup failed: ${error.message}`);
      return data || [];
    },
    async findAffiliateCommissionsByConversionEventIds(workspaceId, conversionEventIds) {
      if (!conversionEventIds.length) return [];
      const { data, error } = await supabase
        .from("affiliate_commissions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("conversion_event_id", conversionEventIds);
      if (error) throw new Error(`Affiliate commission conversion dedupe lookup failed: ${error.message}`);
      return data || [];
    },
    async insertAffiliateCommissions(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from("affiliate_commissions")
        .upsert(rows, { onConflict: "workspace_id,conversion_event_id", ignoreDuplicates: true })
        .select("*");
      if (error) throw new Error(`Affiliate commission insert failed: ${error.message}`);
      return data || [];
    },
    async listAffiliateCommissions(args) {
      let query = supabase
        .from("affiliate_commissions")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .order("conversion_event_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(args.limit);
      if (args.affiliate_id) query = query.eq("affiliate_id", args.affiliate_id);
      if (args.status) query = query.eq("status", args.status);
      if (args.from_ts) query = query.gte("conversion_event_time", args.from_ts);
      if (args.to_exclusive_ts) query = query.lt("conversion_event_time", args.to_exclusive_ts);
      if (args.cursor) query = query.or(`conversion_event_time.gt.${args.cursor.conversion_event_time},and(conversion_event_time.eq.${args.cursor.conversion_event_time},id.gt.${args.cursor.id || ""})`);
      const { data, error } = await query;
      if (error) throw new Error(`Affiliate commission lookup failed: ${error.message}`);
      return data || [];
    },
  };
}

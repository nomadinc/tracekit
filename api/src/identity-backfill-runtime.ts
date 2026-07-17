import {
  type IdentityIdentifierType,
  cleanText,
  isIdentityIdentifierType,
  normalizeIdentityIdentifier,
} from "./identity-normalization.ts";
import type { IdentityInputIdentifier, IdentityRepository } from "./identity-service.ts";

export const IDENTITY_BACKFILL_CONNECTOR_ID = "identity-backfill-platform-orders";
export const IDENTITY_BACKFILL_JOB_TYPE = "identity_backfill";
export const IDENTITY_BACKFILL_PHASES = [
  "discover_unlinked_records",
  "resolve_identity_batch",
  "validate_and_finalize",
] as const;

export const IDENTITY_BACKFILL_TASK_TYPES = {
  discover: "identity_backfill_discover_unlinked_records",
  resolve: "identity_backfill_resolve_identity_batch",
  finalize: "identity_backfill_validate_and_finalize",
} as const;

export const IDENTITY_BACKFILL_DEFAULT_PLATFORMS = ["wowboost", "wowsuite:wowboost"] as const;
export const IDENTITY_BACKFILL_ALLOWED_PLATFORMS = ["wowboost", "wowsuite:wowboost", "wowsuite"] as const;
export const IDENTITY_BACKFILL_EXCLUDED_PLATFORMS = new Set(["wowpay", "wowsuite:wowpay"]);
export const IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE = 25;
export const IDENTITY_BACKFILL_MAX_BATCH_SIZE = 100;
export const IDENTITY_BACKFILL_DISCOVERY_SELECT = "workspace_id,platform,platform_order_id,order_ts,person_id,raw_json";
export const IDENTITY_BACKFILL_DISCOVERY_INDEX = {
  name: "platform_orders_identity_backfill_scan_idx",
  columns: ["workspace_id", "platform", "order_ts", "platform_order_id"],
  predicate: "person_id is null and platform_order_id is not null",
  query_filters: [
    "workspace_id = ?",
    "platform = ?",
    "person_id is null",
    "platform_order_id is not null",
    "order_ts >= ?",
    "order_ts < ?",
    "platform_order_id > ? when cursor exists",
  ],
  order_by: ["platform_order_id asc"],
} as const;
export const IDENTITY_BACKFILL_RESOLVE_SELECT = [
  "workspace_id",
  "platform",
  "platform_order_id",
  "order_id",
  "transaction_id",
  "order_ts",
  "person_id",
  "customer_email",
  "customer_email_normalized",
  "customer_email_hash",
  "email",
  "phone",
  "commerce_reference",
  "raw_json",
].join(",");

export type IdentityBackfillPhase = (typeof IDENTITY_BACKFILL_PHASES)[number];

export type IdentityBackfillRequest = {
  workspace_id: string;
  from: string;
  to: string;
  platforms: string[];
  batch_size: number;
  dry_run: boolean;
  force_new_job: boolean;
  job_id: string | null;
};

export type IdentityBackfillEvidence = {
  identifiers: Array<{
    identifier_type: IdentityIdentifierType;
    value: string;
    verification_status: "observed";
    confidence?: number | null;
    metadata?: Record<string, any>;
  }>;
  attributes: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  source_record_id: string | null;
  observed_at: string | null;
  warnings: string[];
};

export type IdentityBackfillCursor = {
  current_platform: string;
  platform_order_id: string | null;
};

export type IdentityBackfillPreviewResult = {
  preview_action: "would_create_person" | "would_match_existing" | "would_require_review" | "would_skip_no_identifiers";
  person_id: string | null;
  review_required: boolean;
};

export type IdentityBackfillDiscoveryStatus = "pending" | "completed" | "failed";

export type IdentityBackfillResolveMetricSummary = Record<string, any> & {
  people_created?: number;
  people_matched?: number;
  attached?: number;
  review_required?: number;
  skipped_no_identifiers?: number;
  would_create_person?: number;
  would_match_existing?: number;
  would_require_review?: number;
  would_skip_no_identifiers?: number;
};

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function metricNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizedHeader(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickField(row: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(row || {});
  const normalizedCandidates = candidates.map(normalizedHeader);
  for (const key of keys) {
    if (!normalizedCandidates.includes(normalizedHeader(key))) continue;
    const value = row[key];
    if (value !== undefined && value !== null && cleanText(value)) return cleanText(value);
  }
  return "";
}

function hasAnyField(row: Record<string, any>, candidates: string[]) {
  return Boolean(pickField(row, candidates));
}

function parseYmd(value: unknown) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0));
  if (!Number.isFinite(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== text) return null;
  return date;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

export function normalizeIdentityBackfillPlatforms(value: unknown) {
  const input = Array.isArray(value)
    ? value
    : cleanText(value)
      ? cleanText(value).split(",")
      : Array.from(IDENTITY_BACKFILL_DEFAULT_PLATFORMS);
  const platforms = uniqueStrings(input.map((platform) => cleanText(platform).toLowerCase()))
    .filter((platform) => !IDENTITY_BACKFILL_EXCLUDED_PLATFORMS.has(platform))
    .filter((platform) => (IDENTITY_BACKFILL_ALLOWED_PLATFORMS as readonly string[]).includes(platform));
  return platforms.length ? platforms : Array.from(IDENTITY_BACKFILL_DEFAULT_PLATFORMS);
}

export function normalizeIdentityBackfillBatchSize(value: unknown) {
  const numberValue = Number(value ?? IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(numberValue)) return IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(IDENTITY_BACKFILL_MAX_BATCH_SIZE, Math.floor(numberValue)));
}

export function createIdentityBackfillDiscoveryState(platforms: string[]) {
  const state: Record<string, IdentityBackfillDiscoveryStatus> = {};
  for (const platform of platforms) state[platform] = "pending";
  return state;
}

export function markIdentityBackfillPlatformDiscovery(
  metadata: Record<string, any> | null | undefined,
  platform: string,
  status: IdentityBackfillDiscoveryStatus,
) {
  return {
    ...((metadata?.discovery_platforms || {}) as Record<string, IdentityBackfillDiscoveryStatus>),
    [cleanText(platform).toLowerCase()]: status,
  };
}

export function identityBackfillDiscoveryStateFromMetadata(metadata: Record<string, any> | null | undefined, platforms: string[]) {
  const existing = ((metadata?.discovery_platforms || {}) as Record<string, IdentityBackfillDiscoveryStatus>) || {};
  const state = createIdentityBackfillDiscoveryState(platforms);
  for (const platform of platforms) {
    const status = existing[platform];
    if (status === "completed" || status === "failed" || status === "pending") state[platform] = status;
  }
  return state;
}

export function identityBackfillDiscoverySummary(metadata: Record<string, any> | null | undefined, platforms: string[]) {
  const state = identityBackfillDiscoveryStateFromMetadata(metadata, platforms);
  const completed = platforms.filter((platform) => state[platform] === "completed");
  const failed = platforms.filter((platform) => state[platform] === "failed");
  const pending = platforms.filter((platform) => state[platform] === "pending");
  return {
    state,
    completed,
    failed,
    pending,
    incomplete: failed.length > 0 || pending.length > 0,
  };
}

export function normalizeIdentityBackfillRequest(body: Record<string, any>): { ok: true; value: IdentityBackfillRequest } | { ok: false; status: number; error: string; message: string } {
  const from = cleanText(body.from || body.requested_from || body.requestedFrom);
  const to = cleanText(body.to || body.requested_to || body.requestedTo);
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  if (!from || !to) {
    return { ok: false, status: 400, error: "bad_request", message: "from and to are required in YYYY-MM-DD format." };
  }
  if (!fromDate || !toDate) {
    return { ok: false, status: 400, error: "bad_request", message: "from and to must be valid YYYY-MM-DD dates." };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return { ok: false, status: 400, error: "bad_request", message: "from must be on or before to." };
  }

  return {
    ok: true,
    value: {
      workspace_id: cleanText(body.workspace_id || body.workspaceId) || "default",
      from,
      to,
      platforms: normalizeIdentityBackfillPlatforms(body.platforms || body.platform),
      batch_size: normalizeIdentityBackfillBatchSize(body.batch_size ?? body.batchSize),
      dry_run: Boolean(body.dry_run ?? body.dryRun),
      force_new_job: Boolean(body.force_new_job ?? body.forceNewJob),
      job_id: cleanText(body.job_id || body.jobId) || null,
    },
  };
}

export function dateRangeToTimestamps(from: string, to: string) {
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return null;
  const toExclusive = new Date(toDate.getTime() + 86400000);
  return {
    from_ts: fromDate.toISOString(),
    to_exclusive_ts: toExclusive.toISOString(),
  };
}

export function serializeIdentityBackfillCursor(cursor: IdentityBackfillCursor | null) {
  if (!cursor) return null;
  return JSON.stringify({
    current_platform: cleanText(cursor.current_platform),
    platform_order_id: cleanText(cursor.platform_order_id) || null,
  });
}

export function parseIdentityBackfillCursor(value: unknown, platforms: string[]): IdentityBackfillCursor {
  const firstPlatform = platforms[0] || IDENTITY_BACKFILL_DEFAULT_PLATFORMS[0];
  const fallback = { current_platform: firstPlatform, platform_order_id: null };
  if (!cleanText(value)) return fallback;
  try {
    const parsed = JSON.parse(cleanText(value));
    const platform = cleanText(parsed?.current_platform || parsed?.platform || firstPlatform).toLowerCase();
    return {
      current_platform: platforms.includes(platform) ? platform : firstPlatform,
      platform_order_id: cleanText(parsed?.platform_order_id || parsed?.cursor) || null,
    };
  } catch {
    return { current_platform: firstPlatform, platform_order_id: cleanText(value) || null };
  }
}

export function nextIdentityBackfillPlatform(currentPlatform: string, platforms: string[]) {
  const index = platforms.indexOf(cleanText(currentPlatform).toLowerCase());
  if (index < 0) return platforms[0] || null;
  return platforms[index + 1] || null;
}

export function isWowBoostIdentityBackfillPlatform(value: unknown) {
  const platform = cleanText(value).toLowerCase();
  return platform === "wowboost" || platform === "wowsuite:wowboost";
}

export function isLegacyWowSuiteRowConfidentlyWowBoost(row: Record<string, any>) {
  if (cleanText(row.platform).toLowerCase() !== "wowsuite") return false;
  const platformOrderId = cleanText(row.platform_order_id).toLowerCase();
  if (platformOrderId.startsWith("wowsuite:wowpay")) return false;
  if (platformOrderId.startsWith("wowsuite:wowboost:")) return true;
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  return hasAnyField(raw, [
    "Order ID",
    "Order Number",
    "Order Create Date",
    "ReferenceId",
    "Reference ID",
    "TransactionId",
    "Customer ID",
    "CustomerId",
  ]);
}

export function isSupportedIdentityBackfillPlatformOrder(row: Record<string, any>) {
  const platform = cleanText(row.platform).toLowerCase();
  if (IDENTITY_BACKFILL_EXCLUDED_PLATFORMS.has(platform)) return false;
  if (isWowBoostIdentityBackfillPlatform(platform)) return true;
  return isLegacyWowSuiteRowConfidentlyWowBoost(row);
}

function addCandidate(candidates: Array<{ type: IdentityIdentifierType; value: string; source_field: string; country?: string | null }>, type: IdentityIdentifierType, value: unknown, sourceField: string, country?: string | null) {
  const text = cleanText(value);
  if (!text || !isIdentityIdentifierType(type)) return;
  candidates.push({ type, value: text, source_field: sourceField, country: country || null });
}

export async function extractIdentityEvidenceFromPlatformOrder(row: Record<string, any>): Promise<IdentityBackfillEvidence> {
  const raw = row.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
  const warnings: string[] = [];
  const candidates: Array<{ type: IdentityIdentifierType; value: string; source_field: string; country?: string | null }> = [];

  addCandidate(candidates, "email", firstNonEmpty(
    row.customer_email_normalized,
    row.customer_email,
    row.email,
    pickField(raw, ["Customer Email", "CustomerEmail", "Email", "email", "customerEmail"]),
  ), "customer_email");

  const phoneValue = firstNonEmpty(
    row.phone,
    pickField(raw, ["Customer Phone", "CustomerPhone", "Phone", "phone", "Phone Number"]),
  );
  if (phoneValue) {
    addCandidate(candidates, "phone", phoneValue, "customer_phone");
  }

  addCandidate(candidates, "order_customer_id", firstNonEmpty(
    pickField(raw, [
      "Customer ID",
      "CustomerId",
      "Customer Id",
      "CustomerNumber",
      "Customer Number",
      "CustomerID",
      "customer_id",
      "CustomerGuid",
      "Customer GUID",
    ]),
  ), "customer_id");

  addCandidate(candidates, "external_customer_id", firstNonEmpty(
    pickField(raw, ["External Customer ID", "ExternalCustomerId", "External CustomerId"]),
  ), "external_customer_id");

  const identifiers: IdentityBackfillEvidence["identifiers"] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = await normalizeIdentityIdentifier({
      identifier_type: candidate.type,
      value: candidate.value,
      country: candidate.country,
    });
    if (!normalized.valid || !normalized.identifier_type) {
      for (const warning of normalized.warnings) warnings.push(`${candidate.source_field}:${warning}`);
      continue;
    }
    const key = `${normalized.identifier_type}:${normalized.normalized_value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    identifiers.push({
      identifier_type: normalized.identifier_type,
      value: candidate.value,
      verification_status: "observed",
      metadata: {
        source_field: candidate.source_field,
        normalized_hash: normalized.normalized_hash,
      },
    });
  }

  if (pickField(raw, ["Everflow Transaction ID", "EverflowTransactionId", "Transaction ID", "TransactionId"])) {
    warnings.push("attribution_or_payment_identifier_not_used_for_person_identity");
  }
  if (cleanText(row.commerce_reference)) warnings.push("commerce_reference_not_used_for_person_identity");

  return {
    identifiers,
    attributes: {
      display_name: firstNonEmpty(
        pickField(raw, ["Customer Name", "CustomerName", "Name"]),
      ) || null,
      first_name: firstNonEmpty(pickField(raw, ["First Name", "FirstName", "first_name"])) || null,
      last_name: firstNonEmpty(pickField(raw, ["Last Name", "LastName", "last_name"])) || null,
    },
    source_record_id: cleanText(row.platform_order_id) || null,
    observed_at: cleanText(row.order_ts) || null,
    warnings: uniqueStrings(warnings),
  };
}

export function hasIdentityEvidence(evidence: IdentityBackfillEvidence) {
  return evidence.identifiers.length > 0;
}

export function identityBackfillResolveDedupeKey(jobId: string, platformOrderIds: string[]) {
  const ids = platformOrderIds.map((id) => cleanText(id)).filter(Boolean);
  return `identity_resolve_batch:${jobId}:${ids[0] || "empty"}:${ids[ids.length - 1] || "empty"}:${ids.length}`;
}

export function normalizeIdentityBackfillDryRunResolveSummary(
  summary: IdentityBackfillResolveMetricSummary,
  parentDryRun: boolean,
): IdentityBackfillResolveMetricSummary {
  if (!parentDryRun) return { ...summary };
  return {
    ...summary,
    people_created: 0,
    people_matched: 0,
    attached: 0,
    review_required: 0,
    skipped_no_identifiers: 0,
    would_create_person: metricNumber(summary.would_create_person) + metricNumber(summary.people_created),
    would_match_existing: metricNumber(summary.would_match_existing) + metricNumber(summary.people_matched),
    would_require_review: metricNumber(summary.would_require_review) + metricNumber(summary.review_required),
    would_skip_no_identifiers: metricNumber(summary.would_skip_no_identifiers) + metricNumber(summary.skipped_no_identifiers),
  };
}

export function normalizeIdentityBackfillDryRunMetadata(metadata: Record<string, any> | null | undefined) {
  const next = { ...(metadata || {}) };
  if (!next.dry_run) return next;
  return {
    ...next,
    people_created: 0,
    people_matched: 0,
    attached: 0,
    review_required: 0,
    skipped_no_identifiers: 0,
    would_create_person: metricNumber(next.would_create_person) + metricNumber(next.people_created),
    would_match_existing: metricNumber(next.would_match_existing) + metricNumber(next.people_matched),
    would_require_review: metricNumber(next.would_require_review) + metricNumber(next.review_required),
    would_skip_no_identifiers: metricNumber(next.would_skip_no_identifiers) + metricNumber(next.skipped_no_identifiers),
  };
}

export function mergeIdentityBackfillResolveMetricMetadata(
  metadata: Record<string, any> | null | undefined,
  summary: IdentityBackfillResolveMetricSummary,
  parentDryRun: boolean,
) {
  const base = parentDryRun ? normalizeIdentityBackfillDryRunMetadata({ ...(metadata || {}), dry_run: true }) : { ...(metadata || {}) };
  const normalized = normalizeIdentityBackfillDryRunResolveSummary(summary, parentDryRun);
  return {
    ...base,
    people_created: metricNumber(base.people_created) + metricNumber(normalized.people_created),
    people_matched: metricNumber(base.people_matched) + metricNumber(normalized.people_matched),
    attached: metricNumber(base.attached) + metricNumber(normalized.attached),
    review_required: metricNumber(base.review_required) + metricNumber(normalized.review_required),
    skipped_no_identifiers: metricNumber(base.skipped_no_identifiers) + metricNumber(normalized.skipped_no_identifiers),
    would_create_person: metricNumber(base.would_create_person) + metricNumber(normalized.would_create_person),
    would_match_existing: metricNumber(base.would_match_existing) + metricNumber(normalized.would_match_existing),
    would_require_review: metricNumber(base.would_require_review) + metricNumber(normalized.would_require_review),
    would_skip_no_identifiers: metricNumber(base.would_skip_no_identifiers) + metricNumber(normalized.would_skip_no_identifiers),
  };
}

export async function previewIdentityResolutionReadOnly(
  repo: Pick<IdentityRepository, "findIdentifiers" | "listPeopleByIds">,
  args: {
    workspace_id: string;
    identifiers: IdentityInputIdentifier[];
  },
): Promise<IdentityBackfillPreviewResult> {
  const normalized = [];
  for (const identifier of args.identifiers || []) {
    const result = await normalizeIdentityIdentifier({
      identifier_type: identifier.identifier_type,
      value: identifier.value ?? identifier.raw_value,
      country: identifier.country,
    });
    if (result.valid && result.identifier_type) {
      normalized.push({
        identifier_type: result.identifier_type,
        normalized_value: result.normalized_value,
      });
    }
  }

  if (!normalized.length) {
    return { preview_action: "would_skip_no_identifiers", person_id: null, review_required: false };
  }

  const matches = await repo.findIdentifiers(args.workspace_id, normalized);
  const people = await repo.listPeopleByIds(args.workspace_id, Array.from(new Set(matches.map((match) => match.person_id))));
  const activePeople = people.filter((person) => person.status === "active");
  if (activePeople.length > 1) {
    return { preview_action: "would_require_review", person_id: null, review_required: true };
  }
  if (activePeople.length === 1) {
    return { preview_action: "would_match_existing", person_id: activePeople[0].id, review_required: false };
  }
  return { preview_action: "would_create_person", person_id: null, review_required: false };
}

export function identityBackfillFinalizeStatus(
  counts: Record<string, any>,
  args: {
    dry_run?: boolean;
    discovery_incomplete?: boolean;
    would_require_review?: number;
    permanent_errors?: number;
    attachment_conflicts?: number;
  } = {},
) {
  const dryRun = Boolean(args.dry_run);
  const remaining = dryRun ? 0 : Math.max(0, Number(counts.remaining_unlinked || 0));
  const review = Math.max(0, Number(counts.review_required_count || 0)) + Math.max(0, Number(args.would_require_review || 0));
  const noIdentifier = dryRun ? 0 : Math.max(0, Number(counts.no_identifier_count || 0));
  const runtimeErrors = Math.max(0, Number(counts.runtime_error_count || 0));
  const permanentErrors = Math.max(0, Number(args.permanent_errors || 0));
  const attachmentConflicts = Math.max(0, Number(args.attachment_conflicts || 0));
  return remaining || review || noIdentifier || runtimeErrors || permanentErrors || attachmentConflicts || args.discovery_incomplete
    ? "completed_with_errors"
    : "completed";
}

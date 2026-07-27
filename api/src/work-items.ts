import { cleanText } from "./identity-normalization.ts";
import {
  getWorkspaceHealthReport,
  type HealthCategory,
  type HealthFinding,
  type HealthLifecycleState,
  type HealthReport,
  type HealthSeverity,
} from "./health.ts";
import type { DomainEventInput, EntityReference } from "./domain-events.ts";

export const WORK_ITEM_ENGINE_VERSION = "work_items_v1";
export const WORK_ITEMS_ROUTE = "/v1/work-items";
export const OPERATIONS_SUMMARY_ROUTE = "/v1/operations/summary";

export const WORK_ITEM_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "dismissed"] as const;
export const WORK_ITEM_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export const WORK_ITEM_CATEGORIES = ["identity", "attribution", "commissions", "refunds", "chargebacks", "integrations", "tracking", "system"] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];
export type WorkItemCategory = (typeof WORK_ITEM_CATEGORIES)[number];
export type WorkItemSource = "health" | "identity" | "attribution" | "commission" | "order" | "connector" | "manual";

export type WorkItemRouteMatch =
  | { kind: "list_work_items" }
  | { kind: "operations_summary" }
  | { kind: "get_work_item"; work_item_id: string }
  | { kind: "acknowledge"; work_item_id: string }
  | { kind: "start"; work_item_id: string }
  | { kind: "assign"; work_item_id: string }
  | { kind: "priority"; work_item_id: string }
  | { kind: "resolve"; work_item_id: string }
  | { kind: "dismiss"; work_item_id: string }
  | { kind: "reopen"; work_item_id: string }
  | { kind: "add_note"; work_item_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type WorkItemQueryParams = {
  workspace_id: string;
  status: WorkItemStatus[];
  priority: WorkItemPriority[];
  category: WorkItemCategory[];
  source: string[];
  assigned_to: string | null;
  customer_id: string | null;
  person_id: string | null;
  order_id: string | null;
  connector_id: string | null;
  search: string | null;
  sort: "priority" | "newest" | "oldest" | "updated" | "severity";
  limit: number;
  cursor: number;
};

export type WorkItemCandidate = {
  workspace_id: string;
  type: string;
  category: WorkItemCategory;
  source: WorkItemSource;
  source_key: string;
  title: string;
  summary: string;
  severity: HealthSeverity;
  priority: WorkItemPriority;
  lifecycle_state: HealthLifecycleState;
  related_person_id?: string | null;
  related_journey_id?: string | null;
  related_order_id?: string | null;
  related_conversion_id?: string | null;
  related_commission_id?: string | null;
  related_connector_id?: string | null;
  related_health_finding_id?: string | null;
  related_notification_id?: string | null;
  deep_link?: string | null;
  evidence?: Record<string, any>;
  metadata?: Record<string, any>;
  detected_at?: string | null;
};

export type WorkItemRow = WorkItemCandidate & {
  id: string;
  status: WorkItemStatus;
  assigned_to: string | null;
  first_detected_at: string;
  last_detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  resolution_code: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolution: Record<string, any>;
  recurrence_count: number;
  created_at: string;
  updated_at: string;
};

export type WorkItemActivityRow = {
  id?: string;
  workspace_id: string;
  work_item_id: string;
  activity_type: string;
  actor_id: string | null;
  body: string | null;
  metadata: Record<string, any>;
  created_at?: string;
};

export type WorkItemDomainEventContext = {
  workspace_id: string;
  action: "acknowledge" | "start" | "assign" | "priority" | "resolve" | "dismiss" | "reopen" | "note";
  activity_type: string;
  actor_id: string | null;
  previous: WorkItemRow;
  current: WorkItemRow;
  changed_fields: string[];
  occurred_at: string;
};

export const WORK_ITEM_SELECT = [
  "id",
  "workspace_id",
  "type",
  "category",
  "source",
  "source_key",
  "title",
  "summary",
  "severity",
  "priority",
  "status",
  "lifecycle_state",
  "assigned_to",
  "related_person_id",
  "related_journey_id",
  "related_order_id",
  "related_conversion_id",
  "related_commission_id",
  "related_connector_id",
  "related_health_finding_id",
  "related_notification_id",
  "deep_link",
  "evidence",
  "resolution",
  "first_detected_at",
  "last_detected_at",
  "acknowledged_at",
  "resolved_at",
  "dismissed_at",
  "resolution_code",
  "resolution_note",
  "resolved_by",
  "recurrence_count",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

export const WORK_ITEM_ACTIVITY_SELECT = "id,workspace_id,work_item_id,activity_type,actor_id,body,metadata,created_at";

const HEALTH_CATEGORY_TO_WORK_ITEM_CATEGORY: Record<HealthCategory, WorkItemCategory> = {
  tracking: "tracking",
  identity: "identity",
  journeys: "system",
  attribution: "attribution",
  commissions: "commissions",
  integrations: "integrations",
  platform_processing: "system",
};

const HEALTH_WORK_ITEM_TYPES: Record<string, { type: string; category?: WorkItemCategory; source_key?: string }> = {
  "identity.resolution_rate": { type: "identity_unresolved", category: "identity" },
  "identity.review": { type: "identity_backfill_issue", category: "identity" },
  "attribution.coverage": { type: "attribution_degraded", category: "attribution" },
  "attribution.attributed_rate": { type: "attribution_degraded", category: "attribution" },
  "commissions.duplicates": { type: "commission_duplicate", category: "commissions" },
  "platform_processing.runtime_tasks": { type: "connector_import_failure", category: "integrations" },
  "platform_processing.recent_errors": { type: "connector_import_failure", category: "integrations" },
  "tracking.browser_activity": { type: "browser_sdk_inactive", category: "tracking" },
  "tracking.activity": { type: "browser_sdk_inactive", category: "tracking" },
  "tracking.event_drop": { type: "browser_event_drop", category: "tracking" },
};

const TERMINAL_STATUSES = new Set<WorkItemStatus>(["resolved", "dismissed"]);
const ACTIVE_WORKFLOW_STATUSES = new Set<WorkItemStatus>(["open", "acknowledged", "in_progress"]);
const ACTIVE_LIFECYCLE_STATES = new Set<HealthLifecycleState>(["needs_configuration", "degraded", "failing"]);

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => splitList(item));
  return String(value || "")
    .split(",")
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean);
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizedPath(path: string) {
  const trimmed = String(path || "").replace(/\/+$/, "");
  return trimmed || "/";
}

function stableIdPart(value: unknown) {
  const text = cleanText(value).replace(/[^a-zA-Z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "");
  return text || "unknown";
}

export function workItemIdForSource(workspaceId: string, source: string, sourceKey: string) {
  return `work_item:${stableIdPart(workspaceId)}:${stableIdPart(source)}:${stableIdPart(sourceKey)}`.slice(0, 500);
}

export function healthWorkItemSourceKey(findingId: string) {
  return cleanText(findingId);
}

export function healthWorkItemId(workspaceId: string, findingId: string) {
  return workItemIdForSource(workspaceId, "health", healthWorkItemSourceKey(findingId));
}

export function matchWorkItemRoute(method: string, path: string): WorkItemRouteMatch | null {
  const cleanPath = normalizedPath(path);
  const upperMethod = String(method || "GET").toUpperCase();
  if (cleanPath === WORK_ITEMS_ROUTE) {
    if (upperMethod === "GET") return { kind: "list_work_items" };
    return { kind: "method_not_allowed", path: WORK_ITEMS_ROUTE, allowed_methods: ["GET"] };
  }
  if (cleanPath === OPERATIONS_SUMMARY_ROUTE) {
    if (upperMethod === "GET") return { kind: "operations_summary" };
    return { kind: "method_not_allowed", path: OPERATIONS_SUMMARY_ROUTE, allowed_methods: ["GET"] };
  }

  const actionMatch = new RegExp(`^${WORK_ITEMS_ROUTE}/([^/]+)/(acknowledge|start|assign|priority|resolve|dismiss|reopen|notes)$`).exec(cleanPath);
  if (actionMatch) {
    if (upperMethod !== "POST") return { kind: "method_not_allowed", path: `${WORK_ITEMS_ROUTE}/:id/${actionMatch[2]}`, allowed_methods: ["POST"] };
    const workItemId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    if (action === "acknowledge") return { kind: "acknowledge", work_item_id: workItemId };
    if (action === "start") return { kind: "start", work_item_id: workItemId };
    if (action === "assign") return { kind: "assign", work_item_id: workItemId };
    if (action === "priority") return { kind: "priority", work_item_id: workItemId };
    if (action === "resolve") return { kind: "resolve", work_item_id: workItemId };
    if (action === "dismiss") return { kind: "dismiss", work_item_id: workItemId };
    if (action === "reopen") return { kind: "reopen", work_item_id: workItemId };
    return { kind: "add_note", work_item_id: workItemId };
  }

  const detailMatch = new RegExp(`^${WORK_ITEMS_ROUTE}/([^/]+)$`).exec(cleanPath);
  if (detailMatch) {
    if (upperMethod === "GET") return { kind: "get_work_item", work_item_id: decodeURIComponent(detailMatch[1]) };
    return { kind: "method_not_allowed", path: `${WORK_ITEMS_ROUTE}/:id`, allowed_methods: ["GET"] };
  }
  return null;
}

export function normalizeWorkItemParams(args: Record<string, unknown>): WorkItemQueryParams {
  const status = splitList(args.status).filter((item): item is WorkItemStatus => WORK_ITEM_STATUSES.includes(item as WorkItemStatus));
  const priority = splitList(args.priority).filter((item): item is WorkItemPriority => WORK_ITEM_PRIORITIES.includes(item as WorkItemPriority));
  const category = splitList(args.category).filter((item): item is WorkItemCategory => WORK_ITEM_CATEGORIES.includes(item as WorkItemCategory));
  const sort = cleanText(args.sort).toLowerCase();
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    status,
    priority,
    category,
    source: splitList(args.source),
    assigned_to: cleanText(args.assigned_to || args.assignedTo) || null,
    customer_id: cleanText(args.customer_id || args.customerId) || null,
    person_id: cleanText(args.person_id || args.personId || args.customer_id || args.customerId) || null,
    order_id: cleanText(args.order_id || args.orderId) || null,
    connector_id: cleanText(args.connector_id || args.connectorId) || null,
    search: cleanText(args.search || args.q) || null,
    sort: ["priority", "newest", "oldest", "updated", "severity"].includes(sort) ? sort as WorkItemQueryParams["sort"] : "priority",
    limit: clampInt(args.limit, 50, 1, 100),
    cursor: clampInt(args.cursor, 0, 0, 1000000),
  };
}

export function isSourceConditionActive(lifecycle: HealthLifecycleState | string) {
  return ACTIVE_LIFECYCLE_STATES.has(lifecycle as HealthLifecycleState);
}

export function workItemPriorityFor(args: { severity: HealthSeverity | string; type?: string | null; lifecycle_state?: string | null }): WorkItemPriority {
  const severity = cleanText(args.severity).toLowerCase();
  const type = cleanText(args.type).toLowerCase();
  if (severity === "critical") return type.includes("connector") || type.includes("sdk") || type.includes("duplicate") ? "urgent" : "high";
  if (type === "attribution_missing" || type === "commission_missing" || type === "refund_without_commission_reversal") return "high";
  if (severity === "warning") return "high";
  if (severity === "info") return "low";
  return "normal";
}

export function workItemCategoryForType(type: string): WorkItemCategory {
  const clean = cleanText(type).toLowerCase();
  if (clean.includes("identity")) return "identity";
  if (clean.includes("attribution")) return "attribution";
  if (clean.includes("commission")) return "commissions";
  if (clean.includes("refund")) return "refunds";
  if (clean.includes("chargeback")) return "chargebacks";
  if (clean.includes("connector") || clean.includes("import") || clean.includes("sync")) return "integrations";
  if (clean.includes("browser") || clean.includes("tracking")) return "tracking";
  return "system";
}

export function workItemDeepLink(candidate: Pick<WorkItemCandidate, "related_person_id" | "related_journey_id" | "related_order_id" | "related_connector_id" | "category" | "type">) {
  if (candidate.related_person_id) {
    const query = new URLSearchParams();
    if (candidate.related_journey_id) query.set("journey_id", candidate.related_journey_id);
    if (candidate.related_order_id) query.set("order_id", candidate.related_order_id);
    const suffix = query.toString();
    return `/customers/${encodeURIComponent(candidate.related_person_id)}${suffix ? `?${suffix}` : ""}`;
  }
  if (candidate.related_connector_id) return `/settings/integrations/${encodeURIComponent(candidate.related_connector_id)}`;
  if (candidate.related_order_id) return `/orders/${encodeURIComponent(candidate.related_order_id)}`;
  if (candidate.category === "attribution") return "/customers?has_purchase=true&has_attribution=false";
  if (candidate.category === "commissions") return "/reports";
  if (candidate.category === "tracking") return "/events";
  if (candidate.category === "integrations") return "/settings/integrations";
  return "/operations";
}

export function workItemCandidateFromHealthFinding(workspaceId: string, finding: HealthFinding): WorkItemCandidate | null {
  const mapping = HEALTH_WORK_ITEM_TYPES[finding.id];
  if (!mapping) return null;
  const sourceKey = mapping.source_key || healthWorkItemSourceKey(finding.id);
  const category = mapping.category || HEALTH_CATEGORY_TO_WORK_ITEM_CATEGORY[finding.category];
  return {
    workspace_id: workspaceId,
    type: mapping.type,
    category,
    source: "health",
    source_key: sourceKey,
    title: finding.title,
    summary: finding.summary,
    severity: finding.severity,
    priority: workItemPriorityFor({ severity: finding.severity, type: mapping.type, lifecycle_state: finding.lifecycle_state }),
    lifecycle_state: finding.lifecycle_state,
    related_health_finding_id: finding.id,
    related_notification_id: `health_notification:${workspaceId}:${finding.id}`,
    deep_link: workItemDeepLink({ category, type: mapping.type }),
    evidence: {
      metric_value: finding.metric_value,
      threshold: finding.threshold,
      lifecycle_state: finding.lifecycle_state,
      health_status: finding.status,
      applicability_reason: finding.applicability_reason,
      evaluation_context: finding.evaluation_context,
      ...redactWorkItemEvidence(finding.evidence || {}),
    },
    metadata: {
      health_category: finding.category,
      why_it_matters: finding.why_it_matters,
      recommended_action: finding.recommended_action,
      engine_version: WORK_ITEM_ENGINE_VERSION,
    },
    detected_at: finding.detected_at || finding.updated_at,
  };
}

export function mergeWorkItemCandidate(existing: WorkItemRow | null | undefined, candidate: WorkItemCandidate, now = new Date().toISOString()) {
  const active = isSourceConditionActive(candidate.lifecycle_state);
  const base = {
    id: existing?.id || workItemIdForSource(candidate.workspace_id, candidate.source, candidate.source_key),
    workspace_id: candidate.workspace_id,
    type: candidate.type,
    category: candidate.category,
    source: candidate.source,
    source_key: candidate.source_key,
    title: candidate.title,
    summary: candidate.summary,
    severity: candidate.severity,
    priority: existing?.priority || candidate.priority,
    lifecycle_state: candidate.lifecycle_state,
    related_person_id: candidate.related_person_id || existing?.related_person_id || null,
    related_journey_id: candidate.related_journey_id || existing?.related_journey_id || null,
    related_order_id: candidate.related_order_id || existing?.related_order_id || null,
    related_conversion_id: candidate.related_conversion_id || existing?.related_conversion_id || null,
    related_commission_id: candidate.related_commission_id || existing?.related_commission_id || null,
    related_connector_id: candidate.related_connector_id || existing?.related_connector_id || null,
    related_health_finding_id: candidate.related_health_finding_id || existing?.related_health_finding_id || null,
    related_notification_id: candidate.related_notification_id || existing?.related_notification_id || null,
    deep_link: candidate.deep_link || existing?.deep_link || workItemDeepLink(candidate),
    evidence: redactWorkItemEvidence(candidate.evidence || {}),
    metadata: {
      ...(existing?.metadata || {}),
      ...(candidate.metadata || {}),
      engine_version: WORK_ITEM_ENGINE_VERSION,
      source_updated_at: now,
    },
    first_detected_at: existing?.first_detected_at || candidate.detected_at || now,
    last_detected_at: active ? now : existing?.last_detected_at || candidate.detected_at || now,
    updated_at: now,
  };

  if (!existing) {
    return {
      ...base,
      status: active ? "open" as WorkItemStatus : "resolved" as WorkItemStatus,
      assigned_to: null,
      acknowledged_at: null,
      resolved_at: active ? null : now,
      dismissed_at: null,
      resolution_code: active ? null : "source_recovered",
      resolution_note: null,
      resolved_by: null,
      resolution: active ? {} : { code: "source_recovered", source: candidate.source, auto_resolved: true },
      recurrence_count: 0,
      created_at: now,
    };
  }

  let status = existing.status;
  let resolvedAt = existing.resolved_at || null;
  let dismissedAt = existing.dismissed_at || null;
  let acknowledgedAt = existing.acknowledged_at || null;
  let resolutionCode = existing.resolution_code || null;
  let resolutionNote = existing.resolution_note || null;
  let resolvedBy = existing.resolved_by || null;
  let resolution = existing.resolution || {};
  let recurrenceCount = Number(existing.recurrence_count || 0);

  if (active) {
    if (existing.status === "resolved") {
      status = "open";
      resolvedAt = null;
      resolutionCode = null;
      resolutionNote = null;
      resolvedBy = null;
      resolution = {};
      recurrenceCount += 1;
    }
  } else if (ACTIVE_WORKFLOW_STATUSES.has(existing.status)) {
    status = "resolved";
    resolvedAt = now;
    resolutionCode = "source_recovered";
    resolutionNote = null;
    resolvedBy = null;
    resolution = { code: "source_recovered", source: candidate.source, auto_resolved: true };
  }

  if (existing.status === "dismissed") {
    status = "dismissed";
    dismissedAt = existing.dismissed_at || now;
  }

  return {
    ...base,
    status,
    assigned_to: existing.assigned_to || null,
    acknowledged_at: acknowledgedAt,
    resolved_at: resolvedAt,
    dismissed_at: dismissedAt,
    resolution_code: resolutionCode,
    resolution_note: resolutionNote,
    resolved_by: resolvedBy,
    resolution,
    recurrence_count: recurrenceCount,
    created_at: existing.created_at || now,
  };
}

export function buildWorkItemExplanation(item: WorkItemRow) {
  const evidence = item.evidence || {};
  const steps = recommendedReviewSteps(item);
  return {
    title: "Why this item exists",
    summary: item.summary,
    statements: [
      {
        id: `${item.id}:source`,
        text: `${item.title} was created from ${item.source} evidence with lifecycle state ${item.lifecycle_state}.`,
        evidence_type: item.source,
        evidence_ids: [item.source_key].filter(Boolean),
      },
      item.related_person_id ? {
        id: `${item.id}:person`,
        text: `The item is linked to customer ${item.related_person_id}.`,
        evidence_type: "customer",
        evidence_ids: [item.related_person_id],
      } : null,
      item.related_order_id ? {
        id: `${item.id}:order`,
        text: `The item references order ${item.related_order_id}.`,
        evidence_type: "order",
        evidence_ids: [item.related_order_id],
      } : null,
      evidence.metric_value ? {
        id: `${item.id}:metric`,
        text: `The source metric was ${evidence.metric_value}${evidence.threshold ? ` against threshold ${evidence.threshold}` : ""}.`,
        evidence_type: "metric",
        evidence_ids: [item.source_key],
      } : null,
    ].filter(Boolean),
    recommended_review_steps: steps,
    limitations: [
      "This explanation is deterministic and uses stored operational evidence only.",
      "The source system remains authoritative; Work Item evidence is a bounded workflow snapshot.",
    ],
  };
}

export function recommendedReviewSteps(item: Pick<WorkItemRow, "category" | "type" | "deep_link">) {
  if (item.category === "identity") return ["Open the related Customer 360 or identity review queue.", "Verify deterministic identifiers before changing workflow status."];
  if (item.category === "attribution") return ["Open the customer journey and inspect eligible marketing touchpoints.", "Verify the Attribution Backfill processed the conversion."];
  if (item.category === "commissions") return ["Review the immutable attribution credit and generated commission ledger row.", "Use the Payout Engine workflow for payable commission corrections."];
  if (item.category === "integrations") return ["Open connector diagnostics and inspect failed jobs or queued tasks.", "Retry only idempotent connector runtime tasks."];
  if (item.category === "tracking") return ["Open browser event setup and confirm the SDK write key and allowed origins.", "Verify recent browser events are being normalized."];
  return ["Review the linked evidence and source page.", "Resolve or dismiss with an audit note when the workflow decision is clear."];
}

export function redactWorkItemEvidence(value: any, depth = 0): any {
  if (depth > 4) return "[redacted_nested_value]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 700 ? `${value.slice(0, 700)}...` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactWorkItemEvidence(item, depth + 1));
  const blocked = /token|secret|authorization|password|card|cvv|pan|credential|access[_-]?key|api[_-]?key|bearer/i;
  const out: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = blocked.test(key) ? "[redacted]" : redactWorkItemEvidence(nested, depth + 1);
  }
  return out;
}

async function supabaseRows<T = any>(query: any, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return (data || []) as T[];
}

async function supabaseSingle<T = any>(query: any, label: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return (data || null) as T | null;
}

async function insertActivity(supabase: any, activity: WorkItemActivityRow) {
  const { error } = await supabase.from("work_item_activity").insert(activity);
  if (error) throw new Error(`Work Item activity insert failed: ${error.message || JSON.stringify(error)}`);
}

async function loadExistingBySource(supabase: any, workspaceId: string, source: string, sourceKeys: string[]) {
  if (!sourceKeys.length) return new Map<string, WorkItemRow>();
  const rows = await supabaseRows<WorkItemRow>(
    supabase
      .from("work_items")
      .select(WORK_ITEM_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("source", source)
      .in("source_key", Array.from(new Set(sourceKeys))),
    "Work Item source lookup",
  );
  return new Map(rows.map((row) => [cleanText(row.source_key), row]));
}

export async function upsertWorkItemCandidate(supabase: any, candidate: WorkItemCandidate, existing?: WorkItemRow | null, now = new Date().toISOString()) {
  const current = existing === undefined
    ? await supabaseSingle<WorkItemRow>(
      supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", candidate.workspace_id).eq("source", candidate.source).eq("source_key", candidate.source_key).maybeSingle(),
      "Work Item lookup",
    )
    : existing;
  const merged = mergeWorkItemCandidate(current, candidate, now);
  const changedStatus = current && current.status !== merged.status;
  const changedLifecycle = current && current.lifecycle_state !== merged.lifecycle_state;
  const created = !current;
  const { data, error } = await supabase
    .from("work_items")
    .upsert(merged, { onConflict: "workspace_id,source,source_key" })
    .select(WORK_ITEM_SELECT)
    .maybeSingle();
  if (error) throw new Error(`Work Item upsert failed: ${error.message || JSON.stringify(error)}`);

  if (created || changedStatus || changedLifecycle) {
    await insertActivity(supabase, {
      workspace_id: candidate.workspace_id,
      work_item_id: data.id,
      activity_type: created ? "created" : changedStatus ? "status_changed" : "source_updated",
      actor_id: null,
      body: created ? "Work Item created from source evidence." : changedStatus ? `Status changed from ${current?.status} to ${merged.status}.` : "Source lifecycle evidence changed.",
      metadata: {
        source: candidate.source,
        source_key: candidate.source_key,
        previous_status: current?.status || null,
        next_status: merged.status,
        previous_lifecycle_state: current?.lifecycle_state || null,
        next_lifecycle_state: merged.lifecycle_state,
      },
      created_at: now,
    });
  }
  return data as WorkItemRow;
}

export async function syncHealthWorkItems(supabase: any, health: HealthReport, now = new Date().toISOString()) {
  const candidates = health.findings
    .map((finding) => workItemCandidateFromHealthFinding(health.workspace_id, finding))
    .filter(Boolean) as WorkItemCandidate[];
  const existing = await loadExistingBySource(supabase, health.workspace_id, "health", candidates.map((candidate) => candidate.source_key));
  const items: WorkItemRow[] = [];
  for (const candidate of candidates) {
    const current = existing.get(candidate.source_key) || null;
    if (!current && !isSourceConditionActive(candidate.lifecycle_state)) continue;
    items.push(await upsertWorkItemCandidate(supabase, candidate, current, now));
  }
  return items;
}

function moneyFrom(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function syncAttributionExceptions(supabase: any, workspaceId: string, now: string) {
  const purchases = await supabaseRows<any>(
    supabase
      .from("journey_events")
      .select("id,workspace_id,journey_id,person_id,platform_order_id,source_record_id,event_type,event_time,amount,currency,affiliate_id,source_platform")
      .eq("workspace_id", workspaceId)
      .in("event_type", ["purchase", "upsell", "subscription_started", "subscription_renewed"])
      .not("person_id", "is", null)
      .order("event_time", { ascending: false })
      .limit(50),
    "Attribution exception purchase lookup",
  );
  const conversionIds = purchases.map((row: any) => cleanText(row.id)).filter(Boolean);
  if (!conversionIds.length) return [] as WorkItemRow[];
  const credits = await supabaseRows<any>(
    supabase.from("journey_attribution_credits").select("id,conversion_event_id,status").eq("workspace_id", workspaceId).in("conversion_event_id", conversionIds),
    "Attribution credit lookup",
  );
  const credited = new Set(credits.map((row: any) => cleanText(row.conversion_event_id)).filter(Boolean));
  const existing = await loadExistingBySource(supabase, workspaceId, "attribution", purchases.map((row: any) => `missing:${cleanText(row.id)}`));
  const items: WorkItemRow[] = [];
  for (const row of purchases) {
    const id = cleanText(row.id);
    if (!id || credited.has(id)) continue;
    const sourceKey = `missing:${id}`;
    const candidate: WorkItemCandidate = {
      workspace_id: workspaceId,
      type: "attribution_missing",
      category: "attribution",
      source: "attribution",
      source_key: sourceKey,
      title: "Purchase has no attribution credit",
      summary: `${cleanText(row.platform_order_id || row.source_record_id || id) || "A purchase"} is linked to a customer but has no stored attribution credit.`,
      severity: "warning",
      priority: "high",
      lifecycle_state: "degraded",
      related_person_id: cleanText(row.person_id) || null,
      related_journey_id: cleanText(row.journey_id) || null,
      related_order_id: cleanText(row.platform_order_id || row.source_record_id) || null,
      related_conversion_id: id,
      deep_link: workItemDeepLink({
        category: "attribution",
        type: "attribution_missing",
        related_person_id: cleanText(row.person_id) || null,
        related_journey_id: cleanText(row.journey_id) || null,
        related_order_id: cleanText(row.platform_order_id || row.source_record_id) || null,
      }),
      evidence: {
        conversion_event_id: id,
        platform_order_id: row.platform_order_id || null,
        amount: moneyFrom(row.amount),
        currency: cleanText(row.currency) || null,
        source_platform: cleanText(row.source_platform) || null,
        attribution_credit_count: 0,
      },
      detected_at: cleanText(row.event_time) || now,
    };
    items.push(await upsertWorkItemCandidate(supabase, candidate, existing.get(sourceKey) || null, now));
  }
  return items;
}

async function syncCommissionExceptions(supabase: any, workspaceId: string, now: string) {
  const commissions = await supabaseRows<any>(
    supabase
      .from("affiliate_commissions")
      .select("id,workspace_id,conversion_event_id,person_id,journey_id,commission_amount,currency,status,affiliate_id,publisher_id,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500),
    "Commission exception lookup",
  );
  const byConversion = new Map<string, any[]>();
  for (const row of commissions) {
    const key = cleanText(row.conversion_event_id);
    if (!key) continue;
    const rows = byConversion.get(key) || [];
    rows.push(row);
    byConversion.set(key, rows);
  }
  const duplicateKeys = Array.from(byConversion.entries()).filter(([, rows]) => rows.length > 1).map(([key]) => `duplicate:${key}`);
  const existing = await loadExistingBySource(supabase, workspaceId, "commission", duplicateKeys);
  const items: WorkItemRow[] = [];
  for (const [conversionId, rows] of byConversion.entries()) {
    if (rows.length <= 1) continue;
    const sourceKey = `duplicate:${conversionId}`;
    const first = rows[0] || {};
    const candidate: WorkItemCandidate = {
      workspace_id: workspaceId,
      type: "commission_duplicate",
      category: "commissions",
      source: "commission",
      source_key: sourceKey,
      title: "Duplicate commissions exist for one conversion",
      summary: `${rows.length} commission rows reference conversion ${conversionId}.`,
      severity: "critical",
      priority: "urgent",
      lifecycle_state: "failing",
      related_person_id: cleanText(first.person_id) || null,
      related_journey_id: cleanText(first.journey_id) || null,
      related_conversion_id: conversionId,
      related_commission_id: cleanText(first.id) || null,
      deep_link: workItemDeepLink({ category: "commissions", type: "commission_duplicate", related_person_id: cleanText(first.person_id) || null, related_journey_id: cleanText(first.journey_id) || null }),
      evidence: {
        conversion_event_id: conversionId,
        commission_count: rows.length,
        commission_ids: rows.map((row) => row.id).slice(0, 10),
        statuses: Array.from(new Set(rows.map((row) => cleanText(row.status)).filter(Boolean))),
      },
      detected_at: cleanText(first.created_at || first.updated_at) || now,
    };
    items.push(await upsertWorkItemCandidate(supabase, candidate, existing.get(sourceKey) || null, now));
  }
  return items;
}

async function syncConnectorExceptions(supabase: any, workspaceId: string, now: string) {
  const [jobs, tasks] = await Promise.all([
    supabaseRows<any>(
      supabase.from("integration_import_jobs").select("id,workspace_id,connector_id,job_type,status,phase,last_error,updated_at,completed_at").eq("workspace_id", workspaceId).eq("status", "failed").order("updated_at", { ascending: false }).limit(25),
      "Failed import job lookup",
    ),
    supabaseRows<any>(
      supabase.from("connector_import_tasks").select("id,workspace_id,job_id,connector_id,task_type,status,last_error,updated_at,completed_at").eq("workspace_id", workspaceId).eq("status", "failed").order("updated_at", { ascending: false }).limit(25),
      "Failed connector task lookup",
    ),
  ]);
  const keys = [...jobs.map((row) => `failed_job:${row.id}`), ...tasks.map((row) => `failed_task:${row.id}`)];
  const existing = await loadExistingBySource(supabase, workspaceId, "connector", keys);
  const items: WorkItemRow[] = [];
  for (const row of jobs) {
    const sourceKey = `failed_job:${row.id}`;
    items.push(await upsertWorkItemCandidate(supabase, {
      workspace_id: workspaceId,
      type: "connector_import_failure",
      category: "integrations",
      source: "connector",
      source_key: sourceKey,
      title: "Connector import job failed",
      summary: `${cleanText(row.connector_id || row.job_type || "Connector")} job ${row.id} failed.`,
      severity: "warning",
      priority: "high",
      lifecycle_state: "degraded",
      related_connector_id: cleanText(row.connector_id) || null,
      deep_link: workItemDeepLink({ category: "integrations", type: "connector_import_failure", related_connector_id: cleanText(row.connector_id) || null }),
      evidence: redactWorkItemEvidence({ job_id: row.id, connector_id: row.connector_id, job_type: row.job_type, phase: row.phase, last_error: row.last_error }),
      detected_at: cleanText(row.updated_at || row.completed_at) || now,
    }, existing.get(sourceKey) || null, now));
  }
  for (const row of tasks) {
    const sourceKey = `failed_task:${row.id}`;
    items.push(await upsertWorkItemCandidate(supabase, {
      workspace_id: workspaceId,
      type: "connector_import_failure",
      category: "integrations",
      source: "connector",
      source_key: sourceKey,
      title: "Connector runtime task failed",
      summary: `${cleanText(row.connector_id || row.task_type || "Connector")} task ${row.id} failed.`,
      severity: "warning",
      priority: "high",
      lifecycle_state: "degraded",
      related_connector_id: cleanText(row.connector_id) || null,
      deep_link: workItemDeepLink({ category: "integrations", type: "connector_import_failure", related_connector_id: cleanText(row.connector_id) || null }),
      evidence: redactWorkItemEvidence({ task_id: row.id, job_id: row.job_id, connector_id: row.connector_id, task_type: row.task_type, last_error: row.last_error }),
      detected_at: cleanText(row.updated_at || row.completed_at) || now,
    }, existing.get(sourceKey) || null, now));
  }
  return items;
}

export async function syncWorkspaceWorkItems(supabase: any, args: { workspace_id: string; include_record_exceptions?: boolean }, now = new Date()) {
  const generatedAt = now.toISOString();
  const health = await getWorkspaceHealthReport(supabase, { workspace_id: args.workspace_id }, now);
  const healthItems = await syncHealthWorkItems(supabase, health, generatedAt);
  const recordItems = args.include_record_exceptions === false ? [] : [
    ...(await syncAttributionExceptions(supabase, args.workspace_id, generatedAt)),
    ...(await syncCommissionExceptions(supabase, args.workspace_id, generatedAt)),
    ...(await syncConnectorExceptions(supabase, args.workspace_id, generatedAt)),
  ];
  return { health, work_items: [...healthItems, ...recordItems] };
}

function applySort(rows: WorkItemRow[], sort: WorkItemQueryParams["sort"]) {
  const priorityRank: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
  const severityRank: Record<string, number> = { critical: 4, warning: 3, info: 2, healthy: 1 };
  const unresolved = (item: WorkItemRow) => TERMINAL_STATUSES.has(item.status) ? 0 : 1;
  return [...rows].sort((a, b) => {
    if (sort === "newest") return Date.parse(b.first_detected_at || b.created_at) - Date.parse(a.first_detected_at || a.created_at) || a.id.localeCompare(b.id);
    if (sort === "oldest") return Date.parse(a.first_detected_at || a.created_at) - Date.parse(b.first_detected_at || b.created_at) || a.id.localeCompare(b.id);
    if (sort === "updated") return Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at) || a.id.localeCompare(b.id);
    if (sort === "severity") return severityRank[b.severity] - severityRank[a.severity] || Date.parse(a.first_detected_at || a.created_at) - Date.parse(b.first_detected_at || b.created_at) || a.id.localeCompare(b.id);
    return unresolved(b) - unresolved(a)
      || priorityRank[b.priority] - priorityRank[a.priority]
      || Date.parse(a.first_detected_at || a.created_at) - Date.parse(b.first_detected_at || b.created_at)
      || a.id.localeCompare(b.id);
  });
}

export async function listWorkItems(supabase: any, params: WorkItemQueryParams, options: { sync?: boolean } = {}) {
  if (options.sync !== false) await syncWorkspaceWorkItems(supabase, { workspace_id: params.workspace_id });
  let query = supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", params.workspace_id);
  const statuses = params.status.length ? params.status : ["open", "acknowledged", "in_progress"] as WorkItemStatus[];
  if (statuses.length) query = query.in("status", statuses);
  if (params.priority.length) query = query.in("priority", params.priority);
  if (params.category.length) query = query.in("category", params.category);
  if (params.source.length) query = query.in("source", params.source);
  if (params.assigned_to === "me") {
    query = query.not("assigned_to", "is", null);
  } else if (params.assigned_to === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (params.assigned_to) {
    query = query.eq("assigned_to", params.assigned_to);
  }
  if (params.person_id) query = query.eq("related_person_id", params.person_id);
  if (params.order_id) query = query.eq("related_order_id", params.order_id);
  if (params.connector_id) query = query.eq("related_connector_id", params.connector_id);
  if (params.search) {
    const safe = params.search.replace(/[%_,]/g, " ");
    query = query.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%,source_key.ilike.%${safe}%`);
  }
  const rows = await supabaseRows<WorkItemRow>(
    query.order("updated_at", { ascending: false }).limit(Math.min(500, params.cursor + params.limit + 1)),
    "Work Item list lookup",
  );
  const sorted = applySort(rows, params.sort);
  const page = sorted.slice(params.cursor, params.cursor + params.limit);
  const nextOffset = params.cursor + page.length;
  const hasMore = nextOffset < sorted.length;
  return {
    ok: true,
    workspace_id: params.workspace_id,
    work_items: page.map(serializeWorkItem),
    next_cursor: hasMore ? String(nextOffset) : null,
    has_more: hasMore,
    summary: await getWorkItemSummaryMetrics(supabase, params.workspace_id),
    page: { limit: params.limit, cursor: params.cursor ? String(params.cursor) : null },
    filters: {
      status: statuses,
      priority: params.priority,
      category: params.category,
      source: params.source,
      assigned_to: params.assigned_to,
      person_id: params.person_id,
      order_id: params.order_id,
      connector_id: params.connector_id,
      search: params.search,
      sort: params.sort,
    },
  };
}

export function serializeWorkItem(row: WorkItemRow) {
  return {
    ...row,
    evidence: redactWorkItemEvidence(row.evidence || {}),
    explanation: buildWorkItemExplanation(row),
  };
}

export async function getWorkItemDetail(supabase: any, args: { workspace_id: string; work_item_id: string }) {
  const item = await supabaseSingle<WorkItemRow>(
    supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", args.workspace_id).eq("id", args.work_item_id).maybeSingle(),
    "Work Item detail lookup",
  );
  if (!item) {
    const error: any = new Error("Work Item not found.");
    error.status = 404;
    error.code = "work_item_not_found";
    throw error;
  }
  const activity = await supabaseRows<WorkItemActivityRow>(
    supabase.from("work_item_activity").select(WORK_ITEM_ACTIVITY_SELECT).eq("workspace_id", args.workspace_id).eq("work_item_id", args.work_item_id).order("created_at", { ascending: false }).limit(100),
    "Work Item activity lookup",
  );
  return { ok: true, workspace_id: args.workspace_id, work_item: serializeWorkItem(item), activity };
}

export async function getWorkItemsForPerson(supabase: any, args: { workspace_id: string; person_id: string; open_limit?: number; resolved_limit?: number }) {
  const [open, resolved] = await Promise.all([
    supabaseRows<WorkItemRow>(
      supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", args.workspace_id).eq("related_person_id", args.person_id).in("status", ["open", "acknowledged", "in_progress"]).order("updated_at", { ascending: false }).limit(args.open_limit || 10),
      "Customer Work Item open lookup",
    ),
    supabaseRows<WorkItemRow>(
      supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", args.workspace_id).eq("related_person_id", args.person_id).eq("status", "resolved").order("resolved_at", { ascending: false }).limit(args.resolved_limit || 5),
      "Customer Work Item resolved lookup",
    ),
  ]);
  return {
    open: open.map(serializeWorkItem),
    recent_resolved: resolved.map(serializeWorkItem),
  };
}

async function countQuery(query: any, label: string) {
  const { count, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return Number(count || 0);
}

export async function getWorkItemSummaryMetrics(supabase: any, workspaceId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [open, urgent, high, unassigned, resolvedToday] = await Promise.all([
    countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["open", "acknowledged", "in_progress"]), "Work Item open count"),
    countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("priority", "urgent").in("status", ["open", "acknowledged", "in_progress"]), "Work Item urgent count"),
    countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("priority", "high").in("status", ["open", "acknowledged", "in_progress"]), "Work Item high count"),
    countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("assigned_to", null).in("status", ["open", "acknowledged", "in_progress"]), "Work Item unassigned count"),
    countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "resolved").gte("resolved_at", today.toISOString()), "Work Item resolved today count"),
  ]);
  return { open, urgent, high, unassigned, resolved_today: resolvedToday };
}

export async function getOperationsSummary(supabase: any, args: { workspace_id: string }, options: { sync?: boolean } = {}) {
  if (options.sync !== false) await syncWorkspaceWorkItems(supabase, { workspace_id: args.workspace_id });
  const metrics = await getWorkItemSummaryMetrics(supabase, args.workspace_id);
  const categories: WorkItemCategory[] = ["identity", "attribution", "commissions", "refunds", "chargebacks", "integrations", "tracking", "system"];
  const queues = await Promise.all(categories.map(async (category) => {
    const [openCount, highCount, oldest] = await Promise.all([
      countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", args.workspace_id).eq("category", category).in("status", ["open", "acknowledged", "in_progress"]), `${category} open count`),
      countQuery(supabase.from("work_items").select("id", { count: "exact", head: true }).eq("workspace_id", args.workspace_id).eq("category", category).in("priority", ["urgent", "high"]).in("status", ["open", "acknowledged", "in_progress"]), `${category} high count`),
      supabaseSingle<WorkItemRow>(
        supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", args.workspace_id).eq("category", category).in("status", ["open", "acknowledged", "in_progress"]).order("first_detected_at", { ascending: true }).limit(1).maybeSingle(),
        `${category} oldest lookup`,
      ),
    ]);
    return {
      category,
      label: categoryLabel(category),
      open_count: openCount,
      high_priority_count: highCount,
      oldest_open_at: oldest?.first_detected_at || null,
      recent_change_at: oldest?.updated_at || null,
      deep_link: `/operations?category=${encodeURIComponent(category)}&status=open,acknowledged,in_progress`,
    };
  }));
  return {
    ok: true,
    workspace_id: args.workspace_id,
    engine_version: WORK_ITEM_ENGINE_VERSION,
    metrics,
    queues: queues.filter((queue) => queue.open_count > 0),
  };
}

export function categoryLabel(category: WorkItemCategory | string) {
  if (category === "identity") return "Identity Review";
  if (category === "attribution") return "Attribution Exceptions";
  if (category === "commissions") return "Commission Exceptions";
  if (category === "refunds") return "Refund Review";
  if (category === "chargebacks") return "Chargebacks";
  if (category === "integrations") return "Integration Failures";
  if (category === "tracking") return "Tracking Issues";
  return "System";
}

function workItemDomainEventType(context: WorkItemDomainEventContext) {
  if (context.action === "assign") return "work_item.assigned";
  if (context.action === "resolve" || context.current.status === "resolved") return "work_item.resolved";
  if (context.action === "reopen") return "work_item.reopened";
  return "work_item.updated";
}

function workItemRelatedEntities(item: WorkItemRow) {
  const entities: EntityReference[] = [];
  if (item.related_person_id) entities.push({ type: "customer", id: item.related_person_id, relationship: "related_customer" });
  if (item.related_journey_id) entities.push({ type: "journey", id: item.related_journey_id, relationship: "related_journey" });
  if (item.related_order_id) entities.push({ type: "order", id: item.related_order_id, relationship: "related_order" });
  if (item.related_conversion_id) entities.push({ type: "conversion", id: item.related_conversion_id, relationship: "related_conversion" });
  if (item.related_commission_id) entities.push({ type: "commission", id: item.related_commission_id, relationship: "related_commission" });
  if (item.related_connector_id) entities.push({ type: "connector", id: item.related_connector_id, relationship: "related_connector" });
  if (item.related_notification_id) entities.push({ type: "notification", id: item.related_notification_id, relationship: "related_notification" });
  if (item.related_health_finding_id) entities.push({ type: "health_finding", id: item.related_health_finding_id, relationship: "source_finding" });
  return entities;
}

export function buildWorkItemDomainEvent(context: WorkItemDomainEventContext): DomainEventInput {
  const current = context.current;
  return {
    workspaceId: context.workspace_id,
    type: workItemDomainEventType(context),
    version: 1,
    occurredAt: context.occurred_at,
    actor: {
      type: context.actor_id ? "user" : "system",
      id: context.actor_id || undefined,
    },
    subject: {
      type: "work_item",
      id: current.id,
      displayName: current.title,
    },
    relatedEntities: workItemRelatedEntities(current),
    source: {
      system: "work_items",
    },
    severity: current.status === "resolved" || current.status === "dismissed" ? "success" : current.severity === "critical" ? "critical" : current.severity === "warning" ? "warning" : "info",
    correlationId: current.related_order_id || current.related_person_id || current.related_journey_id || current.related_health_finding_id || current.source_key || current.id,
    deduplicationKey: `work_item:${current.id}:${context.activity_type}:${context.occurred_at}`,
    payload: {
      schema_version: 1,
      action: context.action,
      activity_type: context.activity_type,
      changed_fields: context.changed_fields,
      previous_status: context.previous.status,
      next_status: current.status,
      previous_priority: context.previous.priority,
      next_priority: current.priority,
      previous_assigned_to: context.previous.assigned_to || null,
      next_assigned_to: current.assigned_to || null,
      related_person_id: current.related_person_id || null,
      related_journey_id: current.related_journey_id || null,
      related_order_id: current.related_order_id || null,
      related_connector_id: current.related_connector_id || null,
      deep_link: current.deep_link || `/operations?work_item_id=${encodeURIComponent(current.id)}`,
    },
  };
}

async function publishWorkItemDomainEvent(args: {
  on_domain_event?: (event: DomainEventInput, context: WorkItemDomainEventContext) => Promise<void>;
  context: WorkItemDomainEventContext;
}) {
  if (!args.on_domain_event) return;
  const event = buildWorkItemDomainEvent(args.context);
  try {
    await args.on_domain_event(event, args.context);
  } catch (error: any) {
    console.error("[TraceKit] Work Item domain event publish failed", {
      workspace_id: args.context.workspace_id,
      work_item_id: args.context.current.id,
      activity_type: args.context.activity_type,
      message: error?.message || String(error),
    });
  }
}

async function loadWorkItemOrThrow(supabase: any, workspaceId: string, workItemId: string) {
  const row = await supabaseSingle<WorkItemRow>(
    supabase.from("work_items").select(WORK_ITEM_SELECT).eq("workspace_id", workspaceId).eq("id", workItemId).maybeSingle(),
    "Work Item lookup",
  );
  if (!row) {
    const error: any = new Error("Work Item not found.");
    error.status = 404;
    error.code = "work_item_not_found";
    throw error;
  }
  return row;
}

function invalidTransition(message: string) {
  const error: any = new Error(message);
  error.status = 409;
  error.code = "invalid_work_item_transition";
  return error;
}

async function updateWorkItem(supabase: any, workspaceId: string, workItemId: string, patch: Record<string, any>) {
  const { data, error } = await supabase
    .from("work_items")
    .update({ ...patch, updated_at: patch.updated_at || new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", workItemId)
    .select(WORK_ITEM_SELECT)
    .maybeSingle();
  if (error) throw new Error(`Work Item update failed: ${error.message || JSON.stringify(error)}`);
  return data as WorkItemRow;
}

export async function mutateWorkItem(supabase: any, args: {
  workspace_id: string;
  work_item_id: string;
  action: "acknowledge" | "start" | "assign" | "priority" | "resolve" | "dismiss" | "reopen" | "note";
  actor_id?: string | null;
  assigned_to?: string | null;
  priority?: WorkItemPriority | string | null;
  body?: string | null;
  resolution_code?: string | null;
  resolution_note?: string | null;
  on_domain_event?: (event: DomainEventInput, context: WorkItemDomainEventContext) => Promise<void>;
}) {
  const now = new Date().toISOString();
  const current = await loadWorkItemOrThrow(supabase, args.workspace_id, args.work_item_id);
  let patch: Record<string, any> = {};
  let activityType: string = args.action;
  let body = cleanText(args.body) || null;

  if (args.action === "note") {
    if (!body) {
      const error: any = new Error("Note body is required.");
      error.status = 400;
      error.code = "note_body_required";
      throw error;
    }
    await insertActivity(supabase, {
      workspace_id: args.workspace_id,
      work_item_id: args.work_item_id,
      activity_type: "note_added",
      actor_id: cleanText(args.actor_id) || null,
      body,
      metadata: {},
      created_at: now,
    });
    await publishWorkItemDomainEvent({
      on_domain_event: args.on_domain_event,
      context: {
        workspace_id: args.workspace_id,
        action: args.action,
        activity_type: "note_added",
        actor_id: cleanText(args.actor_id) || null,
        previous: current,
        current,
        changed_fields: ["activity"],
        occurred_at: now,
      },
    });
    return getWorkItemDetail(supabase, { workspace_id: args.workspace_id, work_item_id: args.work_item_id });
  }

  if (args.action === "acknowledge") {
    if (current.status !== "open") throw invalidTransition("Only open Work Items can be acknowledged.");
    patch = { status: "acknowledged", acknowledged_at: now };
    activityType = "acknowledged";
  } else if (args.action === "start") {
    if (!["open", "acknowledged"].includes(current.status)) throw invalidTransition("Only open or acknowledged Work Items can be started.");
    patch = { status: "in_progress" };
    activityType = "status_changed";
  } else if (args.action === "assign") {
    patch = { assigned_to: cleanText(args.assigned_to) || null };
    activityType = patch.assigned_to ? "assigned" : "unassigned";
    body = patch.assigned_to ? `Assigned to ${patch.assigned_to}.` : "Unassigned.";
  } else if (args.action === "priority") {
    const priority = cleanText(args.priority).toLowerCase() as WorkItemPriority;
    if (!WORK_ITEM_PRIORITIES.includes(priority)) {
      const error: any = new Error("Invalid priority.");
      error.status = 400;
      error.code = "invalid_priority";
      throw error;
    }
    patch = { priority };
    activityType = "priority_changed";
    body = `Priority changed from ${current.priority} to ${priority}.`;
  } else if (args.action === "resolve") {
    if (!["open", "acknowledged", "in_progress"].includes(current.status)) throw invalidTransition("Only active Work Items can be resolved.");
    const code = cleanText(args.resolution_code) || "fixed";
    patch = {
      status: "resolved",
      resolved_at: now,
      dismissed_at: null,
      resolution_code: code,
      resolution_note: cleanText(args.resolution_note) || null,
      resolved_by: cleanText(args.actor_id) || null,
      resolution: { code, note: cleanText(args.resolution_note) || null, resolved_by: cleanText(args.actor_id) || null, manual: true },
    };
    activityType = "resolved";
  } else if (args.action === "dismiss") {
    if (!["open", "acknowledged", "in_progress"].includes(current.status)) throw invalidTransition("Only active Work Items can be dismissed.");
    const note = cleanText(args.resolution_note || args.body);
    if (!note) {
      const error: any = new Error("Dismissal requires a resolution note.");
      error.status = 400;
      error.code = "dismiss_note_required";
      throw error;
    }
    patch = {
      status: "dismissed",
      dismissed_at: now,
      resolution_code: cleanText(args.resolution_code) || "not_actionable",
      resolution_note: note,
      resolved_by: cleanText(args.actor_id) || null,
      resolution: { code: cleanText(args.resolution_code) || "not_actionable", note, resolved_by: cleanText(args.actor_id) || null, manual: true },
    };
    activityType = "dismissed";
    body = note;
  } else if (args.action === "reopen") {
    if (!["resolved", "dismissed"].includes(current.status)) throw invalidTransition("Only resolved or dismissed Work Items can be reopened.");
    patch = {
      status: "open",
      resolved_at: null,
      dismissed_at: null,
      resolution_code: null,
      resolution_note: null,
      resolved_by: null,
      resolution: {},
      recurrence_count: Number(current.recurrence_count || 0) + 1,
    };
    activityType = "reopened";
  }

  const updated = await updateWorkItem(supabase, args.workspace_id, args.work_item_id, patch);
  const changedFields = Object.keys(patch).filter((key) => key !== "updated_at");
  await insertActivity(supabase, {
    workspace_id: args.workspace_id,
    work_item_id: args.work_item_id,
    activity_type: activityType,
    actor_id: cleanText(args.actor_id) || null,
    body,
    metadata: {
      previous_status: current.status,
      next_status: updated.status,
      previous_priority: current.priority,
      next_priority: updated.priority,
      previous_assigned_to: current.assigned_to || null,
      next_assigned_to: updated.assigned_to || null,
    },
    created_at: now,
  });
  await publishWorkItemDomainEvent({
    on_domain_event: args.on_domain_event,
    context: {
      workspace_id: args.workspace_id,
      action: args.action,
      activity_type: activityType,
      actor_id: cleanText(args.actor_id) || null,
      previous: current,
      current: updated,
      changed_fields: changedFields.length ? changedFields : ["activity"],
      occurred_at: now,
    },
  });
  return getWorkItemDetail(supabase, { workspace_id: args.workspace_id, work_item_id: args.work_item_id });
}

export function workItemsByHealthFinding(items: WorkItemRow[]) {
  const map = new Map<string, WorkItemRow>();
  for (const item of items) {
    const key = cleanText(item.related_health_finding_id);
    if (key) map.set(key, item);
  }
  return map;
}

export function enrichHealthReportWithWorkItems(health: HealthReport, items: WorkItemRow[]) {
  const byFinding = workItemsByHealthFinding(items);
  return {
    ...health,
    findings: health.findings.map((finding) => {
      const item = byFinding.get(finding.id);
      return item ? {
        ...finding,
        work_item_id: item.id,
        work_item_status: item.status,
        work_item_deep_link: `/operations?work_item_id=${encodeURIComponent(item.id)}`,
      } : finding;
    }),
    recommended_actions: health.recommended_actions.map((action) => {
      const item = byFinding.get(action.finding_id);
      return item ? {
        ...action,
        work_item_id: item.id,
        work_item_status: item.status,
        deep_link: `/operations?work_item_id=${encodeURIComponent(item.id)}`,
      } : action;
    }),
    notifications: health.notifications.map((notification) => {
      const item = byFinding.get(notification.finding_id);
      return item ? {
        ...notification,
        work_item_id: item.id,
        work_item_status: item.status,
        deep_link: `/operations?work_item_id=${encodeURIComponent(item.id)}`,
      } : notification;
    }),
  };
}

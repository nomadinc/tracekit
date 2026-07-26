import { cleanText } from "./identity-normalization.ts";

export const HEALTH_ENGINE_VERSION = "health_engine_v1";
export const HEALTH_ROUTE = "/v1/health";
export const HEALTH_CATEGORIES = [
  "tracking",
  "identity",
  "journeys",
  "attribution",
  "commissions",
  "integrations",
  "platform_processing",
] as const;

export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];
export type HealthSeverity = "critical" | "warning" | "info" | "healthy";
export type HealthFindingStatus = "open" | "resolved";
export type HealthLifecycleState =
  | "not_applicable"
  | "needs_configuration"
  | "initializing"
  | "healthy"
  | "degraded"
  | "failing"
  | "resolved";
export type WorkspaceMode = "development" | "test" | "production";

export const HEALTH_WINDOWS = {
  live_window_hours: 24,
  comparison_window_days: 7,
  runtime_active_error_minutes: 60,
  stale_task_minutes: 30,
  new_workspace_grace_days: 7,
  minimum_purchase_sample: 20,
  minimum_event_sample: 100,
} as const;

export type HealthFinding = {
  id: string;
  category: HealthCategory;
  lifecycle_state: HealthLifecycleState;
  severity: HealthSeverity;
  status: HealthFindingStatus;
  title: string;
  summary: string;
  why_it_matters: string;
  evidence: Record<string, any>;
  recommended_action: string;
  metric_value: string;
  threshold: string;
  applicability_reason: string;
  evaluation_context: Record<string, any>;
  detected_at: string;
  updated_at: string;
};

export type HealthTimelinePoint = {
  label: "Today" | "Yesterday" | "7 Days" | "30 Days";
  new_issues: number;
  resolved_issues: number;
  persistent_issues: number;
};

export type HealthNotification = {
  id: string;
  finding_id: string;
  unread: boolean;
  lifecycle_state: HealthLifecycleState;
  severity: HealthSeverity;
  timestamp: string;
  deep_link: string;
  resolved: boolean;
  title: string;
  summary: string;
  category: HealthCategory;
};

export type HealthReport = {
  ok: true;
  workspace_id: string;
  generated_at: string;
  engine_version: string;
  overall: {
    score: number;
    status: "Healthy" | "Needs Attention" | "Critical";
    applicable_checks: number;
    excluded_checks: number;
    initializing_checks: number;
    failing_checks: number;
  };
  counts: Record<HealthSeverity | HealthLifecycleState | "open" | "resolved", number>;
  categories: Record<HealthCategory, {
    score: number;
    status: "Healthy" | "Needs Attention" | "Critical";
    open: number;
    critical: number;
    warning: number;
    healthy: number;
    applicable_checks: number;
    excluded_checks: number;
    initializing_checks: number;
    failing_checks: number;
  }>;
  findings: HealthFinding[];
  recommended_actions: Array<{
    finding_id: string;
    severity: HealthSeverity;
    category: HealthCategory;
    issue: string;
    why_it_matters: string;
    how_to_fix: string;
    deep_link: string;
  }>;
  notifications: HealthNotification[];
  timeline: HealthTimelinePoint[];
  source_tables: string[];
};

export type HealthRouteMatch =
  | { kind: "health_report" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type HealthQueryParams = {
  workspace_id: string;
};

export type IntegrationHealthRow = {
  platform: string;
  last_success_at: string | null;
  last_error: string | null;
  auto_import_enabled: boolean | null;
  credential_configured: boolean;
  source: "browser_event_sources" | "integrations_credentials" | "integrations_settings";
};

export type HealthSnapshot = {
  workspace_id: string;
  generated_at: string;
  workspace?: {
    mode: WorkspaceMode;
    created_at: string | null;
    setup_completed_at: string | null;
    completed_steps: string[];
  };
  tracking: {
    write_key_configured: boolean;
    allowed_origins_count: number;
    config_updated_at?: string | null;
    latest_received_at: string | null;
    latest_normalized_at: string | null;
    pending_count: number;
    review_count: number;
    failed_count: number;
    today_count: number;
    yesterday_count: number;
  };
  identity: {
    active_people_count: number;
    platform_orders_total: number;
    linked_platform_orders: number;
    unlinked_platform_orders: number;
    review_count: number;
    merge_events_30d: number;
    browser_anonymous_count: number;
  };
  journeys: {
    journeys_total: number;
    active_journeys: number;
    completed_journeys: number;
    journey_events_total: number;
    orphaned_journey_events: number;
    stale_orphaned_journey_events: number;
    average_events_per_journey: number | null;
  };
  attribution: {
    active_model: string | null;
    purchase_events: number;
    recent_purchase_events?: number;
    attribution_credit_sample_size: number;
    attributed_conversions: number;
    unattributed_conversions: number;
    recent_attributed_conversions?: number;
    recent_unattributed_conversions?: number;
    eligible_touchpoints: number;
    unknown_affiliate_events: number;
  };
  commissions: {
    draft_count: number;
    pending_count: number;
    approved_count: number;
    paid_count: number;
    held_count: number;
    voided_count: number;
    duplicate_conversion_count: number;
    default_commission_rate: number | null;
    policy_status?: string | null;
    policy_metadata?: Record<string, any> | null;
    non_zero_commission_rate_count?: number;
  };
  integrations: IntegrationHealthRow[];
  platform_processing: {
    active_jobs: number;
    queued_tasks: number;
    failed_tasks: number;
    jobs?: Array<{
      id: string;
      connector_id: string | null;
      job_type: string | null;
      status: string | null;
      phase: string | null;
      records_discovered?: number | null;
      records_processed?: number | null;
      records_succeeded?: number | null;
      records_failed?: number | null;
      records_skipped?: number | null;
      created_at: string | null;
      updated_at: string | null;
      completed_at: string | null;
      last_error: string | null;
      progress: Record<string, any> | null;
    }>;
    tasks?: Array<{
      id: string;
      job_id?: string | null;
      connector_id: string | null;
      task_type: string | null;
      status: string | null;
      max_attempts?: number | null;
      created_at: string | null;
      updated_at: string | null;
      locked_at: string | null;
      completed_at: string | null;
      last_error: string | null;
      attempt_count: number | null;
    }>;
    recent_errors: Array<{
      id?: string | null;
      job_id?: string | null;
      task_id?: string | null;
      connector_id: string | null;
      error_class: string | null;
      classification: string | null;
      created_at: string | null;
    }>;
  };
  diagnostics: {
    section_errors: Array<{ section: string; message: string }>;
  };
};

type CountQuery = PromiseLike<{ count: number | null; error?: any }>;
type DataQuery<T = any> = PromiseLike<{ data: T | null; error?: any }>;

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function iso(date: Date) {
  return date.toISOString();
}

function countValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function metric(value: unknown, suffix = "") {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number" && Number.isFinite(value)) return `${value.toLocaleString("en-US")}${suffix}`;
  return `${value}${suffix}`;
}

function parseTime(value: string | null | undefined) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function ageDays(at: string, createdAt: string | null | undefined) {
  const nowMs = parseTime(at);
  const createdMs = parseTime(createdAt);
  if (nowMs === null || createdMs === null) return null;
  return Math.max(0, Math.floor((nowMs - createdMs) / 86400000));
}

function normalizeWorkspaceMode(value: unknown): WorkspaceMode {
  const mode = cleanText(value).toLowerCase();
  // Existing workspaces may not have mode metadata yet; treat them as development until explicitly configured.
  return mode === "production" || mode === "test" || mode === "development" ? mode : "development";
}

function lifecycleSeverity(lifecycle: HealthLifecycleState, fallback?: HealthSeverity): HealthSeverity {
  if (fallback) return fallback;
  if (lifecycle === "failing") return "critical";
  if (lifecycle === "degraded") return "warning";
  if (lifecycle === "healthy") return "healthy";
  if (lifecycle === "resolved") return "healthy";
  return "info";
}

function lifecycleStatus(lifecycle: HealthLifecycleState): HealthFindingStatus {
  if (lifecycle === "healthy" || lifecycle === "resolved" || lifecycle === "not_applicable") return "resolved";
  return "open";
}

function lifecycleFromSeverity(severity: HealthSeverity): HealthLifecycleState {
  if (severity === "critical") return "failing";
  if (severity === "warning") return "degraded";
  if (severity === "healthy") return "healthy";
  return "initializing";
}

function lifecyclePenalty(lifecycle: HealthLifecycleState) {
  if (lifecycle === "failing") return 20;
  if (lifecycle === "degraded") return 8;
  if (lifecycle === "needs_configuration") return 3;
  if (lifecycle === "initializing") return 1;
  return 0;
}

function healthStatusFromLifecycle(rows: HealthFinding[]): "Healthy" | "Needs Attention" | "Critical" {
  if (rows.some((finding) => finding.lifecycle_state === "failing")) return "Critical";
  if (rows.some((finding) => finding.lifecycle_state === "degraded" || finding.lifecycle_state === "needs_configuration")) return "Needs Attention";
  return "Healthy";
}

function makeFinding(args: Omit<HealthFinding, "status" | "detected_at" | "updated_at" | "lifecycle_state" | "why_it_matters" | "applicability_reason" | "evaluation_context"> & {
  at: string;
  lifecycle_state?: HealthLifecycleState;
  why_it_matters?: string;
  applicability_reason?: string;
  evaluation_context?: Record<string, any>;
}) {
  const lifecycleState = args.lifecycle_state || lifecycleFromSeverity(args.severity);
  const severity = lifecycleSeverity(lifecycleState, args.severity);
  return {
    ...args,
    lifecycle_state: lifecycleState,
    severity,
    status: lifecycleStatus(lifecycleState),
    why_it_matters: args.why_it_matters || args.summary,
    applicability_reason: args.applicability_reason || "Evaluated from workspace-scoped operational data.",
    evaluation_context: args.evaluation_context || {},
    detected_at: args.at,
    updated_at: args.at,
  };
}

export function matchHealthRoute(method: string, path: string): HealthRouteMatch | null {
  if (/^\/v1\/health\/?$/.test(path)) {
    if (cleanText(method).toUpperCase() === "GET") return { kind: "health_report" };
    return { kind: "method_not_allowed", path: HEALTH_ROUTE, allowed_methods: ["GET"] };
  }
  return null;
}

export function normalizeHealthParams(args: Record<string, unknown>): HealthQueryParams {
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
  };
}

const ACTIVE_JOB_STATUSES = new Set(["queued", "preparing", "running", "retrying", "importing", "reconciling", "finalizing"]);
const COMPLETED_JOB_STATUSES = new Set(["completed", "completed_with_errors"]);
const TERMINAL_FAILED_JOB_STATUSES = new Set(["failed", "cancelled"]);

function latestByUpdatedAt<T extends { updated_at?: string | null; created_at?: string | null; completed_at?: string | null }>(rows: T[]) {
  return rows.slice().sort((a, b) => {
    const bMs = parseTime(b.updated_at || b.completed_at || b.created_at) || 0;
    const aMs = parseTime(a.updated_at || a.completed_at || a.created_at) || 0;
    return bMs - aMs;
  })[0] || null;
}

function connectorMatches(value: string | null | undefined, candidates: string[]) {
  const normalized = cleanText(value);
  return Boolean(normalized && candidates.includes(normalized));
}

function backfillStatus(snapshot: HealthSnapshot, connectorIds: string[], jobTypes: string[]) {
  const jobs = (snapshot.platform_processing.jobs || []).filter((job) =>
    connectorMatches(job.connector_id, connectorIds) || connectorMatches(job.job_type, jobTypes),
  );
  const active = latestByUpdatedAt(jobs.filter((job) => ACTIVE_JOB_STATUSES.has(cleanText(job.status))));
  if (active) return { state: "running" as const, job: active, jobs };
  const completed = latestByUpdatedAt(jobs.filter((job) => COMPLETED_JOB_STATUSES.has(cleanText(job.status))));
  const failed = latestByUpdatedAt(jobs.filter((job) => TERMINAL_FAILED_JOB_STATUSES.has(cleanText(job.status))));
  if (completed && failed) {
    const completedMs = parseTime(completed.updated_at || completed.completed_at || completed.created_at) || 0;
    const failedMs = parseTime(failed.updated_at || failed.completed_at || failed.created_at) || 0;
    return completedMs >= failedMs ? { state: "completed" as const, job: completed, jobs } : { state: "failed" as const, job: failed, jobs };
  }
  if (completed) return { state: "completed" as const, job: completed, jobs };
  if (failed) return { state: "failed" as const, job: failed, jobs };
  return { state: "never_started" as const, job: null, jobs };
}

function recentRows<T extends { created_at?: string | null; updated_at?: string | null }>(rows: T[], at: string, minutes: number) {
  const nowMs = parseTime(at) || Date.now();
  const since = nowMs - minutes * 60000;
  return rows.filter((row) => {
    const ms = parseTime(row.created_at || row.updated_at);
    return ms !== null && ms >= since;
  });
}

function staleQueuedTasks(snapshot: HealthSnapshot, at: string) {
  const nowMs = parseTime(at) || Date.now();
  const staleMs = HEALTH_WINDOWS.stale_task_minutes * 60000;
  return (snapshot.platform_processing.tasks || []).filter((task) => {
    if (cleanText(task.status) !== "queued") return false;
    const updatedMs = parseTime(task.updated_at || task.created_at);
    return updatedMs !== null && nowMs - updatedMs > staleMs;
  });
}

function latestCompletedJobAfter(snapshot: HealthSnapshot, timestamp: string | null | undefined) {
  const targetMs = parseTime(timestamp);
  if (targetMs === null) return null;
  return latestByUpdatedAt((snapshot.platform_processing.jobs || []).filter((job) => {
    if (!COMPLETED_JOB_STATUSES.has(cleanText(job.status))) return false;
    const jobMs = parseTime(job.completed_at || job.updated_at || job.created_at);
    return jobMs !== null && jobMs > targetMs;
  }));
}

function hasConfiguredCommissionOverrides(commissions: HealthSnapshot["commissions"]) {
  const metadata = commissions.policy_metadata || {};
  const candidates = [
    metadata.affiliate_overrides,
    metadata.commission_overrides,
    metadata.rate_overrides,
    metadata.partner_rates,
  ];
  return Boolean(commissions.non_zero_commission_rate_count)
    || candidates.some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value && typeof value === "object" && Object.keys(value).length > 0;
    });
}

function commissionsIntentionallyDisabled(commissions: HealthSnapshot["commissions"]) {
  const metadata = commissions.policy_metadata || {};
  return metadata.commissions_enabled === false
    || metadata.payouts_enabled === false
    || metadata.disabled === true
    || cleanText(commissions.policy_status) === "disabled";
}

function jobRuntimeMetadata(job: HealthSnapshot["platform_processing"]["jobs"][number] | null | undefined) {
  const progress = job?.progress && typeof job.progress === "object" ? job.progress : {};
  const metadata = progress.metadata && typeof progress.metadata === "object" ? progress.metadata : {};
  return { progress, metadata };
}

function taskCountsForBackfillJob(snapshot: HealthSnapshot, job: HealthSnapshot["platform_processing"]["jobs"][number] | null | undefined, connectorIds: string[]) {
  const jobId = cleanText(job?.id);
  const tasks = (snapshot.platform_processing.tasks || []).filter((task) => {
    if (jobId && cleanText(task.job_id) === jobId) return true;
    return connectorMatches(task.connector_id, connectorIds);
  });
  const counts = {
    total: tasks.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    recoverable_failed: 0,
  };
  for (const task of tasks) {
    const status = cleanText(task.status);
    if (status === "queued") counts.queued += 1;
    else if (status === "running") counts.running += 1;
    else if (status === "completed") counts.completed += 1;
    else if (status === "failed") {
      counts.failed += 1;
      const attempts = Math.max(0, Number(task.attempt_count || 0));
      const maxAttempts = Math.max(0, Number(task.max_attempts || 0));
      if (!maxAttempts || attempts < maxAttempts) counts.recoverable_failed += 1;
    } else if (status === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

function identityBackfillCompletionState(args: {
  backfill_state: string;
  task_counts: ReturnType<typeof taskCountsForBackfillJob>;
  job_status: string | null | undefined;
  runtime_error_count: number;
}) {
  const jobStatus = cleanText(args.job_status);
  const activeTasks = args.task_counts.queued + args.task_counts.running + args.task_counts.recoverable_failed;
  if (args.backfill_state === "never_started") return "never_started";
  if (args.backfill_state === "running") return "running";
  if (COMPLETED_JOB_STATUSES.has(jobStatus) && activeTasks > 0) return "completed_with_incomplete_tasks";
  if (COMPLETED_JOB_STATUSES.has(jobStatus) && (args.task_counts.failed > 0 || args.runtime_error_count > 0)) return "completed_with_errors";
  if (args.backfill_state === "completed") return "completed";
  if (args.backfill_state === "failed") return "failed";
  return args.backfill_state || "unknown";
}

export function identityHealthMetrics(snapshot: HealthSnapshot) {
  const identityBackfill = backfillStatus(snapshot, ["identity-backfill-platform-orders"], ["identity_backfill"]);
  const { progress, metadata } = jobRuntimeMetadata(identityBackfill.job);
  const taskCounts = taskCountsForBackfillJob(snapshot, identityBackfill.job, ["identity-backfill-platform-orders"]);
  const totalOrders = countValue(snapshot.identity.platform_orders_total);
  const scopedOrders = countValue(metadata.total_in_scope) || countValue(progress.records_discovered) || totalOrders;
  const skippedNoIdentifiers = Math.min(scopedOrders, countValue(metadata.no_identifier_count) || countValue(metadata.skipped_no_identifiers));
  const linkedInScope = Math.min(scopedOrders, countValue(metadata.linked_person_id) || countValue(progress.records_succeeded) || countValue(snapshot.identity.linked_platform_orders));
  const eligibleOrders = Math.max(0, scopedOrders - skippedNoIdentifiers);
  const linkedEligibleOrders = Math.min(eligibleOrders, linkedInScope);
  const unlinkedEligibleOrders = Math.max(0, eligibleOrders - linkedEligibleOrders);
  const ineligibleOrders = Math.max(0, totalOrders - eligibleOrders);
  const runtimeErrorCount = countValue(metadata.runtime_error_count)
    + countValue(metadata.permanent_errors)
    + countValue(metadata.attachment_conflicts)
    + countValue(progress.records_failed);
  const completionState = identityBackfillCompletionState({
    backfill_state: identityBackfill.state,
    task_counts: taskCounts,
    job_status: identityBackfill.job?.status,
    runtime_error_count: runtimeErrorCount,
  });
  return {
    backfill: identityBackfill,
    total_orders: totalOrders,
    backfill_scope_orders: scopedOrders,
    eligible_orders: eligibleOrders,
    linked_eligible_orders: linkedEligibleOrders,
    unlinked_eligible_orders: unlinkedEligibleOrders,
    ineligible_orders: ineligibleOrders,
    skipped_no_identifiers: skippedNoIdentifiers,
    eligible_resolution_rate: percent(linkedEligibleOrders, eligibleOrders),
    overall_linkage_rate: percent(snapshot.identity.linked_platform_orders, totalOrders),
    task_counts: taskCounts,
    completion_state: completionState,
    runtime_error_count: runtimeErrorCount,
    review_required_count: countValue(metadata.review_required_count) || countValue(metadata.review_required),
  };
}

async function safeCount(query: CountQuery, section: string, errors: Array<{ section: string; message: string }>) {
  const result = await query;
  if (result.error) {
    errors.push({ section, message: result.error?.message || String(result.error) });
    return 0;
  }
  return countValue(result.count);
}

async function safeData<T>(query: DataQuery<T>, section: string, errors: Array<{ section: string; message: string }>) {
  const result = await query;
  if (result.error) {
    errors.push({ section, message: result.error?.message || String(result.error) });
    return null;
  }
  return result.data as T | null;
}

export async function loadWorkspaceHealthSnapshot(supabase: any, params: HealthQueryParams, now = new Date()): Promise<HealthSnapshot> {
  const workspaceId = params.workspace_id;
  const generatedAt = now.toISOString();
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const sevenDaysAgo = addDays(today, -7);
  const thirtyDaysAgo = addDays(today, -30);
  const liveWindowStart = new Date(now.getTime() - HEALTH_WINDOWS.live_window_hours * 3600000);
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const errors: Array<{ section: string; message: string }> = [];

  const onboarding = await safeData<any>(
    supabase.from("workspace_onboarding").select("workspace_id,completed_steps,completed_at,metadata,created_at,updated_at").eq("workspace_id", workspaceId).maybeSingle(),
    "workspace_onboarding",
    errors,
  );
  const onboardingMetadata = onboarding?.metadata && typeof onboarding.metadata === "object" ? onboarding.metadata : {};
  const workspaceMode = normalizeWorkspaceMode(
    onboardingMetadata.workspace_mode
      || onboardingMetadata.workspaceMode
      || onboardingMetadata.environment
      || onboardingMetadata.mode,
  );

  const browserConfig = await safeData<any>(
    supabase.from("browser_event_sources").select("workspace_id,public_write_key_hash,allowed_origins,is_active,updated_at").eq("workspace_id", workspaceId).maybeSingle(),
    "browser_event_sources",
    errors,
  );

  const latestReceived = await safeData<any>(
    supabase.from("browser_events_raw").select("event_id,received_at,normalization_status,normalized_event_type,source").eq("workspace_id", workspaceId).order("received_at", { ascending: false }).limit(1).maybeSingle(),
    "browser_events_raw.latest_received",
    errors,
  );
  const latestNormalized = await safeData<any>(
    supabase.from("browser_events_raw").select("event_id,normalized_at,normalization_status,normalized_event_type,source").eq("workspace_id", workspaceId).eq("normalization_status", "normalized").order("normalized_at", { ascending: false }).limit(1).maybeSingle(),
    "browser_events_raw.latest_normalized",
    errors,
  );

  const [
    pendingBrowser,
    reviewBrowser,
    failedBrowser,
    todayBrowser,
    yesterdayBrowser,
    activePeople,
    platformOrdersTotal,
    linkedPlatformOrders,
    unlinkedPlatformOrders,
    identityReviews,
    mergeEvents30d,
    anonymousBrowser,
    journeysTotal,
    activeJourneys,
    completedJourneys,
    journeyEventsTotal,
    orphanedJourneyEvents,
    staleOrphanedJourneyEvents,
    purchaseEvents,
    recentPurchaseEvents,
    eligibleTouchpoints,
    unknownAffiliateEvents,
    draftCommissions,
    pendingCommissions,
    approvedCommissions,
    paidCommissions,
    heldCommissions,
    voidedCommissions,
    activeJobs,
    queuedTasks,
    failedTasks,
  ] = await Promise.all([
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("normalization_status", "pending"), "browser_events_raw.pending", errors),
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("normalization_status", ["review"]), "browser_events_raw.review", errors),
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("normalization_status", ["error", "invalid"]), "browser_events_raw.failed", errors),
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("received_at", iso(today)).lt("received_at", iso(tomorrow)), "browser_events_raw.today", errors),
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("received_at", iso(yesterday)).lt("received_at", iso(today)), "browser_events_raw.yesterday", errors),
    safeCount(supabase.from("people").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"), "people.active", errors),
    safeCount(supabase.from("platform_orders").select("platform_order_id", { count: "exact", head: true }).eq("workspace_id", workspaceId), "platform_orders.total", errors),
    safeCount(supabase.from("platform_orders").select("platform_order_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).not("person_id", "is", null), "platform_orders.linked", errors),
    safeCount(supabase.from("platform_orders").select("platform_order_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("person_id", null), "platform_orders.unlinked", errors),
    safeCount(supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("resolution_action", ["conflict_detected", "review_required"]), "identity_resolution_events.review", errors),
    safeCount(supabase.from("identity_resolution_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("resolution_action", ["manually_merged", "merge_reversed"]).gte("created_at", iso(thirtyDaysAgo)), "identity_resolution_events.merges", errors),
    safeCount(supabase.from("browser_events_raw").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("person_id", null).gte("received_at", iso(sevenDaysAgo)), "browser_events_raw.anonymous", errors),
    safeCount(supabase.from("journeys").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId), "journeys.total", errors),
    safeCount(supabase.from("journeys").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"), "journeys.active", errors),
    safeCount(supabase.from("journeys").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "completed"), "journeys.completed", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId), "journey_events.total", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("journey_id", null), "journey_events.orphaned", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("journey_id", null).lt("created_at", iso(fifteenMinutesAgo)), "journey_events.stale_orphaned", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_type", "purchase"), "journey_events.purchases", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_type", "purchase").gte("event_time", iso(liveWindowStart)), "journey_events.recent_purchases", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).not("affiliate_id", "is", null), "journey_events.touchpoints", errors),
    safeCount(supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("affiliate_id", ["unknown", "undefined", "null"]), "journey_events.unknown_affiliates", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "draft"), "affiliate_commissions.draft", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "pending"), "affiliate_commissions.pending", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "approved"), "affiliate_commissions.approved", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "paid"), "affiliate_commissions.paid", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "held"), "affiliate_commissions.held", errors),
    safeCount(supabase.from("affiliate_commissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "voided"), "affiliate_commissions.voided", errors),
    safeCount(supabase.from("integration_import_jobs").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["queued", "running", "retrying", "paused"]), "integration_import_jobs.active", errors),
    safeCount(supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "queued"), "connector_import_tasks.queued", errors),
    safeCount(supabase.from("connector_import_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "failed"), "connector_import_tasks.failed", errors),
  ]);

  const policy = await safeData<any>(
    supabase.from("workspace_attribution_policy").select("id,workspace_id,active_model,model_version,default_commission_rate,status,metadata,updated_at").eq("workspace_id", workspaceId).maybeSingle(),
    "workspace_attribution_policy",
    errors,
  );

  const activeModel = cleanText(policy?.active_model) || null;
  const sampleModel = activeModel || "first_touch";
  const creditRows = await safeData<any[]>(
    supabase.from("journey_attribution_credits").select("conversion_event_id,status,model,affiliate_id,calculated_at,conversion_event_time").eq("workspace_id", workspaceId).eq("model", sampleModel).order("conversion_event_time", { ascending: false }).limit(1000),
    "journey_attribution_credits.sample",
    errors,
  ) || [];
  const recentCreditRows = creditRows.filter((row: any) => {
    const ms = parseTime(cleanText(row.conversion_event_time));
    return ms !== null && ms >= liveWindowStart.getTime();
  });
  const attributedConversions = new Set(creditRows.filter((row: any) => cleanText(row.status) === "attributed").map((row: any) => cleanText(row.conversion_event_id)).filter(Boolean)).size;
  const unattributedConversions = new Set(creditRows.filter((row: any) => cleanText(row.status) === "unattributed").map((row: any) => cleanText(row.conversion_event_id)).filter(Boolean)).size;
  const recentAttributedConversions = new Set(recentCreditRows.filter((row: any) => cleanText(row.status) === "attributed").map((row: any) => cleanText(row.conversion_event_id)).filter(Boolean)).size;
  const recentUnattributedConversions = new Set(recentCreditRows.filter((row: any) => cleanText(row.status) === "unattributed").map((row: any) => cleanText(row.conversion_event_id)).filter(Boolean)).size;

  const journeySamples = await safeData<any[]>(
    supabase.from("journeys").select("event_count").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(500),
    "journeys.event_count_sample",
    errors,
  ) || [];
  const averageEventsPerJourney = journeySamples.length
    ? Math.round((journeySamples.reduce((sum: number, row: any) => sum + countValue(row.event_count), 0) / journeySamples.length) * 10) / 10
    : null;

  const commissionSample = await safeData<any[]>(
    supabase.from("affiliate_commissions").select("conversion_event_id,status,commission_rate,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000),
    "affiliate_commissions.duplicate_sample",
    errors,
  ) || [];
  const conversionCounts = new Map<string, number>();
  for (const row of commissionSample) {
    const id = cleanText(row.conversion_event_id);
    if (id) conversionCounts.set(id, (conversionCounts.get(id) || 0) + 1);
  }
  const duplicateConversionCount = Array.from(conversionCounts.values()).filter((count) => count > 1).length;
  const nonZeroCommissionRateCount = commissionSample.filter((row: any) => Number(row.commission_rate || 0) > 0).length;

  const credentials = await safeData<any[]>(
    supabase.from("integrations_credentials").select("platform,updated_at,metadata").order("updated_at", { ascending: false }).limit(100),
    "integrations_credentials",
    errors,
  ) || [];
  const settings = await safeData<any[]>(
    supabase.from("integrations_settings").select("platform,last_success_at,last_error,auto_import_enabled,updated_at").order("updated_at", { ascending: false }).limit(100),
    "integrations_settings",
    errors,
  ) || [];
  const integrations = new Map<string, IntegrationHealthRow>();
  if (browserConfig) {
    integrations.set("browser_sdk", {
      platform: "browser_sdk",
      last_success_at: latestReceived?.received_at || null,
      last_error: null,
      auto_import_enabled: null,
      credential_configured: Boolean(browserConfig.public_write_key_hash),
      source: "browser_event_sources",
    });
  }
  for (const row of credentials) {
    const platform = cleanText(row.platform);
    if (!platform) continue;
    integrations.set(platform, {
      platform,
      last_success_at: null,
      last_error: null,
      auto_import_enabled: null,
      credential_configured: true,
      source: "integrations_credentials",
    });
  }
  for (const row of settings) {
    const platform = cleanText(row.platform);
    if (!platform) continue;
    const existing = integrations.get(platform);
    integrations.set(platform, {
      platform,
      last_success_at: cleanText(row.last_success_at) || existing?.last_success_at || null,
      last_error: cleanText(row.last_error) || null,
      auto_import_enabled: row.auto_import_enabled === null || row.auto_import_enabled === undefined ? existing?.auto_import_enabled ?? null : Boolean(row.auto_import_enabled),
      credential_configured: existing?.credential_configured || false,
      source: existing?.source || "integrations_settings",
    });
  }

  const runtimeJobs = await safeData<any[]>(
    supabase
      .from("integration_import_jobs")
      .select("id,connector_id,job_type,status,phase,records_discovered,records_processed,records_succeeded,records_failed,records_skipped,created_at,updated_at,completed_at,last_error,progress")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(50),
    "integration_import_jobs.recent",
    errors,
  ) || [];

  const runtimeTasks = await safeData<any[]>(
    supabase
      .from("connector_import_tasks")
      .select("id,job_id,connector_id,task_type,status,max_attempts,created_at,updated_at,locked_at,completed_at,last_error,attempt_count")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(100),
    "connector_import_tasks.recent",
    errors,
  ) || [];

  const runtimeJobIds = Array.from(new Set(runtimeJobs.map((row: any) => cleanText(row.id)).filter(Boolean))).slice(0, 50);
  const runtimeTaskIds = Array.from(new Set(runtimeTasks.map((row: any) => cleanText(row.id)).filter(Boolean))).slice(0, 100);
  const recentErrorsByJob = runtimeJobIds.length
    ? await safeData<any[]>(
      supabase
        .from("integration_import_errors")
        .select("id,job_id,task_id,connector_id,error_class,classification,created_at")
        .in("job_id", runtimeJobIds)
        .order("created_at", { ascending: false })
        .limit(25),
      "integration_import_errors.recent_by_job",
      errors,
    ) || []
    : [];
  const recentErrorsByTask = runtimeTaskIds.length
    ? await safeData<any[]>(
      supabase
        .from("integration_import_errors")
        .select("id,job_id,task_id,connector_id,error_class,classification,created_at")
        .in("task_id", runtimeTaskIds)
        .order("created_at", { ascending: false })
        .limit(25),
      "integration_import_errors.recent_by_task",
      errors,
    ) || []
    : [];
  const recentErrorMap = new Map<string, any>();
  for (const row of [...recentErrorsByJob, ...recentErrorsByTask]) {
    const key = cleanText(row.id) || `${cleanText(row.job_id)}:${cleanText(row.task_id)}:${cleanText(row.error_class)}:${cleanText(row.created_at)}`;
    if (key) recentErrorMap.set(key, row);
  }
  const recentErrors = Array.from(recentErrorMap.values())
    .sort((a: any, b: any) => (parseTime(cleanText(b.created_at)) || 0) - (parseTime(cleanText(a.created_at)) || 0))
    .slice(0, 25);

  return {
    workspace_id: workspaceId,
    generated_at: generatedAt,
    workspace: {
      mode: workspaceMode,
      created_at: cleanText(onboarding?.created_at) || null,
      setup_completed_at: cleanText(onboarding?.completed_at) || null,
      completed_steps: Array.isArray(onboarding?.completed_steps) ? onboarding.completed_steps.map((step: any) => cleanText(step)).filter(Boolean) : [],
    },
    tracking: {
      write_key_configured: Boolean(browserConfig?.public_write_key_hash),
      allowed_origins_count: Array.isArray(browserConfig?.allowed_origins) ? browserConfig.allowed_origins.length : 0,
      config_updated_at: cleanText(browserConfig?.updated_at) || null,
      latest_received_at: latestReceived?.received_at || null,
      latest_normalized_at: latestNormalized?.normalized_at || null,
      pending_count: pendingBrowser,
      review_count: reviewBrowser,
      failed_count: failedBrowser,
      today_count: todayBrowser,
      yesterday_count: yesterdayBrowser,
    },
    identity: {
      active_people_count: activePeople,
      platform_orders_total: platformOrdersTotal,
      linked_platform_orders: linkedPlatformOrders,
      unlinked_platform_orders: unlinkedPlatformOrders,
      review_count: identityReviews,
      merge_events_30d: mergeEvents30d,
      browser_anonymous_count: anonymousBrowser,
    },
    journeys: {
      journeys_total: journeysTotal,
      active_journeys: activeJourneys,
      completed_journeys: completedJourneys,
      journey_events_total: journeyEventsTotal,
      orphaned_journey_events: orphanedJourneyEvents,
      stale_orphaned_journey_events: staleOrphanedJourneyEvents,
      average_events_per_journey: averageEventsPerJourney,
    },
    attribution: {
      active_model: activeModel,
      purchase_events: purchaseEvents,
      recent_purchase_events: recentPurchaseEvents,
      attribution_credit_sample_size: creditRows.length,
      attributed_conversions: attributedConversions,
      unattributed_conversions: unattributedConversions,
      recent_attributed_conversions: recentAttributedConversions,
      recent_unattributed_conversions: recentUnattributedConversions,
      eligible_touchpoints: eligibleTouchpoints,
      unknown_affiliate_events: unknownAffiliateEvents,
    },
    commissions: {
      draft_count: draftCommissions,
      pending_count: pendingCommissions,
      approved_count: approvedCommissions,
      paid_count: paidCommissions,
      held_count: heldCommissions,
      voided_count: voidedCommissions,
      duplicate_conversion_count: duplicateConversionCount,
      default_commission_rate: policy ? Number(policy.default_commission_rate || 0) : null,
      policy_status: cleanText(policy?.status) || null,
      policy_metadata: policy?.metadata && typeof policy.metadata === "object" ? policy.metadata : null,
      non_zero_commission_rate_count: nonZeroCommissionRateCount,
    },
    integrations: Array.from(integrations.values()).sort((a, b) => a.platform.localeCompare(b.platform)),
    platform_processing: {
      active_jobs: activeJobs,
      queued_tasks: queuedTasks,
      failed_tasks: failedTasks,
      jobs: runtimeJobs.map((row: any) => ({
        id: cleanText(row.id),
        connector_id: cleanText(row.connector_id) || null,
        job_type: cleanText(row.job_type) || null,
        status: cleanText(row.status) || null,
        phase: cleanText(row.phase) || null,
        records_discovered: row.records_discovered === null || row.records_discovered === undefined ? null : Number(row.records_discovered),
        records_processed: row.records_processed === null || row.records_processed === undefined ? null : Number(row.records_processed),
        records_succeeded: row.records_succeeded === null || row.records_succeeded === undefined ? null : Number(row.records_succeeded),
        records_failed: row.records_failed === null || row.records_failed === undefined ? null : Number(row.records_failed),
        records_skipped: row.records_skipped === null || row.records_skipped === undefined ? null : Number(row.records_skipped),
        created_at: cleanText(row.created_at) || null,
        updated_at: cleanText(row.updated_at) || null,
        completed_at: cleanText(row.completed_at) || null,
        last_error: cleanText(row.last_error) || null,
        progress: row.progress && typeof row.progress === "object" ? row.progress : null,
      })),
      tasks: runtimeTasks.map((row: any) => ({
        id: cleanText(row.id),
        job_id: cleanText(row.job_id) || null,
        connector_id: cleanText(row.connector_id) || null,
        task_type: cleanText(row.task_type) || null,
        status: cleanText(row.status) || null,
        max_attempts: row.max_attempts === null || row.max_attempts === undefined ? null : Number(row.max_attempts),
        created_at: cleanText(row.created_at) || null,
        updated_at: cleanText(row.updated_at) || null,
        locked_at: cleanText(row.locked_at) || null,
        completed_at: cleanText(row.completed_at) || null,
        last_error: cleanText(row.last_error) || null,
        attempt_count: row.attempt_count === null || row.attempt_count === undefined ? null : Number(row.attempt_count),
      })),
      recent_errors: recentErrors.map((row: any) => ({
        id: cleanText(row.id) || null,
        job_id: cleanText(row.job_id) || null,
        task_id: cleanText(row.task_id) || null,
        connector_id: cleanText(row.connector_id) || null,
        error_class: cleanText(row.error_class) || null,
        classification: cleanText(row.classification) || null,
        created_at: cleanText(row.created_at) || null,
      })),
    },
    diagnostics: { section_errors: errors },
  };
}

export function evaluateWorkspaceHealth(snapshot: HealthSnapshot): HealthReport {
  const at = snapshot.generated_at;
  const findings: HealthFinding[] = [];
  const tracking = snapshot.tracking;
  const identity = snapshot.identity;
  const journeys = snapshot.journeys;
  const attribution = snapshot.attribution;
  const commissions = snapshot.commissions;
  const processing = snapshot.platform_processing;
  const workspace = snapshot.workspace || {
    mode: "development" as WorkspaceMode,
    created_at: null,
    setup_completed_at: null,
    completed_steps: [],
  };
  const workspaceAgeDays = ageDays(at, workspace.created_at);
  const workspaceContext = {
    workspace_mode: workspace.mode,
    workspace_age_days: workspaceAgeDays,
    setup_completed_at: workspace.setup_completed_at,
    live_window_hours: HEALTH_WINDOWS.live_window_hours,
    comparison_window_days: HEALTH_WINDOWS.comparison_window_days,
  };

  findings.push(makeFinding({
    id: "tracking.browser_configuration",
    category: "tracking",
    lifecycle_state: tracking.write_key_configured && tracking.allowed_origins_count > 0 ? "healthy" : "needs_configuration",
    severity: tracking.write_key_configured && tracking.allowed_origins_count > 0 ? "healthy" : "info",
    title: tracking.write_key_configured ? "Browser SDK is configured" : "Browser SDK is not fully configured",
    summary: tracking.write_key_configured
      ? "The workspace has a browser write key configured."
      : "The browser source does not yet have a public write key and allowed origin configuration.",
    why_it_matters: "Browser events are the live signal that powers journeys, identity, attribution, health monitoring, and payout validation.",
    evidence: { write_key_configured: tracking.write_key_configured, allowed_origins_count: tracking.allowed_origins_count },
    recommended_action: tracking.write_key_configured ? "No action needed." : "Open Setup and configure browser tracking for this workspace.",
    metric_value: tracking.write_key_configured ? "configured" : "missing",
    threshold: "write key configured and at least one allowed origin",
    applicability_reason: "Browser SDK setup is required before browser traffic health can be evaluated.",
    evaluation_context: { ...workspaceContext, setup_complete: tracking.write_key_configured && tracking.allowed_origins_count > 0 },
    at,
  }));

  const latestMs = tracking.latest_received_at ? Date.parse(tracking.latest_received_at) : 0;
  const inactiveHours = latestMs ? Math.round((Date.parse(at) - latestMs) / 3600000) : null;
  const browserConfiguredMs = parseTime(tracking.config_updated_at);
  const browserRecentlyConfigured = browserConfiguredMs !== null && Date.parse(at) - browserConfiguredMs <= HEALTH_WINDOWS.live_window_hours * 3600000;
  const browserLifecycle: HealthLifecycleState = !tracking.write_key_configured
    ? "needs_configuration"
    : !latestMs && browserRecentlyConfigured
      ? "initializing"
      : !latestMs
        ? "failing"
        : Number(inactiveHours) > HEALTH_WINDOWS.live_window_hours
          ? "failing"
          : "healthy";
  findings.push(makeFinding({
    id: "tracking.browser_activity",
    category: "tracking",
    lifecycle_state: browserLifecycle,
    severity: browserLifecycle === "failing" ? "critical" : browserLifecycle === "healthy" ? "healthy" : "info",
    title: latestMs ? "Browser SDK activity detected" : browserLifecycle === "initializing" ? "Browser SDK is waiting for first events" : "No browser events received",
    summary: latestMs
      ? `Latest browser event was received ${inactiveHours} hour(s) ago.`
      : browserLifecycle === "initializing"
        ? "Browser tracking was configured recently and is still waiting for the first live event."
        : "No browser activity has been received for this workspace.",
    why_it_matters: "A mature workspace with no recent browser events may have a broken SDK install, blocked origin, or site deployment issue.",
    evidence: { latest_received_at: tracking.latest_received_at, inactive_hours: inactiveHours },
    recommended_action: latestMs ? "No action needed if the timestamp matches expected site traffic." : "Install the browser SDK and send a test page view.",
    metric_value: latestMs ? `${inactiveHours}h ago` : "none",
    threshold: `latest browser event within ${HEALTH_WINDOWS.live_window_hours} hours after initialization`,
    applicability_reason: tracking.write_key_configured ? "Browser source is configured." : "Browser source setup is incomplete.",
    evaluation_context: { ...workspaceContext, configured_recently: browserRecentlyConfigured, latest_received_at: tracking.latest_received_at },
    at,
  }));

  findings.push(makeFinding({
    id: "tracking.processing_backlog",
    category: "tracking",
    severity: tracking.pending_count > 1000 ? "critical" : tracking.pending_count > 100 ? "warning" : "healthy",
    title: tracking.pending_count > 100 ? "Browser event processing backlog detected" : "Browser event backlog is clear",
    summary: `${tracking.pending_count.toLocaleString("en-US")} browser event(s) are pending normalization.`,
    evidence: { pending_events: tracking.pending_count },
    recommended_action: tracking.pending_count > 100 ? "Check browser normalization queue health and recent runtime tasks." : "No action needed.",
    metric_value: metric(tracking.pending_count),
    threshold: "warning above 100 pending events; critical above 1,000",
    at,
  }));

  findings.push(makeFinding({
    id: "tracking.normalization_failures",
    category: "tracking",
    severity: tracking.failed_count > 10 ? "critical" : tracking.failed_count > 0 || tracking.review_count > 0 ? "warning" : "healthy",
    title: tracking.failed_count || tracking.review_count ? "Some browser events need review" : "Browser normalization is healthy",
    summary: `${tracking.failed_count.toLocaleString("en-US")} failed and ${tracking.review_count.toLocaleString("en-US")} review event(s) are present.`,
    evidence: { failed_events: tracking.failed_count, review_events: tracking.review_count },
    recommended_action: tracking.failed_count || tracking.review_count ? "Open Event Explorer and review failed or needs-review events." : "No action needed.",
    metric_value: metric(tracking.failed_count + tracking.review_count),
    threshold: "warning above 0 failed/review events; critical above 10 failures",
    at,
  }));

  const trafficDrop = tracking.yesterday_count >= 10 && tracking.today_count < Math.floor(tracking.yesterday_count * 0.5);
  findings.push(makeFinding({
    id: "tracking.traffic_drop",
    category: "tracking",
    severity: trafficDrop ? "warning" : "healthy",
    title: trafficDrop ? "Browser traffic is down versus yesterday" : "Browser traffic trend is stable",
    summary: `Today has ${tracking.today_count.toLocaleString("en-US")} event(s); yesterday had ${tracking.yesterday_count.toLocaleString("en-US")}.`,
    evidence: { today_events: tracking.today_count, yesterday_events: tracking.yesterday_count },
    recommended_action: trafficDrop ? "Confirm the SDK is still installed and the tracked site is receiving traffic." : "No action needed.",
    metric_value: `${tracking.today_count}/${tracking.yesterday_count}`,
    threshold: "warning when today is below 50% of yesterday after at least 10 events yesterday",
    at,
  }));

  const identityMetrics = identityHealthMetrics(snapshot);
  const identityBackfill = identityMetrics.backfill;
  const incompleteIdentityTasks = identityMetrics.task_counts.queued + identityMetrics.task_counts.running + identityMetrics.task_counts.recoverable_failed;
  const identityLifecycle: HealthLifecycleState = identity.platform_orders_total === 0
    ? "not_applicable"
    : identityMetrics.completion_state === "never_started"
      ? "needs_configuration"
      : identityMetrics.completion_state === "running"
        ? "initializing"
        : identityMetrics.completion_state === "completed_with_incomplete_tasks"
          ? "degraded"
          : identityMetrics.completion_state === "failed"
          ? "degraded"
          : identityMetrics.completion_state === "completed_with_errors"
            ? "degraded"
            : identityMetrics.eligible_orders === 0
              ? "healthy"
              : Number(identityMetrics.eligible_resolution_rate) >= 80
            ? "healthy"
            : Number(identityMetrics.eligible_resolution_rate) >= 50
              ? "degraded"
              : "failing";
  const identitySeverity: HealthSeverity = identityLifecycle === "failing"
    ? "critical"
    : identityLifecycle === "degraded"
      ? "warning"
      : identityLifecycle === "healthy"
        ? "healthy"
        : "info";
  findings.push(makeFinding({
    id: "identity.resolution_rate",
    category: "identity",
    lifecycle_state: identityLifecycle,
    severity: identitySeverity,
    title: identity.platform_orders_total
      ? identityLifecycle === "needs_configuration"
        ? "Historical identity backfill recommended"
        : identityLifecycle === "initializing"
          ? "Historical identity backfill in progress"
          : identityMetrics.eligible_orders === 0
            ? "Historical identity backfill found no eligible identifiers"
          : "Commerce identity resolution measured"
      : "Identity resolution is waiting for commerce orders",
    summary: identityMetrics.eligible_resolution_rate === null
      ? "No platform orders are available for identity resolution yet."
      : identityLifecycle === "needs_configuration"
        ? `${identityMetrics.overall_linkage_rate}% of historical platform orders are linked to a person, but the Identity Backfill Runtime has not completed for this workspace.`
        : `${identityMetrics.eligible_resolution_rate}% of identity-eligible platform orders are linked to a person; ${identityMetrics.overall_linkage_rate}% of all historical platform orders are linked.`,
    why_it_matters: "Historical orders cannot be fully connected into customer journeys, attribution, and customer reporting until identity backfill has established deterministic person links.",
    evidence: {
      total_orders: identityMetrics.total_orders,
      backfill_scope_orders: identityMetrics.backfill_scope_orders,
      eligible_orders: identityMetrics.eligible_orders,
      linked_eligible_orders: identityMetrics.linked_eligible_orders,
      unlinked_eligible_orders: identityMetrics.unlinked_eligible_orders,
      ineligible_orders: identityMetrics.ineligible_orders,
      skipped_no_identifiers: identityMetrics.skipped_no_identifiers,
      eligible_resolution_rate: identityMetrics.eligible_resolution_rate,
      overall_linkage_rate: identityMetrics.overall_linkage_rate,
      linked_platform_orders: identity.linked_platform_orders,
      unlinked_platform_orders: identity.unlinked_platform_orders,
      backfill_status: identityMetrics.completion_state,
      backfill_job_id: identityBackfill.job?.id || null,
      backfill_task_counts_by_status: identityMetrics.task_counts,
      backfill_runtime_error_count: identityMetrics.runtime_error_count,
      backfill_review_required_count: identityMetrics.review_required_count,
    },
    recommended_action: identityLifecycle === "needs_configuration" || identityLifecycle === "degraded" || identityLifecycle === "failing"
      ? "Run or resume the Identity Backfill Runtime for unlinked platform orders."
      : "No action needed.",
    metric_value: identityMetrics.eligible_resolution_rate === null ? "n/a" : `${identityMetrics.eligible_resolution_rate}%`,
    threshold: "evaluate eligible linked rate only after identity backfill readiness; healthy at or above 80%",
    applicability_reason: identity.platform_orders_total ? "Historical platform orders exist." : "No platform orders exist yet.",
    evaluation_context: {
      ...workspaceContext,
      backfill_status: identityMetrics.completion_state,
      backfill_job_id: identityBackfill.job?.id || null,
      remaining_queued_or_running_tasks: incompleteIdentityTasks,
      historical_data_present: identity.platform_orders_total > 0,
    },
    at,
  }));

  findings.push(makeFinding({
    id: "identity.review_queue",
    category: "identity",
    severity: identity.review_count > 0 ? "warning" : "healthy",
    title: identity.review_count ? "Identity review queue has open items" : "Identity review queue is clear",
    summary: `${identity.review_count.toLocaleString("en-US")} identity conflict or review event(s) are open.`,
    evidence: { review_events: identity.review_count, merge_events_30d: identity.merge_events_30d },
    recommended_action: identity.review_count ? "Review identity conflicts before using customer-level reporting operationally." : "No action needed.",
    metric_value: metric(identity.review_count),
    threshold: "warning above 0 review/conflict events",
    at,
  }));

  const anonymousRatio = percent(identity.browser_anonymous_count, Math.max(1, tracking.today_count + tracking.yesterday_count));
  findings.push(makeFinding({
    id: "identity.anonymous_journeys",
    category: "identity",
    severity: identity.browser_anonymous_count > 1000 ? "warning" : "info",
    title: "Anonymous browser traffic retained",
    summary: `${identity.browser_anonymous_count.toLocaleString("en-US")} recent browser event(s) remain anonymous.`,
    evidence: { anonymous_browser_events_7d: identity.browser_anonymous_count, anonymous_ratio_percent: anonymousRatio },
    recommended_action: "Use identify events on login, lead, checkout, and purchase moments to improve deterministic identity coverage.",
    metric_value: metric(identity.browser_anonymous_count),
    threshold: "informational; warning above 1,000 anonymous recent events",
    at,
  }));

  const orphanRate = percent(journeys.journey_events_total - journeys.orphaned_journey_events, journeys.journey_events_total);
  findings.push(makeFinding({
    id: "journeys.assignment_rate",
    category: "journeys",
    severity: journeys.stale_orphaned_journey_events > 100 ? "critical" : journeys.orphaned_journey_events > 0 ? "warning" : "healthy",
    title: journeys.orphaned_journey_events ? "Some events are not assigned to journeys" : "Journey assignment is healthy",
    summary: orphanRate === null
      ? "No journey events are available yet."
      : `${orphanRate}% of journey events are assigned to a journey.`,
    evidence: {
      journey_events_total: journeys.journey_events_total,
      orphaned_journey_events: journeys.orphaned_journey_events,
      stale_orphaned_journey_events: journeys.stale_orphaned_journey_events,
    },
    recommended_action: journeys.orphaned_journey_events ? "Run or resume Journey Backfill for unassigned events." : "No action needed.",
    metric_value: orphanRate === null ? "n/a" : `${orphanRate}%`,
    threshold: "warning above 0 orphaned events; critical above 100 stale orphaned events",
    at,
  }));

  const completionRate = percent(journeys.completed_journeys, journeys.journeys_total);
  findings.push(makeFinding({
    id: "journeys.completion_rate",
    category: "journeys",
    severity: journeys.journeys_total ? "info" : "healthy",
    title: "Journey completion rate",
    summary: completionRate === null ? "Journeys will appear after identified events are processed." : `${completionRate}% of journeys are completed.`,
    evidence: { journeys_total: journeys.journeys_total, active_journeys: journeys.active_journeys, completed_journeys: journeys.completed_journeys },
    recommended_action: "Use this as an operational context metric; journey boundaries remain controlled by the Journey Engine.",
    metric_value: completionRate === null ? "n/a" : `${completionRate}%`,
    threshold: "informational",
    at,
  }));

  findings.push(makeFinding({
    id: "journeys.average_depth",
    category: "journeys",
    severity: journeys.average_events_per_journey === null ? "info" : "healthy",
    title: "Average events per journey",
    summary: journeys.average_events_per_journey === null
      ? "No journey depth sample is available yet."
      : `Recent journeys average ${journeys.average_events_per_journey} event(s).`,
    evidence: { average_events_per_journey: journeys.average_events_per_journey },
    recommended_action: "Use this to spot unusually short or noisy journeys over time.",
    metric_value: metric(journeys.average_events_per_journey),
    threshold: "informational",
    at,
  }));

  findings.push(makeFinding({
    id: "attribution.active_policy",
    category: "attribution",
    lifecycle_state: attribution.active_model ? "healthy" : "needs_configuration",
    severity: attribution.active_model ? "healthy" : "info",
    title: attribution.active_model ? "Attribution policy is active" : "Attribution policy is missing",
    summary: attribution.active_model ? `Operational attribution model is ${attribution.active_model}.` : "No workspace attribution policy is configured.",
    why_it_matters: "Attribution credits can be calculated analytically, but operational health and payouts need a selected workspace policy.",
    evidence: { active_model: attribution.active_model },
    recommended_action: attribution.active_model ? "No action needed." : "Choose an operational attribution model in setup.",
    metric_value: attribution.active_model || "missing",
    threshold: "active policy configured",
    applicability_reason: "Attribution policy is required before attribution coverage is operationally actionable.",
    evaluation_context: { ...workspaceContext, policy_configured: Boolean(attribution.active_model) },
    at,
  }));

  const attributionBackfill = backfillStatus(snapshot, ["attribution-engine-backfill"], ["attribution_backfill"]);
  const recentAttributed = countValue(attribution.recent_attributed_conversions);
  const recentUnattributed = countValue(attribution.recent_unattributed_conversions);
  const recentEvaluated = recentAttributed + recentUnattributed;
  const recentPurchaseEvents = countValue(attribution.recent_purchase_events);
  const recentAttributionRate = percent(recentAttributed, recentEvaluated);
  const attributionRate = percent(attribution.attributed_conversions, attribution.attributed_conversions + attribution.unattributed_conversions);
  const attributionLifecycle: HealthLifecycleState = !attribution.active_model
    ? "needs_configuration"
    : attributionBackfill.state === "running"
      ? "initializing"
      : attribution.purchase_events === 0
        ? "not_applicable"
        : recentPurchaseEvents > 0 && recentPurchaseEvents < HEALTH_WINDOWS.minimum_purchase_sample
          ? "initializing"
          : recentEvaluated >= HEALTH_WINDOWS.minimum_purchase_sample
            ? Number(recentAttributionRate) >= 70
              ? "healthy"
              : Number(recentAttributionRate) >= 40
                ? "degraded"
                : "failing"
            : attributionBackfill.state !== "completed" && attribution.purchase_events > 0
              ? "needs_configuration"
              : attribution.attribution_credit_sample_size < HEALTH_WINDOWS.minimum_purchase_sample
                ? "initializing"
                : Number(attributionRate) >= 70
                  ? "healthy"
                  : "degraded";
  const attributionSeverity: HealthSeverity = attributionLifecycle === "failing"
    ? "critical"
    : attributionLifecycle === "degraded"
      ? "warning"
      : attributionLifecycle === "healthy"
        ? "healthy"
        : "info";
  findings.push(makeFinding({
    id: "attribution.attributed_rate",
    category: "attribution",
    lifecycle_state: attributionLifecycle,
    severity: attributionSeverity,
    title: attributionLifecycle === "initializing"
      ? "Attribution coverage is initializing"
      : attributionLifecycle === "needs_configuration"
        ? "Attribution backfill recommended"
        : "Attribution coverage",
    summary: recentEvaluated
      ? `${recentAttributionRate}% of conversion credits in the last ${HEALTH_WINDOWS.live_window_hours} hours are attributed.`
      : attributionRate === null
        ? "Attribution credits have not been generated yet."
        : `${attributionRate}% of sampled conversion credits are attributed.`,
    why_it_matters: "Attribution coverage should be evaluated from recent live conversions after the attribution policy and backfill are ready; historical unprocessed conversions are setup context, not proof of an active outage.",
    evidence: {
      purchase_events: attribution.purchase_events,
      recent_purchase_events: recentPurchaseEvents,
      attribution_credit_sample_size: attribution.attribution_credit_sample_size,
      attributed_conversions: attribution.attributed_conversions,
      unattributed_conversions: attribution.unattributed_conversions,
      recent_attributed_conversions: recentAttributed,
      recent_unattributed_conversions: recentUnattributed,
      historical_backfill_status: attributionBackfill.state,
    },
    recommended_action: attributionLifecycle === "needs_configuration" || attributionLifecycle === "degraded" || attributionLifecycle === "failing"
      ? "Run Attribution Backfill and confirm purchases have eligible marketing touchpoints."
      : "No action needed.",
    metric_value: recentAttributionRate === null ? attributionRate === null ? "n/a" : `${attributionRate}%` : `${recentAttributionRate}%`,
    threshold: `evaluate recent coverage after at least ${HEALTH_WINDOWS.minimum_purchase_sample} purchases; healthy at or above 70%`,
    applicability_reason: attribution.purchase_events ? "Purchase events exist for attribution evaluation." : "No purchase events exist yet.",
    evaluation_context: {
      ...workspaceContext,
      backfill_status: attributionBackfill.state,
      backfill_job_id: attributionBackfill.job?.id || null,
      minimum_purchase_sample: HEALTH_WINDOWS.minimum_purchase_sample,
      recent_window_hours: HEALTH_WINDOWS.live_window_hours,
    },
    at,
  }));

  findings.push(makeFinding({
    id: "attribution.touchpoints",
    category: "attribution",
    severity: attribution.unknown_affiliate_events > 0 ? "warning" : "healthy",
    title: attribution.unknown_affiliate_events ? "Unknown affiliate identifiers detected" : "Affiliate identifiers look usable",
    summary: `${attribution.eligible_touchpoints.toLocaleString("en-US")} affiliate-bearing touchpoint event(s); ${attribution.unknown_affiliate_events.toLocaleString("en-US")} unknown identifier event(s).`,
    evidence: { eligible_touchpoints: attribution.eligible_touchpoints, unknown_affiliate_events: attribution.unknown_affiliate_events },
    recommended_action: attribution.unknown_affiliate_events ? "Review tracking links or partner mappings that are sending unknown affiliate identifiers." : "No action needed.",
    metric_value: metric(attribution.unknown_affiliate_events),
    threshold: "warning above 0 unknown affiliate identifiers",
    at,
  }));

  findings.push(makeFinding({
    id: "commissions.draft_backlog",
    category: "commissions",
    severity: commissions.draft_count > 500 ? "critical" : commissions.draft_count > 100 ? "warning" : "healthy",
    title: commissions.draft_count > 100 ? "Draft commission backlog detected" : "Draft commission backlog is manageable",
    summary: `${commissions.draft_count.toLocaleString("en-US")} commission(s) are currently in draft.`,
    evidence: { draft_commissions: commissions.draft_count },
    recommended_action: commissions.draft_count > 100 ? "Review and advance eligible draft commissions through approval." : "No action needed.",
    metric_value: metric(commissions.draft_count),
    threshold: "warning above 100 drafts; critical above 500",
    at,
  }));

  findings.push(makeFinding({
    id: "commissions.approval_backlog",
    category: "commissions",
    severity: commissions.pending_count > 100 ? "warning" : "healthy",
    title: commissions.pending_count ? "Pending commissions await approval" : "No pending commission backlog",
    summary: `${commissions.pending_count.toLocaleString("en-US")} commission(s) are pending approval.`,
    evidence: { pending_commissions: commissions.pending_count, approved_commissions: commissions.approved_count, paid_commissions: commissions.paid_count },
    recommended_action: commissions.pending_count > 100 ? "Approve, hold, or export pending commissions before the payout cycle." : "No action needed.",
    metric_value: metric(commissions.pending_count),
    threshold: "warning above 100 pending commissions",
    at,
  }));

  findings.push(makeFinding({
    id: "commissions.duplicates",
    category: "commissions",
    severity: commissions.duplicate_conversion_count > 0 ? "critical" : "healthy",
    title: commissions.duplicate_conversion_count ? "Duplicate payable commissions detected" : "No duplicate commissions detected",
    summary: `${commissions.duplicate_conversion_count.toLocaleString("en-US")} duplicate conversion commission key(s) were found in the latest sample.`,
    evidence: { duplicate_conversion_count: commissions.duplicate_conversion_count, sample_limit: 1000 },
    recommended_action: commissions.duplicate_conversion_count ? "Pause payout export and inspect commission idempotency before approval." : "No action needed.",
    metric_value: metric(commissions.duplicate_conversion_count),
    threshold: "critical above 0 duplicates",
    at,
  }));

  const commissionOverridesConfigured = hasConfiguredCommissionOverrides(commissions);
  const commissionDisabled = commissionsIntentionallyDisabled(commissions);
  const zeroRate = commissions.default_commission_rate === 0;
  const commissionPolicyLifecycle: HealthLifecycleState = commissions.default_commission_rate === null
    ? "not_applicable"
    : commissionDisabled
      ? "not_applicable"
      : zeroRate && (workspace.mode === "development" || workspace.mode === "test")
        ? "healthy"
        : zeroRate && commissionOverridesConfigured
          ? "healthy"
          : zeroRate
            ? "needs_configuration"
            : "healthy";
  const commissionPolicySeverity: HealthSeverity = commissionPolicyLifecycle === "needs_configuration"
    ? workspace.mode === "production" ? "warning" : "info"
    : commissionPolicyLifecycle === "healthy" ? "healthy" : "info";
  findings.push(makeFinding({
    id: "commissions.policy_rate",
    category: "commissions",
    lifecycle_state: commissionPolicyLifecycle,
    severity: commissionPolicySeverity,
    title: commissionPolicyLifecycle === "not_applicable"
      ? "Commission feature is not enabled"
      : zeroRate && (workspace.mode === "development" || workspace.mode === "test")
        ? "Commission validation mode is active"
        : zeroRate
          ? "Commission policy needs configuration"
          : "Commission policy rate is configured",
    summary: commissions.default_commission_rate === null
      ? "No payout policy row was found."
      : commissionDisabled
        ? "Commission generation is intentionally disabled by workspace policy metadata."
      : `Default commission rate is ${Math.round(Number(commissions.default_commission_rate) * 10000) / 100}%.`,
    why_it_matters: "A zero default rate is expected in development/test validation mode, but production payout workspaces need an intentional commission strategy.",
    evidence: {
      default_commission_rate: commissions.default_commission_rate,
      workspace_mode: workspace.mode,
      overrides_configured: commissionOverridesConfigured,
      intentionally_disabled: commissionDisabled,
    },
    recommended_action: commissionPolicyLifecycle === "needs_configuration"
      ? "Set a non-zero default commission rate, configure per-affiliate overrides, or explicitly disable commissions."
      : "No action needed.",
    metric_value: commissions.default_commission_rate === null ? "n/a" : `${Math.round(Number(commissions.default_commission_rate) * 10000) / 100}%`,
    threshold: "production workspaces should have a non-zero default rate, overrides, or an explicit disabled state",
    applicability_reason: commissionDisabled ? "Commission policy metadata marks payouts disabled." : "Commission policy is evaluated from workspace mode and payout policy.",
    evaluation_context: { ...workspaceContext, overrides_configured: commissionOverridesConfigured, intentionally_disabled: commissionDisabled },
    at,
  }));

  for (const integration of snapshot.integrations) {
    findings.push(makeFinding({
      id: `integrations.${integration.platform}`,
      category: "integrations",
      severity: integration.last_error ? "warning" : integration.credential_configured ? "healthy" : "info",
      title: `${integration.platform} integration ${integration.last_error ? "needs attention" : "is present"}`,
      summary: integration.last_error
        ? `${integration.platform} reported its latest error in integration settings.`
        : `${integration.platform} exists in ${integration.source}.`,
      evidence: {
        platform: integration.platform,
        source: integration.source,
        credential_configured: integration.credential_configured,
        auto_import_enabled: integration.auto_import_enabled,
        last_success_at: integration.last_success_at,
        last_error: integration.last_error ? "present" : null,
      },
      recommended_action: integration.last_error ? `Open ${integration.platform} integration settings and test the connection/import.` : "No action needed.",
      metric_value: integration.last_error ? "error" : integration.credential_configured ? "connected" : "present",
      threshold: "only integrations present in credentials, settings, or browser source config are reported",
      at,
    }));
  }

  const staleQueued = staleQueuedTasks(snapshot, at);
  const recentFailedTasks = recentRows((processing.tasks || []).filter((task) => cleanText(task.status) === "failed"), at, HEALTH_WINDOWS.runtime_active_error_minutes);
  const runtimeTaskLifecycle: HealthLifecycleState = staleQueued.length > 0
    ? "degraded"
    : recentFailedTasks.length >= 5
      ? "failing"
      : recentFailedTasks.length > 0
        ? "degraded"
        : processing.failed_tasks > 0
          ? "resolved"
          : "healthy";
  const runtimeTaskSeverity: HealthSeverity = runtimeTaskLifecycle === "failing"
    ? "critical"
    : runtimeTaskLifecycle === "degraded"
      ? "warning"
      : runtimeTaskLifecycle === "healthy"
        ? "healthy"
        : "info";
  findings.push(makeFinding({
    id: "platform_processing.runtime_tasks",
    category: "platform_processing",
    lifecycle_state: runtimeTaskLifecycle,
    severity: runtimeTaskSeverity,
    title: runtimeTaskLifecycle === "resolved"
      ? "Historical connector task failures are resolved"
      : staleQueued.length
        ? "Connector runtime has stale queued tasks"
        : processing.failed_tasks
          ? "Connector runtime has failed tasks"
          : "Connector runtime task queue looks healthy",
    summary: `${processing.queued_tasks.toLocaleString("en-US")} queued task(s), ${processing.failed_tasks.toLocaleString("en-US")} failed task(s), ${processing.active_jobs.toLocaleString("en-US")} active job(s).`,
    why_it_matters: "Only current stale queues or recent repeated task failures indicate an active processing problem; historical task rows are retained for audit.",
    evidence: {
      queued_tasks: processing.queued_tasks,
      failed_tasks: processing.failed_tasks,
      recent_failed_tasks: recentFailedTasks.length,
      stale_queued_tasks: staleQueued.length,
      active_jobs: processing.active_jobs,
    },
    recommended_action: runtimeTaskLifecycle === "degraded" || runtimeTaskLifecycle === "failing" ? "Open runtime/import job diagnostics and retry recoverable failed tasks." : "No action needed.",
    metric_value: `${processing.failed_tasks} failed`,
    threshold: `degraded for queued tasks stale beyond ${HEALTH_WINDOWS.stale_task_minutes} minutes or recent failures inside ${HEALTH_WINDOWS.runtime_active_error_minutes} minutes`,
    applicability_reason: "Connector runtime tasks exist for asynchronous backfills and imports.",
    evaluation_context: { ...workspaceContext, active_error_window_minutes: HEALTH_WINDOWS.runtime_active_error_minutes, stale_task_minutes: HEALTH_WINDOWS.stale_task_minutes },
    at,
  }));

  const activeErrorRows = recentRows(processing.recent_errors, at, HEALTH_WINDOWS.runtime_active_error_minutes);
  const latestError = processing.recent_errors[0] || null;
  const successAfterLatestError = latestCompletedJobAfter(snapshot, latestError?.created_at || null);
  const runtimeErrorLifecycle: HealthLifecycleState = activeErrorRows.length >= 10 && !successAfterLatestError
    ? "failing"
    : activeErrorRows.length > 0 && !successAfterLatestError
      ? "degraded"
      : processing.recent_errors.length > 0
        ? "resolved"
        : "healthy";
  const runtimeErrorSeverity: HealthSeverity = runtimeErrorLifecycle === "failing"
    ? "critical"
    : runtimeErrorLifecycle === "degraded"
      ? "warning"
      : runtimeErrorLifecycle === "healthy"
        ? "healthy"
        : "info";
  findings.push(makeFinding({
    id: "platform_processing.recent_errors",
    category: "platform_processing",
    lifecycle_state: runtimeErrorLifecycle,
    severity: runtimeErrorSeverity,
    title: runtimeErrorLifecycle === "resolved"
      ? "Historical platform processing errors are resolved"
      : processing.recent_errors.length
        ? "Recent platform processing errors found"
        : "No recent platform processing errors",
    summary: `${processing.recent_errors.length.toLocaleString("en-US")} recent import/runtime error record(s) were found.`,
    why_it_matters: "Recent recurring errors without a later successful run can mean imports, identity backfills, attribution, or browser processing are not keeping up.",
    evidence: {
      recent_errors: processing.recent_errors,
      active_window_errors: activeErrorRows.length,
      last_success_after_latest_error_at: successAfterLatestError?.completed_at || successAfterLatestError?.updated_at || null,
    },
    recommended_action: runtimeErrorLifecycle === "degraded" || runtimeErrorLifecycle === "failing" ? "Review recent connector errors before relying on the latest imported data." : "No action needed.",
    metric_value: metric(processing.recent_errors.length),
    threshold: `active only when recurring within ${HEALTH_WINDOWS.runtime_active_error_minutes} minutes without later successful processing`,
    applicability_reason: "Runtime error rows are audit evidence; recency and later success determine whether they remain active.",
    evaluation_context: { ...workspaceContext, active_error_window_minutes: HEALTH_WINDOWS.runtime_active_error_minutes },
    at,
  }));

  for (const error of snapshot.diagnostics.section_errors) {
    findings.push(makeFinding({
      id: `platform_processing.health_query_${error.section.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      category: "platform_processing",
      severity: "warning",
      title: "A health check could not read a source table",
      summary: `The ${error.section} health query failed.`,
      evidence: { section: error.section, message: error.message },
      recommended_action: "Confirm the source table exists and has the expected production schema.",
      metric_value: "query failed",
      threshold: "all health source reads should succeed",
      at,
    }));
  }

  return summarizeHealth(snapshot.workspace_id, at, findings);
}

function summarizeHealth(workspaceId: string, generatedAt: string, findings: HealthFinding[]): HealthReport {
  const counts = {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    healthy: findings.filter((finding) => finding.severity === "healthy").length,
    not_applicable: findings.filter((finding) => finding.lifecycle_state === "not_applicable").length,
    needs_configuration: findings.filter((finding) => finding.lifecycle_state === "needs_configuration").length,
    initializing: findings.filter((finding) => finding.lifecycle_state === "initializing").length,
    degraded: findings.filter((finding) => finding.lifecycle_state === "degraded").length,
    failing: findings.filter((finding) => finding.lifecycle_state === "failing").length,
    open: findings.filter((finding) => finding.status === "open").length,
    resolved: findings.filter((finding) => finding.status === "resolved").length,
  };
  const applicableFindings = findings.filter((finding) => finding.lifecycle_state !== "not_applicable");
  const excludedChecks = findings.length - applicableFindings.length;
  const score = Math.max(0, Math.min(100, 100 - applicableFindings.reduce((sum, finding) => sum + lifecyclePenalty(finding.lifecycle_state), 0)));
  const status = healthStatusFromLifecycle(applicableFindings);

  const categories = HEALTH_CATEGORIES.reduce((acc, category) => {
    const rows = findings.filter((finding) => finding.category === category);
    const critical = rows.filter((finding) => finding.severity === "critical").length;
    const warning = rows.filter((finding) => finding.severity === "warning").length;
    const healthy = rows.filter((finding) => finding.severity === "healthy").length;
    const applicableRows = rows.filter((finding) => finding.lifecycle_state !== "not_applicable");
    const categoryScore = Math.max(0, Math.min(100, 100 - applicableRows.reduce((sum, finding) => sum + lifecyclePenalty(finding.lifecycle_state), 0)));
    acc[category] = {
      score: categoryScore,
      status: healthStatusFromLifecycle(applicableRows),
      open: rows.filter((finding) => finding.status === "open").length,
      critical,
      warning,
      healthy,
      applicable_checks: applicableRows.length,
      excluded_checks: rows.length - applicableRows.length,
      initializing_checks: rows.filter((finding) => finding.lifecycle_state === "initializing").length,
      failing_checks: rows.filter((finding) => finding.lifecycle_state === "failing").length,
    };
    return acc;
  }, {} as HealthReport["categories"]);

  const openFindings = findings
    .filter((finding) => finding.status === "open" && finding.lifecycle_state !== "initializing")
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.category.localeCompare(b.category));

  return {
    ok: true,
    workspace_id: workspaceId,
    generated_at: generatedAt,
    engine_version: HEALTH_ENGINE_VERSION,
    overall: {
      score,
      status,
      applicable_checks: applicableFindings.length,
      excluded_checks: excludedChecks,
      initializing_checks: findings.filter((finding) => finding.lifecycle_state === "initializing").length,
      failing_checks: findings.filter((finding) => finding.lifecycle_state === "failing").length,
    },
    counts,
    categories,
    findings,
    recommended_actions: openFindings.slice(0, 8).map((finding) => ({
      finding_id: finding.id,
      severity: finding.severity,
      category: finding.category,
      issue: finding.title,
      why_it_matters: finding.why_it_matters,
      how_to_fix: finding.recommended_action,
      deep_link: healthDeepLink(finding.category),
    })),
    notifications: openFindings.map((finding) => ({
      id: `health_notification:${workspaceId}:${finding.id}`,
      finding_id: finding.id,
      unread: finding.status === "open",
      lifecycle_state: finding.lifecycle_state,
      severity: finding.severity,
      timestamp: finding.updated_at,
      deep_link: healthDeepLink(finding.category),
      resolved: finding.status === "resolved",
      title: finding.title,
      summary: finding.summary,
      category: finding.category,
    })),
    timeline: buildCurrentSnapshotTimeline(openFindings),
    source_tables: [
      "browser_event_sources",
      "workspace_onboarding",
      "browser_events_raw",
      "people",
      "person_identifiers",
      "identity_resolution_events",
      "platform_orders",
      "journeys",
      "journey_events",
      "journey_attribution_credits",
      "workspace_attribution_policy",
      "affiliate_commissions",
      "integration_import_jobs",
      "connector_import_tasks",
      "integration_import_errors",
      "integrations_credentials",
      "integrations_settings",
    ],
  };
}

function healthDeepLink(category: HealthCategory) {
  if (category === "tracking") return "/events";
  if (category === "identity") return "/customers?identity_status=unresolved";
  if (category === "attribution") return "/customers?has_purchase=true&has_attribution=false";
  if (category === "commissions") return "/customers?has_commission=true";
  if (category === "journeys") return "/journeys";
  if (category === "integrations" || category === "platform_processing") return "/settings/integrations";
  return "/overview";
}

function severityRank(severity: HealthSeverity) {
  return severity === "critical" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

function buildCurrentSnapshotTimeline(openFindings: HealthFinding[]): HealthTimelinePoint[] {
  const issueCount = openFindings.filter((finding) => finding.severity === "critical" || finding.severity === "warning").length;
  return [
    { label: "Today", new_issues: issueCount, resolved_issues: 0, persistent_issues: issueCount },
    { label: "Yesterday", new_issues: 0, resolved_issues: 0, persistent_issues: issueCount },
    { label: "7 Days", new_issues: 0, resolved_issues: 0, persistent_issues: issueCount },
    { label: "30 Days", new_issues: 0, resolved_issues: 0, persistent_issues: issueCount },
  ];
}

export async function getWorkspaceHealthReport(supabase: any, params: HealthQueryParams, now = new Date()) {
  const snapshot = await loadWorkspaceHealthSnapshot(supabase, params, now);
  return evaluateWorkspaceHealth(snapshot);
}

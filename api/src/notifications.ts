import { cleanText } from "./identity-normalization.ts";
import {
  getWorkspaceHealthReport,
  type HealthCategory,
  type HealthFinding,
  type HealthLifecycleState,
  type HealthReport,
  type HealthSeverity,
} from "./health.ts";
import {
  syncHealthWorkItems,
  workItemsByHealthFinding,
  type WorkItemRow,
} from "./work-items.ts";

export const NOTIFICATION_ENGINE_VERSION = "notification_engine_v1";
export const NOTIFICATIONS_ROUTE = "/v1/notifications";

export const NOTIFICATION_CATEGORIES = [
  "tracking",
  "attribution",
  "identity",
  "journeys",
  "revenue",
  "commissions",
  "integrations",
  "platform",
] as const;

export const NOTIFICATION_STATUSES = ["unread", "read", "resolved", "dismissed"] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export type NotificationRouteMatch =
  | { kind: "list_notifications" }
  | { kind: "get_notification"; notification_id: string }
  | { kind: "mark_read"; notification_id: string }
  | { kind: "dismiss"; notification_id: string }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type NotificationQueryParams = {
  workspace_id: string;
  limit: number;
  cursor: number;
  severity: HealthSeverity[];
  category: NotificationCategory[];
  status: NotificationStatus[];
  search: string | null;
  from: string | null;
  to: string | null;
};

export type NotificationStateRow = {
  workspace_id: string;
  notification_id: string;
  health_finding_id: string;
  read_at: string | null;
  dismissed_at: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NotificationTimelineEvent = {
  label: string;
  timestamp: string;
  status: NotificationStatus | "detected" | "updated";
  summary: string;
};

export type WorkspaceNotification = {
  id: string;
  type: NotificationCategory;
  lifecycle_state: HealthLifecycleState;
  severity: HealthSeverity;
  status: NotificationStatus;
  title: string;
  summary: string;
  created_at: string;
  resolved_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  deep_link: string;
  recommended_action: string;
  workspace_id: string;
  health_finding_id: string;
  work_item_id?: string | null;
  work_item_status?: string | null;
  work_item_deep_link?: string | null;
  why_it_matters: string;
  evidence: Record<string, any>;
  related_metrics: Record<string, any>;
  timeline: NotificationTimelineEvent[];
  metadata: {
    finding: Record<string, any>;
    health_finding_id: string;
    health_category: HealthCategory;
    lifecycle_state: HealthLifecycleState;
    health_status: string;
    work_item_id?: string | null;
    work_item_status?: string | null;
    notification_engine_version: string;
    delivery_channels: string[];
  };
};

export type NotificationReport = {
  ok: true;
  workspace_id: string;
  generated_at: string;
  engine_version: string;
  health: Pick<HealthReport, "overall" | "counts" | "categories" | "timeline">;
  counts: {
    total: number;
    unread: number;
    read: number;
    resolved: number;
    dismissed: number;
    critical: number;
    warning: number;
    info: number;
    healthy: number;
  };
  notifications: WorkspaceNotification[];
  next_cursor: string | null;
  has_more: boolean;
  page: {
    limit: number;
    cursor: string | null;
  };
  filters: {
    severity: HealthSeverity[];
    category: NotificationCategory[];
    status: NotificationStatus[];
    search: string | null;
    from: string | null;
    to: string | null;
  };
};

const VALID_SEVERITIES: HealthSeverity[] = ["critical", "warning", "info", "healthy"];
const HEALTH_CATEGORY_TO_NOTIFICATION: Record<HealthCategory, NotificationCategory> = {
  tracking: "tracking",
  identity: "identity",
  journeys: "journeys",
  attribution: "attribution",
  commissions: "commissions",
  integrations: "integrations",
  platform_processing: "platform",
};

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

export function notificationIdForFinding(workspaceId: string, findingId: string) {
  return `health_notification:${workspaceId}:${findingId}`;
}

export function matchNotificationRoute(method: string, path: string): NotificationRouteMatch | null {
  const cleanPath = normalizedPath(path);
  const upperMethod = String(method || "GET").toUpperCase();
  if (cleanPath === NOTIFICATIONS_ROUTE) {
    if (upperMethod === "GET") return { kind: "list_notifications" };
    return { kind: "method_not_allowed", path: NOTIFICATIONS_ROUTE, allowed_methods: ["GET"] };
  }

  const actionMatch = new RegExp(`^${NOTIFICATIONS_ROUTE}/([^/]+)/(read|dismiss)$`).exec(cleanPath);
  if (actionMatch) {
    const action = actionMatch[2];
    if (upperMethod !== "POST") {
      return { kind: "method_not_allowed", path: `${NOTIFICATIONS_ROUTE}/:notification_id/${action}`, allowed_methods: ["POST"] };
    }
    return {
      kind: action === "read" ? "mark_read" : "dismiss",
      notification_id: decodeURIComponent(actionMatch[1]),
    };
  }

  const detailMatch = new RegExp(`^${NOTIFICATIONS_ROUTE}/([^/]+)$`).exec(cleanPath);
  if (detailMatch) {
    if (upperMethod === "GET") return { kind: "get_notification", notification_id: decodeURIComponent(detailMatch[1]) };
    return { kind: "method_not_allowed", path: `${NOTIFICATIONS_ROUTE}/:notification_id`, allowed_methods: ["GET"] };
  }

  return null;
}

export function normalizeNotificationParams(args: Record<string, unknown>): NotificationQueryParams {
  const severity = splitList(args.severity).filter((item): item is HealthSeverity => VALID_SEVERITIES.includes(item as HealthSeverity));
  const category = splitList(args.category || args.type).filter((item): item is NotificationCategory => NOTIFICATION_CATEGORIES.includes(item as NotificationCategory));
  const status = splitList(args.status).filter((item): item is NotificationStatus => NOTIFICATION_STATUSES.includes(item as NotificationStatus));
  const search = cleanText(args.search || args.q) || null;
  return {
    workspace_id: cleanText(args.workspace_id || args.workspaceId) || "default",
    limit: clampInt(args.limit, 25, 1, 100),
    cursor: clampInt(args.cursor, 0, 0, 100000),
    severity,
    category,
    status,
    search,
    from: cleanText(args.from) || null,
    to: cleanText(args.to) || null,
  };
}

export function notificationDeepLink(category: NotificationCategory) {
  if (category === "tracking") return "/events";
  if (category === "identity") return "/customers";
  if (category === "journeys" || category === "attribution") return "/journeys";
  if (category === "commissions" || category === "revenue") return "/reports";
  if (category === "integrations" || category === "platform") return "/settings/integrations";
  return "/overview";
}

function notificationStatusForFinding(finding: HealthFinding, state?: NotificationStateRow | null): NotificationStatus {
  if (
    finding.lifecycle_state === "healthy"
    || finding.lifecycle_state === "resolved"
    || finding.lifecycle_state === "not_applicable"
    || finding.lifecycle_state === "initializing"
  ) return "resolved";
  if (state?.dismissed_at) return "dismissed";
  if (state?.read_at) return "read";
  if (finding.lifecycle_state === "needs_configuration") return "read";
  return "unread";
}

function severityRank(severity: HealthSeverity) {
  return severity === "critical" ? 4 : severity === "warning" ? 3 : severity === "info" ? 2 : 1;
}

function statusRank(status: NotificationStatus) {
  return status === "unread" ? 4 : status === "read" ? 3 : status === "resolved" ? 2 : 1;
}

function compactMetricEvidence(finding: HealthFinding) {
  return {
    metric_value: finding.metric_value,
    threshold: finding.threshold,
    lifecycle_state: finding.lifecycle_state,
    applicability_reason: finding.applicability_reason,
    evaluation_context: finding.evaluation_context,
    ...finding.evidence,
  };
}

function notificationTimeline(finding: HealthFinding, state: NotificationStateRow | null | undefined, status: NotificationStatus): NotificationTimelineEvent[] {
  const rows: NotificationTimelineEvent[] = [
    {
      label: status === "resolved" ? "Finding evaluated" : "Issue detected",
      timestamp: finding.detected_at,
      status: "detected",
      summary: finding.summary,
    },
  ];
  if (finding.updated_at && finding.updated_at !== finding.detected_at) {
    rows.push({
      label: status === "resolved" ? "Resolved by Health Engine" : "Finding updated",
      timestamp: finding.updated_at,
      status: status === "resolved" ? "resolved" : "updated",
      summary: status === "resolved" ? "The Health Engine currently reports this finding as resolved." : "Health Engine evidence changed for this finding.",
    });
  }
  if (state?.read_at) {
    rows.push({ label: "Read", timestamp: state.read_at, status: "read", summary: "A workspace user opened this notification." });
  }
  if (state?.dismissed_at) {
    rows.push({ label: "Dismissed", timestamp: state.dismissed_at, status: "dismissed", summary: "A workspace user dismissed this notification from the active inbox." });
  }
  return rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function buildNotificationFromFinding(args: {
  workspace_id: string;
  finding: HealthFinding;
  state?: NotificationStateRow | null;
  work_item?: WorkItemRow | null;
}): WorkspaceNotification {
  const category = HEALTH_CATEGORY_TO_NOTIFICATION[args.finding.category];
  const status = notificationStatusForFinding(args.finding, args.state);
  const id = notificationIdForFinding(args.workspace_id, args.finding.id);
  const evidence = compactMetricEvidence(args.finding);
  return {
    id,
    type: category,
    lifecycle_state: args.finding.lifecycle_state,
    severity: args.finding.severity,
    status,
    title: args.finding.title,
    summary: args.finding.summary,
    created_at: args.finding.detected_at,
    resolved_at: status === "resolved" ? args.finding.updated_at : null,
    read_at: args.state?.read_at || null,
    dismissed_at: args.state?.dismissed_at || null,
    deep_link: args.work_item ? `/operations?work_item_id=${encodeURIComponent(args.work_item.id)}` : notificationDeepLink(category),
    recommended_action: args.finding.recommended_action,
    workspace_id: args.workspace_id,
    health_finding_id: args.finding.id,
    work_item_id: args.work_item?.id || null,
    work_item_status: args.work_item?.status || null,
    work_item_deep_link: args.work_item ? `/operations?work_item_id=${encodeURIComponent(args.work_item.id)}` : null,
    why_it_matters: args.finding.why_it_matters,
    evidence,
    related_metrics: evidence,
    timeline: notificationTimeline(args.finding, args.state, status),
    metadata: {
      finding: evidence,
      health_finding_id: args.finding.id,
      health_category: args.finding.category,
      lifecycle_state: args.finding.lifecycle_state,
      health_status: args.finding.status,
      work_item_id: args.work_item?.id || null,
      work_item_status: args.work_item?.status || null,
      notification_engine_version: NOTIFICATION_ENGINE_VERSION,
      delivery_channels: ["dashboard", "notification_center", "mcp", "slack_future", "email_future", "webhook_future"],
    },
  };
}

function applyNotificationFilters(notifications: WorkspaceNotification[], params: NotificationQueryParams) {
  const fromTime = params.from ? new Date(params.from).getTime() : null;
  const toTime = params.to ? new Date(params.to).getTime() : null;
  const search = params.search?.toLowerCase() || "";
  return notifications.filter((notification) => {
    if (params.severity.length && !params.severity.includes(notification.severity)) return false;
    if (params.category.length && !params.category.includes(notification.type)) return false;
    if (params.status.length && !params.status.includes(notification.status)) return false;
    const createdTime = new Date(notification.created_at).getTime();
    if (fromTime !== null && Number.isFinite(fromTime) && createdTime < fromTime) return false;
    if (toTime !== null && Number.isFinite(toTime) && createdTime > toTime) return false;
    if (search) {
      const haystack = [
        notification.title,
        notification.summary,
        notification.recommended_action,
        notification.type,
        notification.severity,
        notification.metadata.lifecycle_state,
        notification.health_finding_id,
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function buildNotificationReport(args: {
  health: HealthReport;
  states?: NotificationStateRow[];
  work_items?: WorkItemRow[];
  params: NotificationQueryParams;
}): NotificationReport {
  const effectiveParams = args.params.status.length ? args.params : { ...args.params, status: ["unread", "read"] as NotificationStatus[] };
  const stateById = new Map((args.states || [])
    .filter((state) => state.workspace_id === args.health.workspace_id)
    .map((state) => [state.notification_id, state]));
  const workItemByFinding = workItemsByHealthFinding(args.work_items || []);
  const all = args.health.findings
    .map((finding) => {
      const notificationId = notificationIdForFinding(args.health.workspace_id, finding.id);
      return buildNotificationFromFinding({
        workspace_id: args.health.workspace_id,
        finding,
        state: stateById.get(notificationId) || null,
        work_item: workItemByFinding.get(finding.id) || null,
      });
    })
    .sort((a, b) => {
      const active = statusRank(b.status) - statusRank(a.status);
      if (active) return active;
      const severity = severityRank(b.severity) - severityRank(a.severity);
      if (severity) return severity;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.id.localeCompare(b.id);
    });

  const counts = {
    total: all.length,
    unread: all.filter((notification) => notification.status === "unread").length,
    read: all.filter((notification) => notification.status === "read").length,
    resolved: all.filter((notification) => notification.status === "resolved").length,
    dismissed: all.filter((notification) => notification.status === "dismissed").length,
    critical: all.filter((notification) => notification.severity === "critical").length,
    warning: all.filter((notification) => notification.severity === "warning").length,
    info: all.filter((notification) => notification.severity === "info").length,
    healthy: all.filter((notification) => notification.severity === "healthy").length,
  };

  const filtered = applyNotificationFilters(all, effectiveParams);
  const page = filtered.slice(args.params.cursor, args.params.cursor + args.params.limit);
  const nextOffset = args.params.cursor + page.length;
  const hasMore = nextOffset < filtered.length;
  return {
    ok: true,
    workspace_id: args.health.workspace_id,
    generated_at: args.health.generated_at,
    engine_version: NOTIFICATION_ENGINE_VERSION,
    health: {
      overall: args.health.overall,
      counts: args.health.counts,
      categories: args.health.categories,
      timeline: args.health.timeline,
    },
    counts,
    notifications: page,
    next_cursor: hasMore ? String(nextOffset) : null,
    has_more: hasMore,
    page: {
      limit: args.params.limit,
      cursor: args.params.cursor ? String(args.params.cursor) : null,
    },
    filters: {
      severity: args.params.severity,
      category: args.params.category,
      status: effectiveParams.status,
      search: args.params.search,
      from: args.params.from,
      to: args.params.to,
    },
  };
}

async function loadNotificationStates(supabase: any, workspaceId: string, notificationIds: string[]) {
  if (!notificationIds.length) return [] as NotificationStateRow[];
  const { data, error } = await supabase
    .from("notification_states")
    .select("workspace_id,notification_id,health_finding_id,read_at,dismissed_at,archived_at,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .in("notification_id", notificationIds);
  if (error) throw new Error(`Notification state lookup failed: ${error.message || JSON.stringify(error)}`);
  return (data || []) as NotificationStateRow[];
}

export async function getWorkspaceNotificationReport(supabase: any, params: NotificationQueryParams, now = new Date()): Promise<NotificationReport> {
  const health = await getWorkspaceHealthReport(supabase, { workspace_id: params.workspace_id }, now);
  const workItems = await syncHealthWorkItems(supabase, health, now.toISOString());
  const notificationIds = health.findings.map((finding) => notificationIdForFinding(health.workspace_id, finding.id));
  const states = await loadNotificationStates(supabase, health.workspace_id, notificationIds);
  return buildNotificationReport({ health, states, work_items: workItems, params });
}

export async function getWorkspaceNotification(supabase: any, args: { workspace_id: string; notification_id: string }, now = new Date()) {
  const params = normalizeNotificationParams({ workspace_id: args.workspace_id, limit: 100, cursor: 0 });
  const report = await getWorkspaceNotificationReport(supabase, params, now);
  return report.notifications.find((notification) => notification.id === args.notification_id) || null;
}

export async function upsertNotificationReadState(supabase: any, args: {
  workspace_id: string;
  notification_id: string;
  dismissed?: boolean;
  now?: string;
}) {
  const now = args.now || new Date().toISOString();
  const notification = await getWorkspaceNotification(supabase, {
    workspace_id: args.workspace_id,
    notification_id: args.notification_id,
  });
  if (!notification) {
    const error: any = new Error("Notification not found.");
    error.status = 404;
    error.code = "notification_not_found";
    throw error;
  }

  const payload: NotificationStateRow = {
    workspace_id: args.workspace_id,
    notification_id: args.notification_id,
    health_finding_id: notification.health_finding_id,
    read_at: now,
    dismissed_at: args.dismissed ? now : notification.dismissed_at,
    updated_at: now,
  };
  const { error } = await supabase
    .from("notification_states")
    .upsert(payload, { onConflict: "workspace_id,notification_id" });
  if (error) throw new Error(`Notification state update failed: ${error.message || JSON.stringify(error)}`);

  return getWorkspaceNotification(supabase, {
    workspace_id: args.workspace_id,
    notification_id: args.notification_id,
  });
}

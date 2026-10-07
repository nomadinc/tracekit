export type NotificationSeverity = "critical" | "warning" | "info" | "healthy";
export type NotificationStatus = "unread" | "read" | "resolved" | "dismissed";
export type NotificationLifecycleState =
  | "not_applicable"
  | "needs_configuration"
  | "initializing"
  | "healthy"
  | "degraded"
  | "failing"
  | "resolved";
export type NotificationCategory =
  | "tracking"
  | "attribution"
  | "identity"
  | "journeys"
  | "revenue"
  | "commissions"
  | "integrations"
  | "platform";

export type TraceKitNotification = {
  id: string;
  type: NotificationCategory;
  lifecycle_state?: NotificationLifecycleState;
  severity: NotificationSeverity;
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
  timeline: Array<{
    label: string;
    timestamp: string;
    status: string;
    summary: string;
  }>;
  metadata: Record<string, any>;
};

export type NotificationsResponse = {
  ok?: boolean;
  workspace_id?: string;
  generated_at?: string;
  engine_version?: string;
  health?: {
    overall?: {
      score: number;
      status: "Healthy" | "Needs Attention" | "Critical";
      applicable_checks?: number;
      excluded_checks?: number;
      initializing_checks?: number;
      failing_checks?: number;
    };
  };
  counts?: {
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
  notifications?: TraceKitNotification[];
  next_cursor?: string | null;
  has_more?: boolean;
  governed_source?: "available";
};

const EMPTY_NOTIFICATION_COUNTS = { total: 0, unread: 0, read: 0, resolved: 0, dismissed: 0, critical: 0, warning: 0, info: 0, healthy: 0 };

export function normalizeNotificationsResponse(value: unknown): NotificationsResponse & {
  workspace_id: string;
  counts: NonNullable<NotificationsResponse["counts"]>;
  notifications: TraceKitNotification[];
  next_cursor: string | null;
  has_more: boolean;
  governed_source: "available";
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Notification Center failed to load.");
  const response = value as NotificationsResponse;
  if (response.ok === false || typeof response.workspace_id !== "string" || !response.workspace_id || response.governed_source !== "available" || !Array.isArray(response.notifications)) throw new Error("Notification Center failed to load.");
  const rawCounts = response.counts;
  if (!rawCounts || Object.keys(EMPTY_NOTIFICATION_COUNTS).some((key) => !Number.isFinite(Number(rawCounts[key as keyof typeof rawCounts])))) throw new Error("Notification Center failed to load.");
  return {
    ...response,
    workspace_id: response.workspace_id,
    governed_source: response.governed_source,
    counts: Object.fromEntries(Object.keys(EMPTY_NOTIFICATION_COUNTS).map((key) => [key, Number(rawCounts[key as keyof typeof rawCounts])])) as NonNullable<NotificationsResponse["counts"]>,
    notifications: response.notifications,
    next_cursor: typeof response.next_cursor === "string" ? response.next_cursor : null,
    has_more: response.has_more === true,
  };
}

export function notificationListState(input: { loading: boolean; error: string | null; notificationCount: number }) {
  if (input.error) return "error" as const;
  if (input.loading) return "loading" as const;
  return input.notificationCount > 0 ? "populated" as const : "empty" as const;
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  tracking: "Tracking",
  attribution: "Attribution",
  identity: "Identity",
  journeys: "Journeys",
  revenue: "Revenue",
  commissions: "Commissions",
  integrations: "Integrations",
  platform: "Platform",
};

export function notificationStatusLabel(status: NotificationStatus | string) {
  if (status === "unread") return "Unread";
  if (status === "read") return "Read";
  if (status === "resolved") return "Resolved";
  if (status === "dismissed") return "Dismissed";
  return String(status || "Unknown");
}

export function notificationSeverityLabel(severity: NotificationSeverity | string) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  if (severity === "info") return "Info";
  if (severity === "healthy") return "Healthy";
  return String(severity || "Unknown");
}

export function notificationLifecycleState(notification: TraceKitNotification) {
  return notification.lifecycle_state || notification.metadata?.lifecycle_state || "healthy";
}

export function notificationLifecycleLabel(lifecycle: NotificationLifecycleState | string) {
  if (lifecycle === "not_applicable") return "Not applicable";
  if (lifecycle === "needs_configuration") return "Needs configuration";
  if (lifecycle === "initializing") return "Initializing";
  if (lifecycle === "healthy") return "Healthy";
  if (lifecycle === "degraded") return "Degraded";
  if (lifecycle === "failing") return "Failing";
  if (lifecycle === "resolved") return "Resolved";
  return String(lifecycle || "Unknown");
}

export function notificationTimeAgo(value: string | null | undefined) {
  if (!value) return "Unknown time";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "Unknown time";
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

export function notificationQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/notifications${query ? `?${query}` : ""}`;
}

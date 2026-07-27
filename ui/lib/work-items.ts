export type WorkItemStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "dismissed";
export type WorkItemPriority = "urgent" | "high" | "normal" | "low";
export type WorkItemCategory = "identity" | "attribution" | "commissions" | "refunds" | "chargebacks" | "integrations" | "tracking" | "system";

export type WorkItem = {
  id: string;
  workspace_id: string;
  type: string;
  category: WorkItemCategory;
  source: string;
  source_key: string;
  title: string;
  summary: string;
  severity: "critical" | "warning" | "info" | "healthy";
  priority: WorkItemPriority;
  status: WorkItemStatus;
  lifecycle_state: string;
  assigned_to: string | null;
  related_person_id?: string | null;
  related_journey_id?: string | null;
  related_order_id?: string | null;
  related_conversion_id?: string | null;
  related_commission_id?: string | null;
  related_connector_id?: string | null;
  related_health_finding_id?: string | null;
  related_notification_id?: string | null;
  deep_link?: string | null;
  evidence: Record<string, any>;
  explanation?: {
    title: string;
    summary: string;
    statements: Array<{ id: string; text: string; evidence_type: string; evidence_ids: string[] }>;
    recommended_review_steps: string[];
    limitations: string[];
  };
  first_detected_at: string;
  last_detected_at: string;
  updated_at: string;
  resolved_at?: string | null;
  dismissed_at?: string | null;
  recurrence_count?: number;
};

export type WorkItemActivity = {
  id: string;
  activity_type: string;
  actor_id: string | null;
  body: string | null;
  metadata: Record<string, any>;
  created_at: string;
};

export type WorkItemListResponse = {
  ok: boolean;
  workspace_id: string;
  work_items: WorkItem[];
  next_cursor: string | null;
  has_more: boolean;
  summary?: {
    open: number;
    urgent: number;
    high: number;
    unassigned: number;
    resolved_today: number;
  };
  message?: string;
};

export type OperationsSummaryResponse = {
  ok: boolean;
  workspace_id: string;
  metrics: {
    open: number;
    urgent: number;
    high: number;
    unassigned: number;
    resolved_today: number;
  };
  queues: Array<{
    category: WorkItemCategory;
    label: string;
    open_count: number;
    high_priority_count: number;
    oldest_open_at: string | null;
    recent_change_at: string | null;
    deep_link: string;
  }>;
  message?: string;
};

export type WorkItemDetailResponse = {
  ok: boolean;
  workspace_id: string;
  work_item: WorkItem;
  activity: WorkItemActivity[];
  message?: string;
};

export const WORK_ITEM_CATEGORY_LABELS: Record<WorkItemCategory, string> = {
  identity: "Identity",
  attribution: "Attribution",
  commissions: "Commissions",
  refunds: "Refunds",
  chargebacks: "Chargebacks",
  integrations: "Integrations",
  tracking: "Tracking",
  system: "System",
};

export function workItemStatusLabel(status: string) {
  if (status === "in_progress") return "In progress";
  return status ? status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Unknown";
}

export function workItemPriorityLabel(priority: string) {
  return priority ? priority.replace(/\b\w/g, (char) => char.toUpperCase()) : "Normal";
}

export function workItemTimeAgo(value: string | null | undefined) {
  if (!value) return "Unknown";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Unknown";
  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

export function workItemQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/work-items${query ? `?${query}` : ""}`;
}

export function operationsSummaryQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/operations/summary${query ? `?${query}` : ""}`;
}

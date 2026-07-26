import type { WorkItem } from "@/lib/work-items";

export type HomeWindow = "today" | "last_7_days" | "month_to_date" | "last_30_days";

export type HomeActivity = {
  id: string;
  type: string;
  title: string;
  summary: string;
  occurred_at: string;
  tone: "critical" | "warning" | "info" | "success" | "neutral";
  person_id: string | null;
  order_id: string | null;
  work_item_id: string | null;
  connector_id: string | null;
  deep_link: string;
  metadata: Record<string, any>;
};

export type HomeSummaryResponse = {
  ok: boolean;
  workspace_id: string;
  generated_at: string;
  engine_version: string;
  window: {
    key: HomeWindow;
    from: string;
    to: string;
    label: string;
  };
  onboarding: {
    state: "new_workspace" | "initializing" | "active" | "degraded";
    workspace_name: string | null;
    primary_website_url: string | null;
    current_step: string;
    completed_steps: string[];
    total_steps: number;
    progress_percent: number;
    completed_at: string | null;
    next_steps: Array<{ id: string; label: string; deep_link: string }>;
  };
  operations: {
    metrics: {
      open: number;
      urgent: number;
      high: number;
      unassigned: number;
      resolved_today: number;
    };
    queues: Array<{
      category: string;
      label: string;
      open_count: number;
      high_priority_count: number;
      oldest_open_at: string | null;
      recent_change_at: string | null;
      deep_link: string;
    }>;
  };
  health: null | {
    overall: {
      score: number;
      status: string;
      applicable_checks: number;
      excluded_checks: number;
      initializing_checks: number;
      failing_checks: number;
    };
    counts: Record<string, number>;
    categories: Array<{
      category: string;
      label: string;
      score: number | null;
      status: string;
      lifecycle_state: string;
      severity: string;
      summary: string;
      metric_value: string | null;
      work_item_count: number;
      deep_link: string;
    }>;
  };
  revenue: {
    currency: string;
    order_count: number;
    gross_revenue: number;
    refunded_revenue: number;
    net_revenue: number;
    revenue_today: number;
    revenue_month_to_date: number;
    attributed_revenue: number;
    commission_generated: number;
    commission_paid: number;
  };
  attribution: {
    active_model: string | null;
    attributed_purchases: number;
    unattributed_purchases: number;
    attribution_coverage: number | null;
    attributed_revenue: number;
    top_affiliate: null | {
      affiliate_id: string;
      credited_revenue: number;
      conversions: number;
    };
    needs_review_count: number;
    deep_links: Record<string, string>;
  };
  recent_customers: any[];
  integrations: Array<{
    id: string;
    name: string;
    status: string;
    severity: string;
    summary: string;
    last_success_at: string | null;
    recent_failure_count: number;
    open_work_item_count: number;
    deep_link: string;
  }>;
  priority_work_items: WorkItem[];
  recent_activity: HomeActivity[];
  quick_actions: Array<{ label: string; href: string; tone: string }>;
  query_bounds: Record<string, number>;
  diagnostics?: {
    section_errors?: Array<{ section: string; error: string }>;
  };
  error?: string;
  message?: string;
};

export const HOME_WINDOWS: Array<{ key: HomeWindow; label: string }> = [
  { key: "today", label: "Today" },
  { key: "last_7_days", label: "7 Days" },
  { key: "month_to_date", label: "Month to Date" },
  { key: "last_30_days", label: "30 Days" },
];

export function homeQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `/api/home${query ? `?${query}` : ""}`;
}

export function formatHomeMoney(value: unknown, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return numeric.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
}

export function formatHomeNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-US");
}

export function formatHomePercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Not available";
  return `${numeric.toFixed(1)}%`;
}

export function homeTimeAgo(value: unknown) {
  const ms = Date.parse(String(value || ""));
  if (!Number.isFinite(ms)) return "Unknown";
  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

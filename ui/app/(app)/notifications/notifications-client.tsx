"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  Cable,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  Eye,
  Megaphone,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { EntityLink } from "@/components/shared/entity-link";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";
import {
  NOTIFICATION_CATEGORY_LABELS,
  notificationLifecycleLabel,
  notificationLifecycleState,
  notificationQuery,
  notificationSeverityLabel,
  notificationStatusLabel,
  notificationTimeAgo,
  type NotificationCategory,
  type NotificationSeverity,
  type NotificationStatus,
  type NotificationsResponse,
  type TraceKitNotification,
} from "@/lib/notifications";

const WORKSPACE_ID = "default";
const SEVERITIES: Array<NotificationSeverity | "all"> = ["all", "critical", "warning", "info", "healthy"];
const CATEGORIES: Array<NotificationCategory | "all"> = ["all", "tracking", "identity", "journeys", "attribution", "revenue", "commissions", "integrations", "platform"];
const STATUSES: Array<NotificationStatus | "all"> = ["all", "unread", "read", "resolved", "dismissed"];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>{children}</section>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p>
    </div>
  );
}

function categoryIcon(category: NotificationCategory | string) {
  if (category === "tracking") return Activity;
  if (category === "identity") return Users;
  if (category === "journeys") return Compass;
  if (category === "attribution") return Megaphone;
  if (category === "revenue" || category === "commissions") return CircleDollarSign;
  if (category === "integrations") return Cable;
  if (category === "platform") return ShieldCheck;
  return Bell;
}

function severityTone(severity: string) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (severity === "warning") return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100";
  if (severity === "info") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
}

function statusTone(status: string) {
  if (status === "unread") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  if (status === "resolved") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (status === "dismissed") return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  return "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
}

function dateFromFilter(value: string) {
  if (value === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (value === "7d" || value === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - (value === "7d" ? 7 : 30));
    return d.toISOString();
  }
  return null;
}

function compactEvidence(value: Record<string, any>) {
  const entries = Object.entries(value || {}).slice(0, 12);
  if (!entries.length) return [["status", "No structured evidence supplied."]];
  return entries.map(([key, item]) => [key, typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)]);
}

function NotificationRow({ notification, selected, onOpen }: {
  notification: TraceKitNotification;
  selected: boolean;
  onOpen: (notification: TraceKitNotification) => void;
}) {
  const Icon = categoryIcon(notification.type);
  const lifecycle = notificationLifecycleState(notification);
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400 ${selected ? "border-slate-900 ring-2 ring-slate-200 dark:border-white dark:ring-white/10" : "bg-white dark:bg-white/5"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${severityTone(notification.severity)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{notification.title}</span>
            {notification.status === "unread" ? <span className="h-2 w-2 rounded-full bg-blue-500" /> : null}
          </span>
          <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">{notification.summary}</span>
          <span className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-2 py-0.5 ${severityTone(notification.severity)}`}>{notificationSeverityLabel(notification.severity)}</span>
            <span className="rounded-full border px-2 py-0.5 text-slate-500 dark:border-white/10">{notificationLifecycleLabel(lifecycle)}</span>
            <span className={`rounded-full border px-2 py-0.5 ${statusTone(notification.status)}`}>{notificationStatusLabel(notification.status)}</span>
            <span className="rounded-full border px-2 py-0.5 text-slate-500 dark:border-white/10">{NOTIFICATION_CATEGORY_LABELS[notification.type]}</span>
            <span className="rounded-full border px-2 py-0.5 text-slate-500 dark:border-white/10">{notificationTimeAgo(notification.created_at)}</span>
          </span>
        </span>
        <span className="text-sm font-medium text-blue-600 dark:text-blue-300">Open</span>
      </div>
    </button>
  );
}

function DetailDrawer({ notification, onDismiss }: {
  notification: TraceKitNotification | null;
  onDismiss: (notification: TraceKitNotification) => void;
}) {
  if (!notification) {
    return (
      <Card className="sticky top-6 min-h-[36rem]">
        <EmptyState title="Select a notification" body="Open a notification to see evidence, timeline, and the affected workspace area." />
      </Card>
    );
  }
  const Icon = categoryIcon(notification.type);
  const lifecycle = notificationLifecycleState(notification);
  return (
    <Card className="sticky top-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${severityTone(notification.severity)}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{NOTIFICATION_CATEGORY_LABELS[notification.type]}</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{notification.title}</h2>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(notification.status)}`}>{notificationStatusLabel(notification.status)}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-3 ${severityTone(notification.severity)}`}>
          <div className="text-xs font-semibold uppercase tracking-wide">Severity</div>
          <div className="mt-1 font-semibold">{notificationSeverityLabel(notification.severity)}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</div>
          <div className="mt-1 font-semibold">{notificationLifecycleLabel(lifecycle)}</div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detected</div>
          <div className="mt-1 font-semibold">{notificationTimeAgo(notification.created_at)}</div>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <h3 className="font-semibold">Issue</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.summary}</p>
        </div>
        <div>
          <h3 className="font-semibold">Why this matters</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.why_it_matters}</p>
        </div>
        <div>
          <h3 className="font-semibold">Recommended action</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.recommended_action}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {notification.work_item_id ? (
            <EntityLink
              target={{ type: "work_item", id: notification.work_item_id, label: notification.title, query: { workspace_id: WORKSPACE_ID } }}
              href={`/operations?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&inspect=${encodeURIComponent(`work_item:${notification.work_item_id}`)}`}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950"
            >
              Open Work Item
              <Eye className="h-4 w-4" />
            </EntityLink>
          ) : (
            <Link href={notification.deep_link || "/overview"} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-white dark:text-slate-950">
              Open affected page
              <Eye className="h-4 w-4" />
            </Link>
          )}
          {notification.status !== "dismissed" && notification.status !== "resolved" ? (
            <button
              type="button"
              onClick={() => onDismiss(notification)}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
            >
              Dismiss
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <details className="rounded-xl border p-4 dark:border-white/10" open>
          <summary className="cursor-pointer font-semibold">Evidence</summary>
          <div className="mt-3 divide-y text-sm dark:divide-white/10">
            {compactEvidence(notification.evidence).map(([key, value]) => (
              <div key={key} className="grid gap-2 py-2 sm:grid-cols-[10rem_1fr]">
                <span className="font-medium text-slate-500">{key}</span>
                <span className="break-words text-slate-700 dark:text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </details>

        <details className="rounded-xl border p-4 dark:border-white/10" open>
          <summary className="cursor-pointer font-semibold">Timeline</summary>
          <div className="mt-4 space-y-4">
            {notification.timeline.map((item, index) => (
              <div key={`${item.timestamp}:${item.label}:${index}`} className="grid grid-cols-[5rem_1fr] gap-3 text-sm">
                <div className="text-slate-500">{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <div className="relative border-l pl-4 dark:border-white/10">
                  <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-blue-500" />
                  <div className="font-medium">{item.label}</div>
                  <div className="mt-1 text-slate-500 dark:text-slate-400">{item.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Card>
  );
}

export default function NotificationsClient() {
  const searchParams = useSearchParams();
  const initialNotificationId = searchParams.get("notification_id");
  const [severity, setSeverity] = React.useState<NotificationSeverity | "all">("all");
  const [category, setCategory] = React.useState<NotificationCategory | "all">("all");
  const [status, setStatus] = React.useState<NotificationStatus | "all">("all");
  const [dateRange, setDateRange] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [notifications, setNotifications] = React.useState<TraceKitNotification[]>([]);
  const [counts, setCounts] = React.useState<NotificationsResponse["counts"] | null>(null);
  const [selected, setSelected] = React.useState<TraceKitNotification | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const queryParams = React.useMemo(() => ({
    workspace_id: WORKSPACE_ID,
    limit: 25,
    severity: severity === "all" ? null : severity,
    category: category === "all" ? null : category,
    status: status === "all" ? null : status,
    from: dateFromFilter(dateRange),
    search: search.trim() || null,
  }), [category, dateRange, search, severity, status]);

  const load = React.useCallback(async (cursor: string | null = null, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(notificationQuery({ ...queryParams, cursor }), {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as NotificationsResponse;
      if (!res.ok || json?.ok === false) throw new Error((json as any)?.message || "Notification Center failed to load.");
      const rows = Array.isArray(json.notifications) ? json.notifications : [];
      setNotifications((current) => append ? [...current, ...rows] : rows);
      setCounts(json.counts || null);
      setNextCursor(json.next_cursor || null);
      setHasMore(Boolean(json.has_more));
      if (!append && !initialNotificationId && rows[0]) {
        setSelected(rows[0]);
      }
    } catch (err: any) {
      setError(err?.message || "Notification Center failed to load.");
    } finally {
      setLoading(false);
    }
  }, [initialNotificationId, queryParams]);

  const fetchNotificationById = React.useCallback(async (notificationId: string) => {
    const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) throw new Error(json?.message || "Notification lookup failed.");
    return json.notification as TraceKitNotification;
  }, []);

  const markRead = React.useCallback(async (notification: TraceKitNotification) => {
    if (notification.status !== "unread") return notification;
    const res = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}/read`, {
      method: "POST",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) throw new Error(json?.message || "Failed to mark notification read.");
    return json.notification as TraceKitNotification;
  }, []);

  const openNotification = React.useCallback(async (notification: TraceKitNotification) => {
    setSelected(notification);
    try {
      const updated = await markRead(notification);
      setSelected(updated);
      setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCounts((current) => current ? {
        ...current,
        unread: Math.max(0, current.unread - (notification.status === "unread" ? 1 : 0)),
        read: current.read + (notification.status === "unread" ? 1 : 0),
      } : current);
    } catch (err: any) {
      setError(err?.message || "Failed to mark notification read.");
    }
  }, [markRead]);

  const dismissNotification = React.useCallback(async (notification: TraceKitNotification) => {
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}/dismiss`, {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: WORKSPACE_ID }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.message || "Failed to dismiss notification.");
      const updated = json.notification as TraceKitNotification;
      setSelected(updated);
      setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      await load(null, false);
    } catch (err: any) {
      setError(err?.message || "Failed to dismiss notification.");
    }
  }, [load]);

  React.useEffect(() => {
    load(null, false);
  }, [load]);

  React.useEffect(() => {
    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== WORKSPACE_ID) return;
      if (update.type === "notification.created" || update.type === "health.changed" || update.type === "work_item.changed") {
        void load(null, false);
      }
    }
    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, [load]);

  React.useEffect(() => {
    if (!initialNotificationId) return;
    const requestedNotificationId = initialNotificationId;
    let cancelled = false;
    async function openInitial() {
      try {
        const notification = notifications.find((item) => item.id === requestedNotificationId) || await fetchNotificationById(requestedNotificationId);
        if (!cancelled) await openNotification(notification);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Notification lookup failed.");
      }
    }
    openInitial();
    return () => {
      cancelled = true;
    };
  }, [fetchNotificationById, initialNotificationId, notifications, openNotification]);

  const groupedCounts = counts || { critical: 0, warning: 0, info: 0, healthy: 0, unread: 0, read: 0, resolved: 0, dismissed: 0, total: 0 };

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr_28rem]">
      <aside className="space-y-4">
        <Card>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="font-semibold">Inbox</h2>
              <p className="text-sm text-slate-500">Health-powered operational notifications.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {[
              { label: "Critical", value: groupedCounts.critical, filter: "critical", tone: "critical" },
              { label: "Warnings", value: groupedCounts.warning, filter: "warning", tone: "warning" },
              { label: "Info", value: groupedCounts.info, filter: "info", tone: "info" },
              { label: "Resolved", value: groupedCounts.resolved, filter: "resolved", tone: "healthy" },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.filter === "resolved" ? setStatus("resolved") : setSeverity(item.filter as NotificationSeverity)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition hover:shadow-sm ${severityTone(item.tone)}`}
              >
                <span>{item.label}</span>
                <span className="font-semibold">{item.value}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Filters</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Severity</span>
              <select value={severity} onChange={(event) => setSeverity(event.target.value as any)} className="w-full rounded-xl border bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                {SEVERITIES.map((item) => <option key={item} value={item}>{item === "all" ? "All severities" : notificationSeverityLabel(item)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as any)} className="w-full rounded-xl border bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                {CATEGORIES.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : NOTIFICATION_CATEGORY_LABELS[item]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as any)} className="w-full rounded-xl border bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                {STATUSES.map((item) => <option key={item} value={item}>{item === "all" ? "Active inbox" : notificationStatusLabel(item)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date</span>
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
          </div>
        </Card>
      </aside>

      <main className="space-y-4">
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Notification Center</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Central operational inbox powered by the Health Engine.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications"
                className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-slate-300 dark:border-white/10 dark:bg-white/5"
              />
            </div>
          </div>
        </Card>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">{error}</div>
        ) : null}

        <div className="space-y-3">
          {notifications.length ? notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              selected={selected?.id === notification.id}
              onOpen={openNotification}
            />
          )) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-white/10" />)}
            </div>
          ) : (
            <EmptyState title="Everything looks healthy" body="No active notifications. Your marketing operation is running normally." />
          )}
        </div>

        {hasMore ? (
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            className="w-full rounded-xl border px-4 py-3 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5"
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </main>

      <DetailDrawer notification={selected} onDismiss={dismissNotification} />
    </div>
  );
}

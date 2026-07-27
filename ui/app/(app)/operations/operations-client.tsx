"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Filter,
  Loader2,
  MessageSquarePlus,
  PlayCircle,
  RefreshCw,
  Search,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  WORK_ITEM_CATEGORY_LABELS,
  operationsSummaryQuery,
  workItemPriorityLabel,
  workItemQuery,
  workItemStatusLabel,
  workItemTimeAgo,
  type OperationsSummaryResponse,
  type WorkItem,
  type WorkItemActivity,
  type WorkItemCategory,
  type WorkItemDetailResponse,
  type WorkItemListResponse,
  type WorkItemPriority,
  type WorkItemStatus,
} from "@/lib/work-items";
import { useInvestigation } from "@/components/investigation/investigation-context";
import { parseInspectValue } from "@/lib/entities";
import { LIVE_WORKSPACE_UPDATE_EVENT, type WorkspaceUpdate } from "@/lib/live";

const WORKSPACE_ID = "default";
const STATUSES: Array<WorkItemStatus | "all"> = ["all", "open", "acknowledged", "in_progress", "resolved", "dismissed"];
const PRIORITIES: Array<WorkItemPriority | "all"> = ["all", "urgent", "high", "normal", "low"];
const CATEGORIES: Array<WorkItemCategory | "all"> = ["all", "identity", "attribution", "commissions", "refunds", "chargebacks", "integrations", "tracking", "system"];

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/85 ${className}`}>{children}</section>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50 p-6 text-center dark:border-white/10 dark:bg-white/5">
      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{body}</p>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "open") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  if (status === "acknowledged") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  if (status === "in_progress") return "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-100";
  if (status === "resolved") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (status === "dismissed") return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  return "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200";
}

function priorityTone(priority: string) {
  if (priority === "urgent") return "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100";
  if (priority === "high") return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100";
  if (priority === "normal") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

function severityIcon(severity: string) {
  return severity === "critical" ? <XCircle className="h-4 w-4 text-red-500" /> : severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <Bell className="h-4 w-4 text-blue-500" />;
}

function compactId(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= 20) return text || "-";
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

async function fetchWorkItems(filters: Record<string, any>, cursor?: string | null) {
  const res = await fetch(workItemQuery({ ...filters, cursor: cursor || null }), {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Work Item list failed (${res.status})`);
  return body as WorkItemListResponse;
}

async function fetchSummary(workspaceId: string) {
  const res = await fetch(operationsSummaryQuery({ workspace_id: workspaceId }), {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Operations summary failed (${res.status})`);
  return body as OperationsSummaryResponse;
}

async function fetchWorkItemDetail(id: string, workspaceId: string) {
  const res = await fetch(`/api/work-items/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Work Item detail failed (${res.status})`);
  return body as WorkItemDetailResponse;
}

async function postWorkItemAction(id: string, action: string, body: Record<string, any>) {
  const res = await fetch(`/api/work-items/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJsonSafe(res);
  if (!res.ok) throw new Error(json?.message || json?.error || `${action} failed (${res.status})`);
  return json as WorkItemDetailResponse;
}

function SummaryKpis({ summary }: { summary: OperationsSummaryResponse | null }) {
  const metrics = summary?.metrics || { open: 0, urgent: 0, high: 0, unassigned: 0, resolved_today: 0 };
  const items = [
    ["Open", metrics.open, ClipboardList],
    ["Urgent", metrics.urgent, AlertTriangle],
    ["High", metrics.high, Clock3],
    ["Unassigned", metrics.unassigned, UserPlus],
    ["Resolved today", metrics.resolved_today, CheckCircle2],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(([label, value, Icon]: any) => (
        <div key={label} className="rounded-lg border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink/85">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{Number(value || 0).toLocaleString()}</div>
        </div>
      ))}
    </section>
  );
}

function QueueCards({ summary, onFilter }: { summary: OperationsSummaryResponse | null; onFilter: (category: WorkItemCategory) => void }) {
  const queues = summary?.queues || [];
  if (!queues.length) return <EmptyState title="Operations are clear" body="No open Work Items require attention." />;
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {queues.map((queue) => (
        <button key={queue.category} type="button" onClick={() => onFilter(queue.category)} className="rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:bg-ink/85">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{queue.label}</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{queue.open_count} open</div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${queue.high_priority_count ? priorityTone("high") : statusTone("resolved")}`}>
              {queue.high_priority_count} high
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Oldest {queue.oldest_open_at ? workItemTimeAgo(queue.oldest_open_at) : "-"}</span>
            <span className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-300">Review <ArrowRight className="h-3.5 w-3.5" /></span>
          </div>
        </button>
      ))}
    </section>
  );
}

function WorkItemRow({ item, selected, onOpen }: { item: WorkItem; selected: boolean; onOpen: (item: WorkItem) => void }) {
  const related = item.related_order_id || item.related_person_id || item.related_connector_id || item.related_health_finding_id || item.source_key;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`grid w-full gap-3 rounded-lg border p-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5 lg:grid-cols-[9rem_1fr_9rem_8rem_8rem_6rem] ${selected ? "border-slate-950 ring-2 ring-slate-200 dark:border-white dark:ring-white/20" : "bg-white dark:bg-white/5"}`}
    >
      <div className="flex flex-wrap gap-2 lg:block">
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${priorityTone(item.priority)}`}>{workItemPriorityLabel(item.priority)}</span>
        <span className="ml-0 inline-flex rounded-full border px-2 py-0.5 text-xs text-slate-500 dark:border-white/10 lg:ml-0 lg:mt-2">{item.severity}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold">
          {severityIcon(item.severity)}
          <span className="break-words">{item.title}</span>
        </div>
        <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.summary}</div>
        <div className="mt-2 text-xs text-slate-500">{compactId(related)}</div>
      </div>
      <div><span className="rounded-full border px-2 py-0.5 text-xs dark:border-white/10">{WORK_ITEM_CATEGORY_LABELS[item.category] || item.category}</span></div>
      <div><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(item.status)}`}>{workItemStatusLabel(item.status)}</span></div>
      <div className="text-sm text-slate-500">{item.assigned_to ? compactId(item.assigned_to) : "Unassigned"}</div>
      <div className="text-sm text-slate-500">{workItemTimeAgo(item.updated_at || item.first_detected_at)}</div>
    </button>
  );
}

function DetailPanel({
  detail,
  loading,
  error,
  onAction,
}: {
  detail: WorkItemDetailResponse | null;
  loading: boolean;
  error: string | null;
  onAction: (action: string, body?: Record<string, any>) => Promise<void>;
}) {
  const item = detail?.work_item || null;
  const activity = detail?.activity || [];
  const [note, setNote] = React.useState("");
  const [resolutionNote, setResolutionNote] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  async function run(action: string, body: Record<string, any> = {}) {
    if (!item) return;
    setBusy(action);
    setActionError(null);
    try {
      await onAction(action, body);
      if (action === "notes") setNote("");
      if (action === "resolve" || action === "dismiss") setResolutionNote("");
    } catch (err: any) {
      setActionError(err?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Card className="sticky top-6 min-h-[36rem]"><div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></Card>;
  }
  if (error) {
    return <Card className="sticky top-6"><p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{error}</p></Card>;
  }
  if (!item) {
    return <Card className="sticky top-6 min-h-[36rem]"><EmptyState title="Select a Work Item" body="Open an item to see evidence, activity, and workflow actions." /></Card>;
  }

  const active = ["open", "acknowledged", "in_progress"].includes(item.status);
  return (
    <Card className="sticky top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{WORK_ITEM_CATEGORY_LABELS[item.category]}</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(item.status)}`}>{workItemStatusLabel(item.status)}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-lg border p-3 ${priorityTone(item.priority)}`}>
          <div className="text-xs font-semibold uppercase tracking-wide">Priority</div>
          <div className="mt-1 font-semibold">{workItemPriorityLabel(item.priority)}</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle</div>
          <div className="mt-1 font-semibold">{workItemStatusLabel(item.lifecycle_state)}</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detected</div>
          <div className="mt-1 font-semibold">{workItemTimeAgo(item.first_detected_at)}</div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</div>
          <div className="mt-1 font-semibold">{item.assigned_to || "Unassigned"}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {item.status === "open" ? <button type="button" onClick={() => run("acknowledge", { workspace_id: WORKSPACE_ID })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Acknowledge</button> : null}
        {["open", "acknowledged"].includes(item.status) ? <button type="button" onClick={() => run("start", { workspace_id: WORKSPACE_ID })} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><PlayCircle className="h-4 w-4" /> Start work</button> : null}
        {["resolved", "dismissed"].includes(item.status) ? <button type="button" onClick={() => run("reopen", { workspace_id: WORKSPACE_ID })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Reopen</button> : null}
        <Link href={item.deep_link || "/operations"} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
          Open evidence
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
      {busy ? <p className="mt-3 text-xs text-slate-500">Saving {busy}...</p> : null}
      {actionError ? <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{actionError}</p> : null}

      <div className="mt-6 grid gap-3">
        <div className="rounded-lg border p-3 dark:border-white/10">
          <div className="text-sm font-semibold">Assignment</div>
          <div className="mt-3 flex gap-2">
            <input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="user id or email" className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent" />
            <button type="button" onClick={() => run("assign", { workspace_id: WORKSPACE_ID, assigned_to: assignee })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Assign</button>
          </div>
        </div>

        <div className="rounded-lg border p-3 dark:border-white/10">
          <div className="text-sm font-semibold">Priority</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRIORITIES.filter((priority) => priority !== "all").map((priority) => (
              <button key={priority} type="button" onClick={() => run("priority", { workspace_id: WORKSPACE_ID, priority })} className={`rounded-full border px-3 py-1 text-xs font-medium ${item.priority === priority ? priorityTone(priority) : "hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"}`}>{workItemPriorityLabel(priority)}</button>
            ))}
          </div>
        </div>

        {active ? (
          <div className="rounded-lg border p-3 dark:border-white/10">
            <div className="text-sm font-semibold">Resolution</div>
            <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Resolution note for dismissals; optional for resolved items." className="mt-3 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => run("resolve", { workspace_id: WORKSPACE_ID, resolution_code: "fixed", resolution_note: resolutionNote })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Resolve</button>
              <button type="button" onClick={() => run("dismiss", { workspace_id: WORKSPACE_ID, resolution_code: "not_actionable", resolution_note: resolutionNote })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">Dismiss</button>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border p-3 dark:border-white/10">
          <div className="text-sm font-semibold">Add note</div>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an investigation note." className="mt-3 min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent" />
          <button type="button" onClick={() => run("notes", { workspace_id: WORKSPACE_ID, body: note })} className="mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
            <MessageSquarePlus className="h-4 w-4" />
            Add note
          </button>
        </div>
      </div>

      <details className="mt-6 rounded-lg border p-4 dark:border-white/10" open>
        <summary className="cursor-pointer font-semibold">Explain This Work Item</summary>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.explanation?.summary}</p>
        <ol className="mt-3 space-y-2 text-sm">
          {(item.explanation?.statements || []).map((statement) => <li key={statement.id} className="rounded-md border p-2 dark:border-white/10">{statement.text}</li>)}
        </ol>
        <div className="mt-4">
          <div className="text-sm font-medium">What to review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            {(item.explanation?.recommended_review_steps || []).map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>
      </details>

      <details className="mt-4 rounded-lg border p-4 dark:border-white/10">
        <summary className="cursor-pointer font-semibold">Evidence</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.evidence || {}, null, 2)}</pre>
      </details>

      <details className="mt-4 rounded-lg border p-4 dark:border-white/10" open>
        <summary className="cursor-pointer font-semibold">Activity history</summary>
        <div className="mt-4 space-y-4">
          {activity.length ? activity.map((event: WorkItemActivity) => (
            <div key={event.id || `${event.activity_type}:${event.created_at}`} className="grid grid-cols-[5rem_1fr] gap-3 text-sm">
              <div className="text-slate-500">{workItemTimeAgo(event.created_at)}</div>
              <div className="relative border-l pl-4 dark:border-white/10">
                <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-blue-500" />
                <div className="font-medium">{workItemStatusLabel(event.activity_type)}</div>
                {event.body ? <div className="mt-1 text-slate-500 dark:text-slate-400">{event.body}</div> : null}
              </div>
            </div>
          )) : <p className="text-sm text-slate-500">No activity has been recorded yet.</p>}
        </div>
      </details>
    </Card>
  );
}

export default function OperationsClient() {
  const router = useRouter();
  const investigation = useInvestigation();
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = React.useState(searchParams.get("workspace_id") || WORKSPACE_ID);
  const [status, setStatus] = React.useState<WorkItemStatus | "all">((searchParams.get("status") as WorkItemStatus) || "all");
  const [priority, setPriority] = React.useState<WorkItemPriority | "all">((searchParams.get("priority") as WorkItemPriority) || "all");
  const [category, setCategory] = React.useState<WorkItemCategory | "all">((searchParams.get("category") as WorkItemCategory) || "all");
  const [assignedTo, setAssignedTo] = React.useState(searchParams.get("assigned_to") || "");
  const [search, setSearch] = React.useState(searchParams.get("search") || "");
  const [items, setItems] = React.useState<WorkItem[]>([]);
  const [summary, setSummary] = React.useState<OperationsSummaryResponse | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<WorkItem | null>(null);
  const [detail, setDetail] = React.useState<WorkItemDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const inspectTarget = parseInspectValue(searchParams.get("inspect"));
  const requestedWorkItemId = searchParams.get("work_item_id") || (inspectTarget?.type === "work_item" ? inspectTarget.id : null);

  const filters = React.useMemo(() => ({
    workspace_id: workspaceId,
    status: status === "all" ? null : status,
    priority: priority === "all" ? null : priority,
    category: category === "all" ? null : category,
    assigned_to: assignedTo,
    search,
    limit: 50,
  }), [workspaceId, status, priority, category, assignedTo, search]);

  function syncUrl(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    router.replace(`/operations${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const load = React.useCallback(async (reset = true, cursor: string | null = null) => {
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const [list, nextSummary] = await Promise.all([
        fetchWorkItems(filters, reset ? null : cursor),
        reset ? fetchSummary(workspaceId) : Promise.resolve(null),
      ]);
      setItems((prev) => reset ? list.work_items || [] : [...prev, ...(list.work_items || [])]);
      setNextCursor(list.next_cursor || null);
      setHasMore(Boolean(list.has_more));
      if (nextSummary) setSummary(nextSummary as OperationsSummaryResponse);
      if (reset) {
        const initial = requestedWorkItemId ? list.work_items?.find((item) => item.id === requestedWorkItemId) : list.work_items?.[0];
        setSelected(initial || null);
      }
    } catch (err: any) {
      setError(err?.message || "Operations failed to load.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, workspaceId, requestedWorkItemId]);

  React.useEffect(() => {
    load(true);
  }, [load]);

  React.useEffect(() => {
    if (!selected?.id) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    fetchWorkItemDetail(selected.id, workspaceId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: any) => {
        if (!cancelled) setDetailError(err?.message || "Work Item detail failed.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, workspaceId]);

  function openItem(item: WorkItem) {
    setSelected(item);
    investigation.open({ type: "work_item", id: item.id, label: item.title, query: { workspace_id: workspaceId } });
  }

  React.useEffect(() => {
    function onWorkItemMutated(event: Event) {
      const id = (event as CustomEvent<{ work_item_id?: string }>).detail?.work_item_id;
      if (!id) return;
      void load(true);
      if (selected?.id === id) {
        fetchWorkItemDetail(id, workspaceId)
          .then((data) => {
            setDetail(data);
            setSelected(data.work_item);
          })
          .catch(() => null);
      }
    }
    window.addEventListener("tracekit:work-item-mutated", onWorkItemMutated);
    return () => window.removeEventListener("tracekit:work-item-mutated", onWorkItemMutated);
  }, [load, selected?.id, workspaceId]);

  React.useEffect(() => {
    function onWorkspaceUpdate(event: Event) {
      const update = (event as CustomEvent<WorkspaceUpdate>).detail;
      if (!update || update.workspaceId !== workspaceId || update.type !== "work_item.changed") return;
      const id = update.entity?.type === "work_item" ? update.entity.id : null;
      void load(true);
      if (id && selected?.id === id) {
        fetchWorkItemDetail(id, workspaceId)
          .then((data) => {
            setDetail(data);
            setSelected(data.work_item);
          })
          .catch(() => null);
      }
    }
    window.addEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
    return () => window.removeEventListener(LIVE_WORKSPACE_UPDATE_EVENT, onWorkspaceUpdate);
  }, [load, selected?.id, workspaceId]);

  async function runAction(action: string, body: Record<string, any> = {}) {
    if (!selected?.id) return;
    const data = await postWorkItemAction(selected.id, action, { workspace_id: workspaceId, ...body });
    setDetail(data);
    setSelected(data.work_item);
    setItems((prev) => prev.map((item) => item.id === data.work_item.id ? data.work_item : item));
    const nextSummary = await fetchSummary(workspaceId).catch(() => null);
    if (nextSummary) setSummary(nextSummary);
  }

  function filterByCategory(nextCategory: WorkItemCategory) {
    setCategory(nextCategory);
    syncUrl({ category: nextCategory, status, priority, assigned_to: assignedTo, search, workspace_id: workspaceId });
  }

  return (
    <div className="min-h-full space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-500">Operations Center</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Operational Work Items</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Workflow records synchronized from Health, connectors, attribution, commissions, and customer evidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Workspace</span>
            <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value || WORKSPACE_ID)} className="w-40 rounded-md border bg-white px-3 py-2 dark:border-white/10 dark:bg-transparent" />
          </label>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <SummaryKpis summary={summary} />
      <QueueCards summary={summary} onFilter={filterByCategory} />

      <Card>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold">Work queue</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select value={status} onChange={(event) => { const value = event.target.value as WorkItemStatus | "all"; setStatus(value); syncUrl({ status: value }); }} className="rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent">
              {STATUSES.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : workItemStatusLabel(item)}</option>)}
            </select>
            <select value={priority} onChange={(event) => { const value = event.target.value as WorkItemPriority | "all"; setPriority(value); syncUrl({ priority: value }); }} className="rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent">
              {PRIORITIES.map((item) => <option key={item} value={item}>{item === "all" ? "All priorities" : workItemPriorityLabel(item)}</option>)}
            </select>
            <select value={category} onChange={(event) => { const value = event.target.value as WorkItemCategory | "all"; setCategory(value); syncUrl({ category: value }); }} className="rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent">
              {CATEGORIES.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : WORK_ITEM_CATEGORY_LABELS[item]}</option>)}
            </select>
            <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} onBlur={() => syncUrl({ assigned_to: assignedTo })} placeholder="Assignee" className="rounded-md border bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} onBlur={() => syncUrl({ search })} placeholder="Search" className="w-full rounded-md border bg-white py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-transparent" />
            </div>
          </div>
        </div>
      </Card>

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <div className="min-w-0 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />)}
            </div>
          ) : items.length ? (
            <>
              {items.map((item) => <WorkItemRow key={item.id} item={item} selected={selected?.id === item.id} onOpen={openItem} />)}
              {hasMore ? (
                <button type="button" onClick={() => load(false, nextCursor)} disabled={loadingMore} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load more
                </button>
              ) : null}
            </>
          ) : (
            <EmptyState title="No Work Items match the selected filters" body="Try clearing a filter or check again after the next Health or runtime synchronization." />
          )}
        </div>

        <DetailPanel detail={detail} loading={detailLoading} error={detailError} onAction={runAction} />
      </div>
    </div>
  );
}

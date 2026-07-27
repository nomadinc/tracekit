"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  compactEventId,
  eventPipelinePercent,
  eventStatusTone,
  formatEventMoney,
  formatEventTime,
  type EventExplorerStatusTone,
} from "@/lib/event-explorer";

type EventRow = {
  event_key: string;
  event_id: string;
  event_type: string;
  status: string;
  source: string;
  timestamp: string;
  event_time: string;
  browser_or_server: "browser" | "server";
  person_id?: string | null;
  person?: { display_name?: string | null; email?: string | null; phone?: string | null } | null;
  journey_id?: string | null;
  affiliate_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  attribution_status?: string | null;
  commission_status?: string | null;
};

type ListResponse = {
  ok: boolean;
  events: EventRow[];
  next_cursor?: string | null;
  has_more?: boolean;
  message?: string;
};

type DetailResponse = {
  ok: boolean;
  event: EventRow;
  summary: any;
  identity: any;
  journey: any;
  attribution: any;
  commission: any;
  technical: {
    raw_payload?: any;
    normalized_payload?: any;
    processing_timeline?: any[];
  };
  message?: string;
};

const EVENT_TYPES = ["", "page_view", "identify", "click", "lead_created", "checkout_started", "purchase", "refund", "chargeback", "custom"];
const STATUSES = ["", "pending", "processing", "normalized", "review", "error", "invalid", "unsupported", "duplicate"];
const SOURCES = ["", "browser_sdk", "public_event_api", "browser", "shopify", "paypal", "konnektive", "wowboost", "wowsuite"];

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

function queryString(filters: Record<string, any>, cursor?: string | null) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

async function fetchEventList(filters: Record<string, any>, cursor?: string | null) {
  const res = await fetch(`/api/events?${queryString(filters, cursor)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Event lookup failed (${res.status})`);
  return body as ListResponse;
}

async function fetchEventDetail(eventKey: string, workspaceId: string) {
  const res = await fetch(`/api/events/${encodeURIComponent(eventKey)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Event detail failed (${res.status})`);
  return body as DetailResponse;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: EventExplorerStatusTone }) {
  const cls = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    bad: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
    neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function textOrDash(value: unknown) {
  const text = String(value || "").trim();
  return text || "-";
}

export default function EventsExplorerClient() {
  const [workspaceId, setWorkspaceId] = React.useState("default");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [eventType, setEventType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [source, setSource] = React.useState("");
  const [affiliate, setAffiliate] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [journey, setJourney] = React.useState("");
  const [origin, setOrigin] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [needsReview, setNeedsReview] = React.useState(false);
  const [normalized, setNormalized] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [dir, setDir] = React.useState<"desc" | "asc">("desc");
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = React.useState<EventRow | null>(null);
  const [detail, setDetail] = React.useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const filters = React.useMemo(() => ({
    workspace_id: workspaceId,
    from,
    to,
    event_type: eventType,
    status,
    source,
    affiliate_id: affiliate,
    person_id: person,
    journey_id: journey,
    origin,
    search,
    needs_review: needsReview,
    normalized,
    failed,
    dir,
    limit: 50,
  }), [workspaceId, from, to, eventType, status, source, affiliate, person, journey, origin, search, needsReview, normalized, failed, dir]);

  const load = React.useCallback(async (reset = true, cursor: string | null = null) => {
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await fetchEventList(filters, reset ? null : cursor);
      setEvents((current) => reset ? data.events || [] : [...current, ...(data.events || [])]);
      setNextCursor(data.next_cursor || null);
      setHasMore(Boolean(data.has_more && data.next_cursor));
    } catch (err: any) {
      setError(err?.message || "Event Explorer failed.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  React.useEffect(() => {
    load(true);
  }, [load]);

  async function openDetail(event: EventRow) {
    setSelectedEvent(event);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchEventDetail(event.event_key, workspaceId));
    } catch (err: any) {
      setDetailError(err?.message || "Event detail failed.");
    } finally {
      setDetailLoading(false);
    }
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setEventType("");
    setStatus("");
    setSource("");
    setAffiliate("");
    setPerson("");
    setJourney("");
    setOrigin("");
    setSearch("");
    setNeedsReview(false);
    setNormalized(false);
    setFailed(false);
    setDir("desc");
  }

  return (
    <div className="min-h-full space-y-5">
      <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Event Explorer</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-6">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Workspace</span>
            <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value || "default")} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Event type</span>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              {EVENT_TYPES.map((value) => <option key={value} value={value}>{value || "All types"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              {STATUSES.map((value) => <option key={value} value={value}>{value || "All statuses"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              {SOURCES.map((value) => <option key={value} value={value}>{value || "All sources"}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Search</span>
            <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 dark:bg-transparent">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Event, person, TKID, journey, affiliate" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </div>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Affiliate</span>
            <input value={affiliate} onChange={(e) => setAffiliate(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Person</span>
            <input value={person} onChange={(e) => setPerson(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Journey</span>
            <input value={journey} onChange={(e) => setJourney(e.target.value)} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-transparent" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Sort</span>
            <select value={dir} onChange={(e) => setDir(e.target.value === "asc" ? "asc" : "desc")} className="w-full rounded-md border bg-white px-3 py-2 dark:bg-ink">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setOrigin(origin === "browser" ? "" : "browser")} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${origin === "browser" ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
            <Filter className="h-4 w-4" />
            Browser
          </button>
          <button type="button" onClick={() => setOrigin(origin === "server" ? "" : "server")} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${origin === "server" ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
            Server
          </button>
          {[
            ["Needs Review", needsReview, setNeedsReview],
            ["Normalized", normalized, setNormalized],
            ["Failed", failed, setFailed],
          ].map(([label, checked, setter]: any) => (
            <label key={label} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-ink/80">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="text-sm font-medium">{events.length.toLocaleString()} event{events.length === 1 ? "" : "s"} loaded</div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
        </div>

        {error ? (
          <div className="m-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : null}

        {!loading && !error && !events.length ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center">
            <Clock3 className="h-8 w-8 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold">No events found</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">Try widening the date range or clearing the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Journey</th>
                  <th className="px-4 py-3">Affiliate</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Attribution</th>
                  <th className="px-4 py-3">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((event) => (
                  <tr key={event.event_key} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => openDetail(event)}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div>{formatEventTime(event.timestamp)}</div>
                      <div className="font-mono text-xs text-slate-500">{compactEventId(event.event_id)}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{event.event_type}</td>
                    <td className="px-4 py-3"><Badge tone={eventStatusTone(event.status)}>{event.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div>{event.source}</div>
                      <div className="text-xs text-slate-500">{event.browser_or_server}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-44 truncate">{event.person?.display_name || event.person?.email || compactEventId(event.person_id)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{compactEventId(event.journey_id)}</td>
                    <td className="px-4 py-3">{textOrDash(event.affiliate_id)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatEventMoney(event.amount, event.currency) || "-"}</td>
                    <td className="px-4 py-3"><Badge tone={eventStatusTone(event.attribution_status)}>{event.attribution_status || "not_applicable"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={eventStatusTone(event.commission_status)}>{event.commission_status || "not_commissioned"}</Badge>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore ? (
          <div className="border-t p-4 text-center">
            <button type="button" disabled={loadingMore} onClick={() => load(false, nextCursor)} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-white/5">
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDown className="h-4 w-4" />}
              Load more
            </button>
          </div>
        ) : null}
      </section>

      {selectedEvent ? (
        <EventDetailDrawer
          event={selectedEvent}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setSelectedEvent(null);
            setDetail(null);
            setDetailError(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EventDetailDrawer({ event, detail, loading, error, onClose }: { event: EventRow; detail: DetailResponse | null; loading: boolean; error: string | null; onClose: () => void }) {
  const timeline = detail?.technical?.processing_timeline || [];
  const percent = eventPipelinePercent(timeline);
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close event detail" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l bg-white shadow-2xl dark:bg-ink">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 p-5 backdrop-blur dark:bg-ink/95">
          <div>
            <h2 className="text-lg font-semibold">{event.event_type}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{event.event_key}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border p-2 hover:bg-slate-50 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading event detail
            </div>
          ) : null}
          {error ? (
            <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <div>{error}</div>
            </div>
          ) : null}

          <DetailSection title="Summary">
            <DetailGrid rows={[
              ["Event Type", detail?.summary?.event_type || event.event_type],
              ["Time", formatEventTime(detail?.summary?.time || event.timestamp)],
              ["Status", detail?.summary?.status || event.status],
            ]} />
          </DetailSection>

          <DetailSection title="Identity">
            <DetailGrid rows={[
              ["Person", detail?.identity?.person?.display_name || compactEventId(event.person_id)],
              ["Email", detail?.identity?.email || event.person?.email || "-"],
              ["Phone", detail?.identity?.phone || event.person?.phone || "-"],
              ["TKID", detail?.identity?.tkid || "-"],
              ["Session", detail?.identity?.session_id || "-"],
            ]} />
          </DetailSection>

          <DetailSection title="Journey">
            <DetailGrid rows={[
              ["Journey ID", detail?.journey?.journey_id || event.journey_id || "-"],
              ["Previous Event", detail?.journey?.previous_event ? `${detail.journey.previous_event.event_type} · ${formatEventTime(detail.journey.previous_event.event_time)}` : "-"],
              ["Next Event", detail?.journey?.next_event ? `${detail.journey.next_event.event_type} · ${formatEventTime(detail.journey.next_event.event_time)}` : "-"],
            ]} />
          </DetailSection>

          <DetailSection title="Attribution">
            <DetailGrid rows={[
              ["Winning Touch", detail?.attribution?.winning_touch?.touchpoint_event_id || "-"],
              ["Attribution Model", detail?.attribution?.winning_touch?.model || "-"],
              ["Credit Amount", detail?.attribution?.winning_touch ? formatEventMoney(detail.attribution.winning_touch.credit_amount, detail.attribution.winning_touch.currency) : "-"],
            ]} />
          </DetailSection>

          <DetailSection title="Commission">
            <div className="grid gap-3 sm:grid-cols-3">
              {["draft", "approved", "paid"].map((status) => {
                const count = (detail?.commission?.commissions || []).filter((commission: any) => commission.status === status).length;
                return (
                  <div key={status} className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{status}</div>
                    <div className="mt-1 text-xl font-semibold">{count}</div>
                  </div>
                );
              })}
            </div>
          </DetailSection>

          <DetailSection title="Timeline">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-4 grid gap-3">
              {timeline.map((stage: any, index: number) => (
                <div key={stage.name} className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${stage.status === "complete" ? "bg-emerald-50 text-emerald-700" : stage.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"}`}>
                    {stage.status === "complete" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{stage.name}</div>
                    <div className="text-xs text-slate-500">{stage.timestamp ? formatEventTime(stage.timestamp) : "Pending"}{stage.duration_ms ? ` · ${Math.round(stage.duration_ms / 1000)}s after prior stage` : ""}</div>
                  </div>
                  {index < timeline.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-300" /> : null}
                </div>
              ))}
            </div>
          </DetailSection>

          <DetailSection title="Technical">
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Raw Payload</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(detail?.technical?.raw_payload || null, null, 2)}</pre>
            </details>
            <details className="mt-3 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Normalized Payload</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(detail?.technical?.normalized_payload || null, null, 2)}</pre>
            </details>
            <details className="mt-3 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Processing Timeline</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(timeline, null, 2)}</pre>
            </details>
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium">{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ui/app/(app)/journeys/page.tsx
import { EntityLink } from "@/components/shared/entity-link";
import { LiveRouteRefresh } from "@/components/live/live-route-refresh";

type EventExplorerItem = {
  event_key?: string | null;
  record_id?: string | null;
  journey_id?: string | null;
  person_id?: string | null;
  person?: { id?: string | null; display_name?: string | null; email?: string | null } | null;
  timestamp?: string | null;
  event_time?: string | null;
  event_type?: string | null;
  source?: string | null;
  affiliate_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  attribution_status?: string | null;
  commission_status?: string | null;
  status?: string | null;
  tkid?: string | null;
};

type EventsResponse = {
  ok: boolean;
  events: EventExplorerItem[];
};

type Journey = {
  id: string;
  person_id: string | null;
  person_label: string | null;
  source: string | null;
  affiliate_id: string | null;
  first_seen: string | null;
  last_seen: string | null;
  event_count: number;
  purchase_count: number;
  revenue: number;
  currency: string;
  attribution_status: string | null;
  commission_status: string | null;
  tkid: string | null;
};

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(process.env.TK_SECRET_KEY || process.env.TRACEKIT_TK_SECRET || "").trim();
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 400) };
  }
}

async function currentApiGet<T>(pathAndQuery: string): Promise<T> {
  const secret = adminSecret();
  if (!secret) throw new Error("TK_SECRET_KEY is required on the UI server for Journey Explorer requests.");
  const res = await fetch(`${apiBaseUrl()}${pathAndQuery}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-tk-secret": secret,
    },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `API ${res.status}`);
  return body as T;
}

function eventTime(event: EventExplorerItem) {
  return event.event_time || event.timestamp || null;
}

function amountValue(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildJourneyList(events: EventExplorerItem[]) {
  const byJourney = new Map<string, Journey>();
  for (const event of events) {
    const id = String(event.journey_id || "").trim();
    if (!id) continue;
    const time = eventTime(event);
    const current = byJourney.get(id) || {
      id,
      person_id: event.person_id || event.person?.id || null,
      person_label: event.person?.display_name || event.person?.email || event.person_id || null,
      source: event.source || null,
      affiliate_id: event.affiliate_id || null,
      first_seen: time,
      last_seen: time,
      event_count: 0,
      purchase_count: 0,
      revenue: 0,
      currency: event.currency || "USD",
      attribution_status: event.attribution_status || null,
      commission_status: event.commission_status || null,
      tkid: event.tkid || null,
    };
    current.event_count += 1;
    if (time && (!current.first_seen || Date.parse(time) < Date.parse(current.first_seen))) current.first_seen = time;
    if (time && (!current.last_seen || Date.parse(time) > Date.parse(current.last_seen))) current.last_seen = time;
    if (!current.person_id) current.person_id = event.person_id || event.person?.id || null;
    if (!current.person_label) current.person_label = event.person?.display_name || event.person?.email || event.person_id || null;
    if (!current.source && event.source) current.source = event.source;
    if (!current.affiliate_id && event.affiliate_id) current.affiliate_id = event.affiliate_id;
    if (!current.tkid && event.tkid) current.tkid = event.tkid;
    if (event.currency) current.currency = event.currency;
    if (event.attribution_status === "attributed") current.attribution_status = event.attribution_status;
    else if (!current.attribution_status && event.attribution_status) current.attribution_status = event.attribution_status;
    if (event.commission_status && event.commission_status !== "not_commissioned") current.commission_status = event.commission_status;
    else if (!current.commission_status && event.commission_status) current.commission_status = event.commission_status;
    if (["purchase", "upsell", "subscription_started", "subscription_renewed"].includes(String(event.event_type || ""))) {
      current.purchase_count += 1;
      current.revenue += amountValue(event.amount);
    }
    byJourney.set(id, current);
  }
  return Array.from(byJourney.values()).sort((a, b) =>
    Date.parse(b.last_seen || "") - Date.parse(a.last_seen || "") || a.id.localeCompare(b.id)
  );
}

function formatTime(value: string | null) {
  if (!value) return "Unknown";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function formatMoney(amount: number, currency = "USD") {
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default async function JourneysPage({ searchParams }: Props) {
  const sp = await searchParams;
  const workspaceId = typeof sp.workspace_id === "string" ? sp.workspace_id : "default";

  let journeys: Journey[] = [];
  let error: string | null = null;

  try {
    const json = await currentApiGet<EventsResponse>(`/v1/events?workspace_id=${encodeURIComponent(workspaceId)}&limit=100&normalized=true&dir=desc`);
    if (!json.ok) throw new Error("API returned not ok");
    journeys = buildJourneyList(json.events || []);
  } catch (e: any) {
    console.error("[Journeys] failed to load", e);
    error = e?.message ?? "Failed to load journeys";
  }

  const sourceFilter = typeof sp.source === "string" ? sp.source : "";
  const hasOrdersOnly = typeof sp.hasOrders === "string" && sp.hasOrders === "1";
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  const allSources = Array.from(new Set(journeys.map((j) => (j.source ?? "").trim()).filter(Boolean))).sort();

  const filtered = journeys.filter((j) => {
    if (sourceFilter && (j.source ?? "") !== sourceFilter) return false;
    if (hasOrdersOnly && j.purchase_count < 1) return false;
    if (query) {
      const hay = `${j.id} ${j.person_id ?? ""} ${j.person_label ?? ""} ${j.source ?? ""} ${j.affiliate_id ?? ""} ${j.tkid ?? ""}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  // --------- Render ---------
  return (
    <div className="p-6 space-y-4 text-sm text-slate-900 dark:text-slate-100">
      <LiveRouteRefresh workspaceId={workspaceId} types={["entity.changed", "metric.changed", "activity.created", "activity.updated"]} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Journeys</h1>
          <div className="text-xs text-slate-500">
            {filtered.length} shown {journeys.length ? `(${journeys.length} total)` : ""}
          </div>
        </div>

        {/* Simple filter UI (keep/replace with your existing controls if you have them) */}
        <div className="flex items-center gap-2 flex-wrap">
          <form className="flex items-center gap-2">
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search journey / person"
              className="h-9 w-56 rounded-md border px-3 text-sm bg-white dark:bg-slate-950"
            />

            <select
              name="source"
              defaultValue={sourceFilter}
              className="h-9 rounded-md border px-2 text-sm bg-white dark:bg-slate-950"
            >
              <option value="">All sources</option>
              {allSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="hasOrders"
                value="1"
                defaultChecked={hasOrdersOnly}
              />
              Has orders
            </label>

            <button className="h-9 rounded-md border px-3 text-sm">
              Apply
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Journeys feed unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-900/40">
          <div className="col-span-4">Journey</div>
          <div className="col-span-2">Person</div>
          <div className="col-span-2">Last Seen</div>
          <div className="col-span-1">Events</div>
          <div className="col-span-2">Revenue</div>
          <div className="col-span-1 text-right">View</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No journeys found.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((j) => (
              <div key={j.id} className="grid grid-cols-12 px-3 py-2 items-center gap-2">
                <div className="col-span-4 min-w-0">
                  <div className="font-mono text-xs truncate">{j.id}</div>
                  <div className="text-[11px] text-slate-500 truncate">{j.source || "Unknown source"}{j.affiliate_id ? ` · ${j.affiliate_id}` : ""}</div>
                </div>
                <div className="col-span-2 text-xs truncate">{j.person_label || j.person_id || "Unlinked"}</div>
                <div className="col-span-2 text-xs">{formatTime(j.last_seen)}</div>
                <div className="col-span-1 text-xs">{j.event_count}</div>
                <div className="col-span-2 text-xs">{j.purchase_count ? formatMoney(j.revenue, j.currency) : "—"}</div>
                <div className="col-span-1 text-right">
                  <EntityLink
                    target={{ type: "journey", id: j.id, label: "Customer Journey", query: { workspace_id: workspaceId } }}
                    href={`/journeys/${encodeURIComponent(j.id)}?workspace_id=${encodeURIComponent(workspaceId)}`}
                    className="text-xs underline"
                  >
                    Open
                  </EntityLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

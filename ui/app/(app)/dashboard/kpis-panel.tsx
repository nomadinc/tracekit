"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { KpiCard } from "@/components/ui/kpi-card";
import { TimeIntervalPicker } from "@/components/time-interval-picker";
import { apiGetJson, apiPostJson } from "@/lib/api";

type Kpis = {
  gross_sales: number;
  gross_sales_delta_pct: number;

  net_profit: number;
  net_margin: number;

  refund_rate: number;
  refund_rate_delta_pp: number;

  chargebacks: number;
  chargebacks_delta_pp: number;
};

// ---------- date helpers ----------
function isoDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmdLocal(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ---------- formatting ----------
function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPctFromRatio(r: number, digits = 1) {
  return `${(r * 100).toFixed(digits)}%`;
}

// ---------- KPI DELTA (pill) helpers ----------
function DeltaHelper({
  text,
  direction,
  tooltip = "Compared to previous period",
}: {
  text: string;
  direction: "up" | "down" | "flat";
  tooltip?: string;
}) {
  const styles =
    direction === "up"
      ? { pill: "bg-emerald-50 text-emerald-700", arrow: "↑" }
      : direction === "down"
      ? { pill: "bg-rose-50 text-rose-700", arrow: "↓" }
      : { pill: "bg-gray-100 text-gray-600", arrow: "→" };

  const id = React.useId();

  return (
    <span className="relative inline-flex group align-middle">
      <span
        tabIndex={0}
        aria-describedby={id}
        className={[
          "inline-flex items-center gap-1.5",
          "rounded-full px-2 py-0.5",
          "text-xs font-medium",
          "cursor-help select-none",
          "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-black/40",
          styles.pill,
        ].join(" ")}
      >
        <span className="leading-none">{styles.arrow}</span>
        <span>{text}</span>
      </span>

      <span
        id={id}
        role="tooltip"
        className={[
          "pointer-events-none absolute z-30",
          "top-full mt-2",
          "left-0 translate-x-0",
          "max-w-[320px]",
          "whitespace-normal sm:whitespace-nowrap",
          "rounded-md px-2.5 py-1.5",
          "text-[11px] leading-tight",
          "bg-black text-white shadow-lg",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
        ].join(" ")}
      >
        <span
          className={["absolute -top-1 left-3", "h-2 w-2 rotate-45", "bg-black"].join(" ")}
          aria-hidden="true"
        />
        {tooltip}
      </span>
    </span>
  );
}

function deltaDirection(n: number, eps = 1e-9): "up" | "down" | "flat" {
  if (n > eps) return "up";
  if (n < -eps) return "down";
  return "flat";
}

function helperDeltaPct(deltaRatio: number) {
  const pct = deltaRatio * 100;
  const dir = deltaDirection(pct, 0.0001);
  const text = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return <DeltaHelper text={text} direction={dir} />;
}

function helperDeltaPp(deltaRatio: number) {
  const pp = deltaRatio * 100;
  const dir = deltaDirection(pp, 0.0001);
  const text = `${pp >= 0 ? "+" : ""}${pp.toFixed(2)}pp`;
  return <DeltaHelper text={text} direction={dir} />;
}

/** ===== Last import (MVP: localStorage) =====
 * Must match the Integration page key.
 */


type DashboardLastImportState = {
  platform: "checkoutchamp";
  from: string;
  to: string;
  fetched: number;
  upserted: number;
  pages: number;
  importedAt: string; // ISO
};

function safeLoadLastImport(): DashboardLastImportState | null {
  try {
    const raw = localStorage.getItem(LAST_IMPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || v.platform !== "checkoutchamp" || !v.from || !v.to || !v.importedAt) return null;
    return {
      platform: "checkoutchamp",
      from: String(v.from),
      to: String(v.to),
      fetched: Number(v.fetched ?? 0),
      upserted: Number(v.upserted ?? 0),
      pages: Number(v.pages ?? 0),
      importedAt: String(v.importedAt),
    };
  } catch {
    return null;
  }
}

function safeSaveLastImport(v: DashboardLastImportState) {
  try {
    localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(v));
  } catch {}
}

const LAST_IMPORT_KEY = "tracekit:lastImport:checkoutchamp";

type LastImportState = {
  platform: "checkoutchamp";
  from: string;
  to: string;
  fetched: number;
  upserted: number;
  pages: number;
  importedAt: string;
};



function timeAgoShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "unknown";
  const ms = Date.now() - t;
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------- component ----------
export function KpisPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasBootstrappedUrl = React.useRef(false);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [lastImport, setLastImport] = React.useState<LastImportState | null>(null);
  
  React.useEffect(() => {
	  try {
	    const li = safeLoadLastImport();
	    setLastImport(li);
	  } catch {}
	}, []);

  // init range from URL (shareable) or undefined (we’ll choose on client)
  const [range, setRange] = React.useState<{ from?: Date; to?: Date }>(() => {
    const fromQ = parseYmdLocal(searchParams?.get("from") ?? null);
    const toQ = parseYmdLocal(searchParams?.get("to") ?? null);

    if (fromQ) {
      const from = startOfDay(fromQ);
      const to = endOfDay(toQ ?? fromQ);
      return { from, to };
    }

    // IMPORTANT: don't use new Date() here (server vs client mismatch)
    return { from: undefined, to: undefined };
  });

  // Client-only: decide default range when URL is empty
  React.useEffect(() => {
    if (!mounted) return;
    if (range.from) return; // URL already set or already initialized

    // 1) Prefer last import range (closes the loop)
    const li = safeLoadLastImport();
    if (li) {
      setLastImport(li);

      const fromD = parseYmdLocal(li.from);
      const toD = parseYmdLocal(li.to);
      if (fromD) {
        setRange({ from: startOfDay(fromD), to: endOfDay(toD ?? fromD) });
        return;
      }
    }

    // 2) Else default to last 7 days
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    setRange({ from: startOfDay(from), to: endOfDay(now) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Also load last import for freshness banner even if URL already had a range
  React.useEffect(() => {
    if (!mounted) return;
    const li = safeLoadLastImport();
    if (li) setLastImport(li);
  }, [mounted]);

  const [kpis, setKpis] = React.useState<Kpis | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [importing, setImporting] = React.useState(false);

  // If user loads a shared URL or edits querystring, sync to state
  React.useEffect(() => {
    const fromQ = parseYmdLocal(searchParams.get("from"));
    const toQ = parseYmdLocal(searchParams.get("to"));
    if (!fromQ) return;

    const nextFrom = startOfDay(fromQ);
    const nextTo = endOfDay(toQ ?? fromQ);

    const curFrom = range.from ? startOfDay(range.from).getTime() : null;
    const curTo = range.to ? startOfDay(range.to).getTime() : null;

    if (
      curFrom !== startOfDay(nextFrom).getTime() ||
      curTo !== startOfDay(nextTo).getTime()
    ) {
      setRange({ from: nextFrom, to: nextTo });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Write current range -> URL (shareable)
  React.useEffect(() => {
    if (!range.from) return;

    const from = isoDateLocal(range.from);
    const to = isoDateLocal(range.to ?? range.from);

    const params = new URLSearchParams(searchParams.toString());
    const prevFrom = params.get("from");
    const prevTo = params.get("to");

    // On first load, if URL has no params, write defaults once
    if (!hasBootstrappedUrl.current) {
      hasBootstrappedUrl.current = true;
      if (!prevFrom) {
        params.set("from", from);
        params.set("to", to);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
      return;
    }

    // Normal updates after user changes range
    if (prevFrom !== from || prevTo !== to) {
      params.set("from", from);
      params.set("to", to);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from?.getTime(), range?.to?.getTime(), pathname, router]);

  async function refetchKpisForRange() {
    if (!range.from) return;
    const from = isoDateLocal(range.from);
    const to = isoDateLocal(range.to ?? range.from);

    const data = await apiGetJson<Kpis>(
      `/v1/kpis?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    setKpis(data);
  }

  async function handleImportCheckoutChamp() {
    if (!range.from) return;

    const from = isoDateLocal(range.from);
    const to = isoDateLocal(range.to ?? range.from);

    try {
      setImporting(true);
      setError(null);

      const res: any = await apiPostJson(
        "/v1/integrations/checkoutchamp/import-orders",
        { from, to }
      );

      // Persist a dashboard-visible freshness marker regardless of response shape
      const li: LastImportState = {
        platform: "checkoutchamp",
        from,
        to,
        fetched: Number(res?.fetched ?? 0),
        upserted: Number(res?.upserted ?? 0),
        pages: Number(res?.pages ?? 0),
        importedAt: new Date().toISOString(),
      };

      if (mounted) safeSaveLastImport(li);
      setLastImport(li);

      // Refresh KPIs after import
      await refetchKpisForRange();
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // Fetch KPIs for range
  React.useEffect(() => {
    const run = async () => {
      if (!range.from) return;

      try {
        setLoading(true);
        setError(null);
        await refetchKpisForRange();
      } catch (e: any) {
        setKpis(null);
        setError(e?.message || "Failed to fetch KPIs");
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from?.getTime(), range?.to?.getTime()]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Time Interval{loading ? " • loading…" : ""}
          {mounted && lastImport ? (
            <span className="ml-2 inline-flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                Data last updated: {timeAgoShort(lastImport.importedAt)} (CheckoutChamp)
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <TimeIntervalPicker value={range} onChange={setRange} />

          <button
            type="button"
            onClick={handleImportCheckoutChamp}
            disabled={!range.from || importing}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            title="Import CheckoutChamp orders for the selected date range"
          >
            {importing ? "Importing…" : "Import CheckoutChamp Orders"}
          </button>
        </div>
      </div>
	  {lastImport ? (
		  <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950/30 dark:text-slate-200">
		    <div className="flex items-center justify-between gap-3 flex-wrap">
		      <div>
		        <span className="font-medium">Orders last imported:</span>{" "}
		        {new Date(lastImport.importedAt).toLocaleString()} •{" "}
		        <span className="font-mono">{lastImport.from}</span> →{" "}
		        <span className="font-mono">{lastImport.to}</span> •{" "}
		        {lastImport.upserted} orders
		      </div>
		      <a
		        className="underline underline-offset-2"
		        href={`/orders?platform=checkoutchamp&from=${encodeURIComponent(
		          lastImport.from
		        )}&to=${encodeURIComponent(lastImport.to)}&limit=200`}
		      >
		        View →
		      </a>
		    </div>
		  </div>
		) : null}

      {mounted && lastImport ? (
        <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950/30 dark:text-slate-200">
          <div className="font-medium">Last CheckoutChamp import</div>
          <div className="mt-1 space-y-0.5">
            <div>
              Range: <span className="font-mono">{lastImport.from}</span> →{" "}
              <span className="font-mono">{lastImport.to}</span>
            </div>
            <div>
              Orders: {lastImport.upserted} (fetched {lastImport.fetched}) • pages {lastImport.pages}
            </div>
            <div>Imported at: {new Date(lastImport.importedAt).toLocaleString()}</div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">KPI feed unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Gross Sales"
          value={kpis ? formatMoney(kpis.gross_sales) : "—"}
          helper={kpis ? helperDeltaPct(kpis.gross_sales_delta_pct) : "—"}
        />

        <KpiCard
          label="Net Profit"
          value={kpis ? formatMoney(kpis.net_profit) : "—"}
          helper={kpis ? `${Math.round(kpis.net_margin * 100)}% margin` : "—"}
        />

        <KpiCard
          label="Refund Rate"
          value={kpis ? formatPctFromRatio(kpis.refund_rate, 1) : "—"}
          helper={kpis ? helperDeltaPp(kpis.refund_rate_delta_pp) : "—"}
        />

        <KpiCard
          label="Chargebacks"
          value={kpis ? formatPctFromRatio(kpis.chargebacks, 1) : "—"}
          helper={kpis ? helperDeltaPp(kpis.chargebacks_delta_pp) : "—"}
        />
      </div>
    </div>
  );
}

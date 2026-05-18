// ui/app/(app)/journeys/page.tsx
import Link from "next/link";
import { apiGetJson } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8787";

// ---- Types (keep whatever you already had; these are safe defaults) ----
type Journey = {
  tkid: string;
  site_key?: string | null;
  has_orders?: boolean | null;
  last_seen?: string | null;
  // add/keep any other fields your UI uses
};

type JourneysResponse = {
  ok: boolean;
  journeys: Journey[];
};

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function JourneysPage({ searchParams }: Props) {
  // ✅ Next.js 15.5: searchParams is a Promise
  const sp = await searchParams;

  let journeys: Journey[] = [];
  let error: string | null = null;

  try {
    const json = await apiGetJson<JourneysResponse>(`/v1/journeys`);
    if (!json.ok) throw new Error("API returned not ok");
    journeys = json.journeys || [];
  } catch (e: any) {
    console.error("[Journeys] failed to load", e);
    error = e?.message ?? "Failed to load journeys";
  }

  // --------- FILTERS (from query params) ---------
  const siteFilter = typeof sp.site === "string" ? sp.site : "";
  const hasOrdersOnly = typeof sp.hasOrders === "string" && sp.hasOrders === "1";
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  // compute all site_keys BEFORE filtering, for dropdown
  const allSites = Array.from(
    new Set(
      journeys
        .map((j) => (j.site_key ?? "").trim())
        .filter(Boolean)
    )
  ).sort();

  // Apply filters
  const filtered = journeys.filter((j) => {
    if (siteFilter && (j.site_key ?? "") !== siteFilter) return false;
    if (hasOrdersOnly && !j.has_orders) return false;
    if (query) {
      const hay = `${j.tkid ?? ""} ${(j.site_key ?? "")}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  // --------- Render ---------
  return (
    <div className="p-6 space-y-4 text-sm text-slate-900 dark:text-slate-100">
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
            <input
              name="q"
              defaultValue={query}
              placeholder="Search tkid / site"
              className="h-9 w-56 rounded-md border px-3 text-sm bg-white dark:bg-slate-950"
            />

            <select
              name="site"
              defaultValue={siteFilter}
              className="h-9 rounded-md border px-2 text-sm bg-white dark:bg-slate-950"
            >
              <option value="">All sites</option>
              {allSites.map((s) => (
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
          <div className="col-span-5">TKID</div>
          <div className="col-span-4">Site</div>
          <div className="col-span-2">Has Orders</div>
          <div className="col-span-1 text-right">View</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">No journeys found.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((j) => (
              <div key={j.tkid} className="grid grid-cols-12 px-3 py-2 items-center">
                <div className="col-span-5 font-mono text-xs truncate">{j.tkid}</div>
                <div className="col-span-4 text-xs truncate">{j.site_key ?? "—"}</div>
                <div className="col-span-2 text-xs">{j.has_orders ? "Yes" : "No"}</div>
                <div className="col-span-1 text-right">
                  <Link
                    href={`/journeys/${encodeURIComponent(j.tkid)}`}
                    className="text-xs underline"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

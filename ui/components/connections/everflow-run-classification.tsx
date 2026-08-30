import type { SafeSyncRun } from "@/lib/commerce/integration-experience";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export function EverflowRunClassification({ runs }: { runs: SafeSyncRun[] }) {
  const classified = runs.filter((run) =>
    run.provider === "everflow"
    && run.resource === "everflow_conversions"
    && (run.nonOrderEvents != null || run.unmatchedCommerce != null),
  );
  if (!classified.length) return null;

  const latest = classified[0];
  return (
    <section className="bg-[#080a0f] px-5 pb-10 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1360px] rounded-2xl border border-white/10 bg-white/[.035] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Everflow attribution classification</p>
            <h2 className="mt-2 text-base font-semibold">Latest conversion sync</h2>
            <p className="mt-1 text-xs text-slate-500">Commerce matching failures are separated from valid Everflow events that are not orders.</p>
          </div>
          <p className="text-xs text-slate-500">Completed · {formatDate(latest.completedAt)}</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Non-order events</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{latest.nonOrderEvents ?? 0}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Valid Everflow events intentionally excluded from commerce order matching.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Unmatched commerce</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{latest.unmatchedCommerce ?? 0}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Commerce-valued conversions that did not resolve to a canonical order.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

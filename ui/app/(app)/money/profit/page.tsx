import { Suspense } from "react";
import { ProfitSummaryPanel } from "@/app/(app)/dashboard/profit-summary-panel";

export default function ProfitReportingPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Financial reporting
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Profit Reporting</h1>
        <p className="mt-2 text-sm text-slate-500">
          Currency-qualified operational Profit. Calculated results are
          unreconciled and do not establish complete cost coverage.
        </p>
      </header>

      <Suspense fallback={<p>Loading Profit Reporting…</p>}>
        <ProfitSummaryPanel />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import FinancialImportMonitorClient from "./financial-import-monitor-client";

export default function FinancialImportMonitorPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-white p-5 text-sm text-slate-500 dark:bg-ink/60">Loading Financial Imports...</div>}>
      <FinancialImportMonitorClient />
    </Suspense>
  );
}

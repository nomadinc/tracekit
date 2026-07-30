import { Suspense } from "react";
import FinancialReconciliationClient from "./financial-reconciliation-client";

export default function FinancialReconciliationPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border bg-white p-5 text-sm text-slate-500 dark:bg-ink/60">Loading Financial Health...</div>}>
      <FinancialReconciliationClient />
    </Suspense>
  );
}

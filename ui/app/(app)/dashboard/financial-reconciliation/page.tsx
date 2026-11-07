import { DetailedFinancialReportBoundary } from "@/components/money/detailed-financial-report-boundary";
import { Suspense } from "react";
import FinancialReconciliationClient from "./financial-reconciliation-client";

export default function FinancialReconciliationPage() {
  return (
    <DetailedFinancialReportBoundary title="Financial Reconciliation"><Suspense fallback={<div className="rounded-lg border bg-white p-5 text-sm text-slate-500 dark:bg-ink/60">Loading Financial Health...</div>}>
      <FinancialReconciliationClient />
    </Suspense></DetailedFinancialReportBoundary>
  );
}

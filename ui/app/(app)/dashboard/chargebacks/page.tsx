import { Suspense } from "react";
import { FinancialIssueAnalysisClient } from "../financial-issue-analysis-client";

export default function ChargebackAnalysisPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border bg-white p-5 text-sm text-slate-500 dark:bg-ink/60">Loading Chargeback Analysis...</div>}>
      <FinancialIssueAnalysisClient kind="chargeback" />
    </Suspense>
  );
}

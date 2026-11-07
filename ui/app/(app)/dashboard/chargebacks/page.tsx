import { ChargebackReviewWorkspace } from "@/components/chargebacks/chargeback-review-workspace";
import { DetailedFinancialReportBoundary } from "@/components/money/detailed-financial-report-boundary";

export default function ChargebackAnalysisPage() {
  return <DetailedFinancialReportBoundary title="Chargebacks"><ChargebackReviewWorkspace /></DetailedFinancialReportBoundary>;
}

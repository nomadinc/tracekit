export type FindingKind = "observation" | "correlation" | "negative_finding" | "hypothesis";
export type AttributionProvenance = "direct" | "propagated_within_journey" | "inferred" | "unattributed" | "mixed";
export type InvestigationStatus = "queued" | "running" | "completed" | "completed_with_warnings" | "failed" | "cancelled";

export type SafeMetric = { label: string; value: string; detail?: string; warning?: string };
export type SafeFinding = {
  id: string; kind: FindingKind; title: string; statement: string; metric?: string;
  sample?: string; control?: string; quality: "high" | "medium" | "limited";
  provenance: AttributionProvenance; algorithmVersion: string;
};
export type InvestigationPresentation = {
  question: string;
  executiveFinding: string;
  period: string;
  evidenceQuality: SafeMetric[];
  outcome: { metrics: SafeMetric[]; statuses: Array<{ label: string; count: number; percent: string }>; maturityWarning: string };
  concentration: Array<{ subject: string; signal: string; sample: string; interpretation: string; warning?: string }>;
  journey: Array<{ label: string; state: "observed" | "propagated" | "missing"; detail: string }>;
  multiCharge: Array<{ charges: string; rate: string }>;
  comparison: Array<{ metric: string; subject: string; control: string; delta: string; finding: string }>;
  findings: SafeFinding[];
  weakenedHypotheses: Array<{ hypothesis: string; evidence: string }>;
  currentHypotheses: Array<{ hypothesis: string; for: string; against: string; missing: string; status: string }>;
  evidenceGaps: string[];
  nextQuestions: string[];
  provenance: { sources: string[]; evidenceRecords: string; disputeRule: string; journeyRule: string; attribution: Array<{ label: string; count: string }>; analyzedAt: string };
  methodology: string[];
};

export type SafeInvestigationSummary = {
  id: string; title: string; organization: string; type: string; status: InvestigationStatus;
  period: string; primarySignal: string; evidenceQuality: string; lastUpdated: string; version: number;
  parentInvestigationId: string | null;
  freshnessStatus: "current"|"new_evidence_available"|"refresh_queued"|"refreshing"|"refresh_failed";
};

export type SafeInvestigationCandidate = { id:string; question:string; candidateType:string; metric:string; currentValue:string|null; baselineValue:string|null; sampleSize:number; period:string; triggerReason:string; status:string; existingInvestigationId:string|null };

export type InvestigationInspectionType = "product"|"cohort"|"finding"|"evidence-quality"|"journey"|"dispute"|"freshness";
export type SafeInvestigationInspection = {
  type: InvestigationInspectionType; key: string; label: string; title: string; context: string;
  rows: Array<{ label: string; value: string; tone?: "neutral"|"brand"|"success"|"warning"|"danger"|"correlation" }>;
  cohortDefinitions?: Array<{ label: "Affected"|"Control"; definition: string; sample: string }>;
  comparisonSummary?: { label: string; statement: string; tone: "neutral"|"success"|"warning" };
  comparisons?: Array<{ metric: string; definition?: string; affected: string; control: string; difference?: string; differenceExplanation?: string; interpretation: string; limitation?: string }>;
  notes: string[]; sources: string[]; algorithmVersion: string;
  relatedInvestigation?: { id: string; title: string; status: InvestigationStatus; context: string };
};

export type SafeInvestigationDetail = SafeInvestigationSummary & {
  runId: string; warnings: Array<{ code: string; message: string }>;
  versions: { commerce: string; journey: string; dispute: string; reason: string; cohort: string; algorithm: string };
  presentation: InvestigationPresentation;
  parent: null | { id: string; title: string; question: string; version: number; branchSignal: string; branchReason: string };
  branches: SafeInvestigationSummary[];
  inspections: SafeInvestigationInspection[];
};

export function inspectionKey(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }

const forbiddenPresentationKey = /(email|phone|ip_address|storage_reference|ciphertext|api_key|raw_payload)/i;
export function assertClientSafePresentation(value: unknown, path = "presentation"): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertClientSafePresentation(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenPresentationKey.test(key)) throw new Error(`Unsafe Investigation presentation field at ${path}.${key}`);
    assertClientSafePresentation(child, `${path}.${key}`);
  }
}

export const EVERFLOW_V2_TIMESTAMP_OFFSET_MINUTES = -180;
export const EVERFLOW_V2_DIRECT_TOLERANCE_SECONDS = 120;
export const EVERFLOW_V2_PROPAGATION_MINUTES = 10;

export type AttributionEligibility =
  | "attributed_direct"
  | "attributed_propagated_within_journey"
  | "unattributed_eligible"
  | "outside_attribution_evidence_window"
  | "needs_review";

export type AttributionEvidenceWindow = {
  sourceConversionStart: string;
  sourceConversionEnd: string;
  eligibleOrderStart: string;
  eligibleOrderEnd: string;
  ruleVersion: "everflow-commerce-v2";
};

function shift(iso: string, milliseconds: number): string {
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) throw new Error("Invalid attribution Evidence timestamp.");
  return new Date(value + milliseconds).toISOString();
}

export function buildEverflowV2EvidenceWindow(sourceConversionStart: string, sourceConversionEnd: string): AttributionEvidenceWindow {
  const normalizedStart = shift(sourceConversionStart, EVERFLOW_V2_TIMESTAMP_OFFSET_MINUTES * 60_000);
  const normalizedEnd = shift(sourceConversionEnd, EVERFLOW_V2_TIMESTAMP_OFFSET_MINUTES * 60_000);
  if (new Date(normalizedEnd).getTime() < new Date(normalizedStart).getTime()) throw new Error("Invalid attribution Evidence window.");
  return {
    sourceConversionStart,
    sourceConversionEnd,
    eligibleOrderStart: shift(normalizedStart, -EVERFLOW_V2_DIRECT_TOLERANCE_SECONDS * 1_000),
    eligibleOrderEnd: shift(normalizedEnd, EVERFLOW_V2_PROPAGATION_MINUTES * 60_000),
    ruleVersion: "everflow-commerce-v2",
  };
}

export function classifyOrderAttribution(args: {
  orderTimestamp: string;
  window: AttributionEvidenceWindow;
  direct: boolean;
  propagated: boolean;
  needsReview?: boolean;
}): AttributionEligibility {
  const timestamp = new Date(args.orderTimestamp).getTime();
  const inside = timestamp >= new Date(args.window.eligibleOrderStart).getTime()
    && timestamp <= new Date(args.window.eligibleOrderEnd).getTime();
  if (!inside) return "outside_attribution_evidence_window";
  if (args.direct) return "attributed_direct";
  if (args.propagated) return "attributed_propagated_within_journey";
  if (args.needsReview) return "needs_review";
  return "unattributed_eligible";
}

export function coveragePercent(numerator: number, denominator: number): string {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0 || denominator <= 0 || numerator > denominator) {
    throw new Error("Invalid attribution coverage inputs.");
  }
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

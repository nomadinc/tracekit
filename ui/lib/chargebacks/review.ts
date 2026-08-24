export type ReviewConfidence = "high_confidence" | "medium_confidence" | "needs_review" | "unmatched";

export const CONFIDENCE_LABELS: Record<ReviewConfidence, string> = {
  high_confidence: "High Confidence",
  medium_confidence: "Medium Confidence",
  needs_review: "Needs Review",
  unmatched: "Unmatched",
};

export function normalizeConfidence(value: unknown): ReviewConfidence {
  const v = String(value || "").toLowerCase();
  return v === "high_confidence" || v === "medium_confidence" || v === "needs_review" || v === "unmatched"
    ? v
    : "unmatched";
}

export function confidenceLabel(value: unknown) {
  return CONFIDENCE_LABELS[normalizeConfidence(value)];
}

export function safeStatus(value: unknown) {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

export function evidenceFactorLabels(value: unknown): Array<{ label: string; result: string }> {
  const factors = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const bool = (key: string) => factors[key] === true ? "Exact" : factors[key] === false ? "Not exact" : "Unavailable";
  return [
    ["Contact signal", bool("contact_signal_exact")],
    ["Date", factors.date_exact === true ? "Exact" : factors.date_distance_days != null ? `${String(factors.date_distance_days)} day distance` : "Unavailable"],
    ["Amount", bool("amount_exact")],
    ["Product", bool("product_exact")],
    ["Payment method", factors.payment_compatible === true ? "Compatible" : factors.payment_compatible === false ? "Different" : "Unavailable"],
  ].map(([label, result]) => ({ label, result }));
}

export function parseReviewFilters(params: URLSearchParams) {
  const page = Math.max(1, Math.min(10000, Number(params.get("page") || 1) || 1));
  const pageSize = Math.max(10, Math.min(100, Number(params.get("page_size") || 50) || 50));
  return {
    page,
    pageSize,
    status: params.get("status") || "",
    confidence: params.get("confidence") || "",
    reason: params.get("reason") || "",
    product: params.get("product") || "",
    search: params.get("search") || "",
    from: params.get("from") || "",
    to: params.get("to") || "",
    matched: params.get("matched") || "",
  };
}

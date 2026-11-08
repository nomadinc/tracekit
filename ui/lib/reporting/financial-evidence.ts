export type FinancialEvidenceState = "provider_observed" | "derived_complete" | "unavailable" | "restricted";
export function qualifiedFinancialAmount(value: unknown, state: FinancialEvidenceState, coverageComplete = false): number | null {
  if (state !== "provider_observed" && !(state === "derived_complete" && coverageComplete)) return null;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
export function financialEvidenceLabel(value: unknown, state: FinancialEvidenceState, coverageComplete = false) {
  if (state === "restricted") return "Restricted";
  return qualifiedFinancialAmount(value,state,coverageComplete) === null ? "Unavailable" : "Available";
}

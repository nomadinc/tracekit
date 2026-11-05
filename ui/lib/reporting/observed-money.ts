// Presentation only: never treat absent or redacted evidence as a financial zero.
export function observedAmount(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function formatObservedMoney(value: unknown, currency: string | null = "USD"): string {
  const amount = observedAmount(value);
  if (amount === null || !currency || !/^[A-Z]{3}$/.test(currency)) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return "Unavailable";
  }
}

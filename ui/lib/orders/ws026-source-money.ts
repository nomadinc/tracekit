/** WS-026 read-only monetary evidence: unknown is never zero or USD. */
export type SourceMoney = { amount: number; currency: string } | null;
export function sourceMoney(amount: unknown, currency: unknown): SourceMoney {
  if (amount === null || amount === undefined || amount === "" || typeof amount === "boolean") return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof amount !== "number" && (typeof amount !== "string" || !/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?$/.test(amount.trim()))) return null;
  const value = Number(amount);
  return Number.isFinite(value) ? { amount: value, currency } : null;
}
export function displaySourceMoney(value: SourceMoney): string {
  if (!value) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: value.currency }).format(value.amount);
}
export function aggregateSourceMoney(values: readonly SourceMoney[]): SourceMoney {
  if (!values.length || values.some(value => !value)) return null;
  const known = values as { amount: number; currency: string }[];
  const currency = known[0].currency;
  if (known.some(value => value.currency !== currency)) return null;
  const total = known.reduce((sum, value) => sum + value.amount, 0);
  return Number.isFinite(total) ? { amount: total, currency } : null;
}

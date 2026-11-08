import type { PortfolioMetric } from "./portfolio-reader";
import { sumPortfolioRows } from "./portfolio-math";

/** Complete means authoritative coverage for every provider, tenant, currency
 * and date in the requested cohort AND a complete ledger read. Row count,
 * successful HTTP responses and absence of events cannot supply this evidence.
 * Current production adapter supplies unknown; no browser input selects this.
 */
export function qualifyFinancialMetric(
  rows: Record<string, unknown>[],
  coverage: "complete" | "partial" | "unknown",
  kind: "refund" | "chargeback",
): PortfolioMetric {
  const observed = `${rows.length} append-only ${kind} event${rows.length === 1 ? "" : "s"} observed.`;
  if (coverage !== "complete") return {
    value: null, state: "partial",
    detail: `${observed} Source coverage is ${coverage === "partial" ? "incomplete" : "unverified"}; total unavailable, not a certified zero.`,
  };
  // Do not let Number(null), blank values, malformed amounts or mixed currency
  // silently produce a qualified zero or a falsely USD-denominated total.
  const valid = rows.every(row =>
    row.currency === "USD" &&
    (typeof row.amount === "number" || typeof row.amount === "string" && /^-?\d+(?:\.\d+)?$/.test(row.amount)) &&
    Number.isFinite(Number(row.amount)));
  const value = valid ? Math.abs(sumPortfolioRows(rows, "amount")) : NaN;
  if (!Number.isFinite(value)) return { value: null, state: "unavailable", detail: `${observed} Amount or currency evidence is unavailable.` };
  return { value, state: "available", detail: `${observed} Complete authoritative source coverage; reversals remain separate.` };
}

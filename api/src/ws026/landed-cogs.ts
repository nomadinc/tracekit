/**
 * WS-026 M2-A2: pure landed-cost calculation. No database writes.
 * All monetary values are integer cents; effective intervals are [from, to).
 * A result is not a financial posting or an authorization to backfill.
 */
export type CostRule = {
  id: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  providerProductId: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  packageCostCents: number;
};
export type CostLine = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  providerProductId: string;
  currency: string;
  occurredAt: string;
  quantity: number;
};
export type CostResult =
  | { status: "ready"; amountCents: number; ruleId: string; quantity: number }
  | { status: "unavailable"; reason: "invalid_input" | "missing_rule" | "ambiguous_rule" | "invalid_rule" | "amount_overflow" };

function validTime(value: string): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
function sameIdentity(line: CostLine, rule: CostRule): boolean {
  return rule.organizationId === line.organizationId &&
    rule.connectionId === line.connectionId &&
    rule.providerAccountId === line.providerAccountId &&
    rule.providerProductId === line.providerProductId &&
    rule.currency === line.currency;
}
export function calculateLandedCogs(line: CostLine, rules: readonly CostRule[]): CostResult {
  const at = validTime(line.occurredAt);
  if (at === null || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
      !line.organizationId || !line.connectionId || !line.providerAccountId ||
      !line.providerProductId || !/^[A-Z]{3}$/.test(line.currency)) {
    return { status: "unavailable", reason: "invalid_input" };
  }
  let invalidApplicableRule = false;
  const matches = rules.filter((rule) => {
    if (!sameIdentity(line, rule)) return false;
    const from = validTime(rule.effectiveFrom);
    const to = rule.effectiveTo === null ? null : validTime(rule.effectiveTo);
    const valid = Boolean(rule.id) && from !== null &&
      (rule.effectiveTo === null || to !== null) &&
      (to === null || (from !== null && to > from)) &&
      Number.isSafeInteger(rule.packageCostCents) && rule.packageCostCents >= 0;
    if (!valid) { invalidApplicableRule = true; return false; }
    return from! <= at && (to === null || at < to);
  });
  if (invalidApplicableRule) return { status: "unavailable", reason: "invalid_rule" };
  if (matches.length === 0) return { status: "unavailable", reason: "missing_rule" };
  if (matches.length > 1) return { status: "unavailable", reason: "ambiguous_rule" };
  const amountCents = matches[0].packageCostCents * line.quantity;
  if (!Number.isSafeInteger(amountCents)) return { status: "unavailable", reason: "amount_overflow" };
  return { status: "ready", amountCents, ruleId: matches[0].id, quantity: line.quantity };
}

/** WS-026 M2-B2: read-only financial presentation with integer minor units. */
export type FinancialComponent = {
  id: string; category: "sale" | "refund" | "reversal" | "affiliate_commission" | "landed_cogs" | "processing_fee" | "other_cost";
  amountCents: number; currency: string; source: "imported" | "contract_calculated" | "manual" | "estimated" | "reconciled_adjustment";
  evidenceId: string; effectiveCostVersionId?: string;
};
export type FinancialReadResult =
  | { status: "ready" | "limited"; currency: string; grossRevenueCents: number; netRevenueCents: number; operationalProfitCents: number | null; reconciledProfitCents: number | null; missing: string[]; components: FinancialComponent[] }
  | { status: "unavailable"; reason: "invalid_input" | "duplicate_conflict" | "currency_mismatch" | "overflow" };
const required = ["sale", "affiliate_commission", "landed_cogs", "processing_fee"] as const;
export function presentOrderFinancials(input: {
  currency: string; components: readonly FinancialComponent[]; knownAbsent: readonly string[];
  reconciled: boolean; sourceCurrent: boolean; includesShippingInLandedCogs: boolean;
}): FinancialReadResult {
  if (!/^[A-Z]{3}$/.test(input.currency) || input.components.some(c => !c.id || !c.evidenceId ||
      !Number.isSafeInteger(c.amountCents) || c.amountCents < 0)) return { status: "unavailable", reason: "invalid_input" };
  if (input.components.some(c => c.currency !== input.currency)) return { status: "unavailable", reason: "currency_mismatch" };
  const seen = new Map<string, FinancialComponent>();
  for (const c of input.components) {
    const existing = seen.get(c.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(c)) return { status: "unavailable", reason: "duplicate_conflict" };
    seen.set(c.id, c);
  }
  const components = [...seen.values()];
  const sum = (category: FinancialComponent["category"]) => components.filter(c => c.category === category).reduce((v, c) => v + c.amountCents, 0);
  const grossRevenueCents = sum("sale");
  const netRevenueCents = grossRevenueCents - sum("refund") + sum("reversal");
  const operational = netRevenueCents - sum("affiliate_commission") - sum("landed_cogs") - sum("processing_fee") - sum("other_cost");
  if (![grossRevenueCents, netRevenueCents, operational].every(Number.isSafeInteger)) return { status: "unavailable", reason: "overflow" };
  const missing = [...new Set([...required.filter(category => !components.some(c => c.category === category) && !input.knownAbsent.includes(category)),
    ...input.knownAbsent.map(s => "missing:" + s),
    ...(!input.sourceCurrent ? ["stale_source"] : [])])];
  if (!input.includesShippingInLandedCogs) missing.push("shipping_cost_unverified");
  const complete = missing.length === 0 && !components.some(c => c.source === "estimated");
  return { status: complete ? "ready" : "limited", currency: input.currency, grossRevenueCents, netRevenueCents,
    operationalProfitCents: complete ? operational : null,
    reconciledProfitCents: complete && input.reconciled ? operational : null, missing, components };
}

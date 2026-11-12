/**
 * Project only authenticated, tenant-scoped Core API evidence.
 * Never reconstruct line items from an order total or a customer match.
 */
export type ObservedOrderLine = {
  id: string;
  name: string | null;
  sku: string | null;
  providerProductId: string | null;
  providerVariantId: string | null;
  quantity: number | null;
  unitAmount: number | null;
  grossAmount: number | null;
  currency: string | null;
  evidenceId: string | null;
};
const str = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const amount = (v: unknown): number | null => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
export function observedOrderLines(rows: unknown, canonicalOrderId: string, organizationId: string): ObservedOrderLine[] {
  if (!Array.isArray(rows) || !canonicalOrderId || !organizationId) return [];
  return rows.flatMap((row: any) => {
    if (!row || row.canonical_order_id !== canonicalOrderId || row.organization_id !== organizationId || !str(row.id)) return [];
    const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return [{
      id: row.id,
      name: str(m.title) || str(row.product_name),
      sku: str(m.sku) || str(row.sku),
      providerProductId: str(m.provider_product_id),
      providerVariantId: str(m.provider_variant_id),
      quantity: amount(row.quantity),
      unitAmount: amount(row.unit_amount),
      grossAmount: amount(row.gross_amount),
      currency: str(row.currency),
      evidenceId: str(row.evidence_id),
    }];
  });
}

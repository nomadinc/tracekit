import type { TraceKitSessionContext } from "./persistent-types";

// The R1 Core Customer Orders read model supplies order identity, status and
// retained order totals. Never spread upstream objects into the browser API.
// No line-level financial amounts are certified by this response contract.
type JsonRecord = Record<string, unknown>;
type ProjectedOrder = {
  workspace_id: string;
  organization_id: string;
  person_id: string | null;
  resolved_person_id: string | null;
  identity_resolution: string | null;
  platform: string | null;
  platform_order_id: string;
  order_id: string | null;
  order_ts: string | null;
  status: string | null;
  status_norm: string | null;
  currency: string | null;
  evidence_id: string | null;
  gross_amount?: number | string | null;
};
type ProjectedEntry = {
  order: ProjectedOrder;
  customer: { id: string } | null;
  identity_state: string | null;
};
export type ProjectedCustomerOrders = {
  ok: true;
  orders: ProjectedEntry[];
  next_offset: number | null;
};
const object = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const nullableString = (value: unknown): string | null => typeof value === "string" ? value : null;
const requiredString = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const money = (value: unknown): number | string | null | undefined =>
  value === null ? null : typeof value === "number" && Number.isFinite(value) ? value
    : typeof value === "string" && /^-?\\d+(?:\\.\\d+)?$/.test(value) ? value : undefined;

export function projectCustomerOrders(body: unknown, session: TraceKitSessionContext): ProjectedCustomerOrders {
  const source = object(body);
  if (!source || source.ok !== true || !Array.isArray(source.orders)) throw new Error("Customer Orders response unavailable.");
  const org = session.activeOrganization?.id;
  if (!org) throw new Error("Customer Orders scope unavailable.");
  const financial = session.effectivePermissions.includes("financials.view")
    && session.effectivePermissions.includes("orders.view_financials");
  const orders = source.orders.map((item: unknown): ProjectedEntry => {
    const entry = object(item), original = object(entry?.order);
    if (!original || original.workspace_id !== org || original.organization_id !== org)
      throw new Error("Customer Orders scope unavailable.");
    const platformOrderId = requiredString(original.platform_order_id);
    if (!platformOrderId) throw new Error("Customer Orders identity unavailable.");
    const resolved = nullableString(original.resolved_person_id);
    const customer = object(entry?.customer);
    // Exact relationship only: never synthesize or accept a conflicting customer.
    if (customer && (!resolved || customer.id !== resolved)) throw new Error("Customer Orders relationship unavailable.");
    const order: ProjectedOrder = {
      workspace_id: org,
      organization_id: org,
      person_id: nullableString(original.person_id),
      resolved_person_id: resolved,
      identity_resolution: nullableString(original.identity_resolution),
      platform: nullableString(original.platform),
      platform_order_id: platformOrderId,
      order_id: nullableString(original.order_id),
      order_ts: nullableString(original.order_ts),
      status: nullableString(original.status),
      status_norm: nullableString(original.status_norm),
      currency: nullableString(original.currency),
      evidence_id: nullableString(original.evidence_id),
    };
    // Only the Core read model's order-level gross amount is eligible. Never
    // serialize provider line items, inferred amounts or unknown money aliases.
    if (financial && Object.prototype.hasOwnProperty.call(original, "gross_amount")) {
      const amount = money(original.gross_amount);
      if (amount !== undefined) order.gross_amount = amount;
    }
    return {
      order,
      customer: resolved ? { id: resolved } : null,
      identity_state: nullableString(entry?.identity_state),
    };
  });
  const offset = source.next_offset;
  return { ok: true, orders, next_offset: offset === null || Number.isSafeInteger(offset) && (offset as number) >= 0 ? offset as number | null : null };
}

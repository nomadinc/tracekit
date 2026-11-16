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
  canonical_order_id?: string;
  connection_id?: string;
  provider_account_id?: string;
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
// Retained categorical values must not be treated as unrestricted narratives.
const currencyCode = (value: unknown): string | null =>
  typeof value === "string" && /^(?:USD|EUR|GBP|CAD|AUD|NZD|JPY|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|TRY|ILS|AED|SAR|INR|CNY|HKD|SGD|TWD|KRW|THB|MYR|IDR|PHP|VND|ZAR|BRL|MXN|ARS|CLP|COP|PEN|UYU|CRC|GTQ|DOP|EGP|NGN|KES|GHS|MAD|PKR|BDT|LKR|NPR|RUB|UAH|ISK|BHD|KWD|OMR|QAR|JOD|BMD|BSD|BBD|JMD|TTD|XCD|XOF|XAF|XPF)$/.test(value) ? value : null;
const platformCode = (value: unknown): string | null =>
  typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : null;
const evidenceIdentifier = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value) ? value : null;
const timestamp = (value: unknown): string | null =>
  typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const statusValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const supported = new Set([
    "pending", "open", "completed", "complete", "paid", "processing",
    "authorized", "failed", "cancelled", "canceled", "refunded",
    "partially_refunded", "partially refunded", "chargeback", "disputed",
    "void", "voided", "unfulfilled", "fulfilled", "shipped", "delivered",
    "on_hold", "unknown",
  ]);
  return supported.has(normalized) ? value : null;
};
const identityState = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  return /^(?:resolved|unresolved|matched|unmatched|exact_provider_identity|exact|pending|unknown|ambiguous|linked|not_linked)$/.test(value) ? value : null;
};
const opaqueIdentity = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value) ? value : null;
const money = (value: unknown): number | string | null | undefined =>
  value === null ? null : typeof value === "number" && Number.isFinite(value) ? value
    : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? value : undefined;

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
    const platformOrderId = evidenceIdentifier(original.platform_order_id);
    if (!platformOrderId) throw new Error("Customer Orders identity unavailable.");
    const resolved = original.resolved_person_id == null ? null : evidenceIdentifier(original.resolved_person_id);
    if (original.resolved_person_id != null && !resolved) throw new Error("Customer Orders identity unavailable.");
    const customer = object(entry?.customer);
    // Exact relationship only: never synthesize or accept a conflicting customer.
    if (customer && (!resolved || customer.id !== resolved)) throw new Error("Customer Orders relationship unavailable.");
    const canonical = original.canonical_order_id == null ? null : opaqueIdentity(original.canonical_order_id);
    const connection = original.connection_id == null ? null : opaqueIdentity(original.connection_id);
    const providerAccount = original.provider_account_id == null ? null : opaqueIdentity(original.provider_account_id);
    if ((original.canonical_order_id != null && !canonical) ||
        (original.connection_id != null && !connection) ||
        (original.provider_account_id != null && !providerAccount))
      throw new Error("Customer Orders identity unavailable.");
    // A provider-qualified platform key must agree with explicit scope evidence.
    const segments = platformOrderId.split(":");
    if (segments.length >= 4 && (
      (original.platform != null && original.platform !== segments[0]) ||
      (connection && connection !== segments[1]) ||
      (providerAccount && providerAccount !== segments[2])
    )) throw new Error("Customer Orders identity scope unavailable.");
    const platform = original.platform == null ? null : platformCode(original.platform);
    if (original.platform != null && !platform) throw new Error("Customer Orders provider unavailable.");
    const person = original.person_id == null ? null : evidenceIdentifier(original.person_id);
    const orderId = original.order_id == null ? null : evidenceIdentifier(original.order_id);
    const evidenceId = original.evidence_id == null ? null : evidenceIdentifier(original.evidence_id);
    if ((original.person_id != null && !person) ||
        (original.order_id != null && !orderId) ||
        (original.evidence_id != null && !evidenceId))
      throw new Error("Customer Orders identity unavailable.");
    const order: ProjectedOrder = {
      workspace_id: org,
      organization_id: org,
      person_id: person,
      resolved_person_id: resolved,
      identity_resolution: identityState(original.identity_resolution),
      platform,
      platform_order_id: platformOrderId,
      order_id: orderId,
      order_ts: timestamp(original.order_ts),
      status: statusValue(original.status),
      status_norm: statusValue(original.status_norm),
      currency: currencyCode(original.currency),
      evidence_id: evidenceId,
    };
    if (canonical) order.canonical_order_id = canonical;
    if (connection) order.connection_id = connection;
    if (providerAccount) order.provider_account_id = providerAccount;
    // Only the Core read model's order-level gross amount is eligible. Never
    // serialize provider line items, inferred amounts or unknown money aliases.
    if (financial && Object.prototype.hasOwnProperty.call(original, "gross_amount")) {
      const amount = money(original.gross_amount);
      if (amount !== undefined) order.gross_amount = amount;
    }
    return {
      order,
      customer: resolved ? { id: resolved } : null,
      identity_state: identityState(entry?.identity_state),
    };
  });
  const offset = source.next_offset;
  return { ok: true, orders, next_offset: offset === null || Number.isSafeInteger(offset) && (offset as number) >= 0 ? offset as number | null : null };
}

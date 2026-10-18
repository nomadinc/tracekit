/**
 * WS-026 M2-A1: read-only exact relationship decision.
 * No identity creation, writes, merges, or attribution assignment.
 * A caller must independently authenticate/authorize the scope and persist
 * through WS-001's approved authoritative boundary.
 */
export type ScopedOrder = {
  canonicalOrderId: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  personId: string | null;
};
export type ScopedCustomerIdentity = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  sourceType: "provider_customer_id";
  sourceId: string;
  personId: string;
};
export type ScopedPerson = { id: string; organizationId: string };
export type IdentityDecision =
  | { status: "link"; canonicalOrderId: string; organizationId: string; personId: string }
  | { status: "already_linked"; canonicalOrderId: string; organizationId: string; personId: string }
  | { status: "unavailable"; reason: "invalid_input" | "missing_identity" | "ambiguous_identity" | "foreign_scope" | "missing_person" | "conflicting_person" };

export function decideExactOrderPersonLink(
  order: ScopedOrder,
  providerCustomerId: string | null,
  identities: readonly ScopedCustomerIdentity[],
  people: readonly ScopedPerson[],
): IdentityDecision {
  if (!order.canonicalOrderId || !order.organizationId || !order.connectionId || !order.providerAccountId)
    return { status: "unavailable", reason: "invalid_input" };
  if (!providerCustomerId || !providerCustomerId.trim())
    return { status: "unavailable", reason: "missing_identity" };
  const matches = identities.filter(i =>
    i.organizationId === order.organizationId &&
    i.connectionId === order.connectionId &&
    i.providerAccountId === order.providerAccountId &&
    i.sourceType === "provider_customer_id" &&
    i.sourceId === providerCustomerId);
  if (matches.length === 0) return { status: "unavailable", reason: "missing_identity" };
  if (matches.length !== 1) return { status: "unavailable", reason: "ambiguous_identity" };
  const identity = matches[0];
  const person = people.find(p => p.id === identity.personId);
  if (!person) return { status: "unavailable", reason: "missing_person" };
  if (person.organizationId !== order.organizationId) return { status: "unavailable", reason: "foreign_scope" };
  if (order.personId && order.personId !== identity.personId)
    return { status: "unavailable", reason: "conflicting_person" };
  return { status: order.personId === identity.personId ? "already_linked" : "link",
    canonicalOrderId: order.canonicalOrderId, organizationId: order.organizationId, personId: identity.personId };
}

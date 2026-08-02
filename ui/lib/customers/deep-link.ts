import { CUSTOMER_DRAWER_KINDS, type CustomerDrawerTarget } from "@/lib/navigation/drawer-contract";
import { addDrawerTarget, addVersion, isOpaqueId, parseDrawerTarget, parseVersion } from "@/lib/navigation/deep-link";
import type { CustomerDeepLinkState, CustomerSummary, CustomerWorkspaceSnapshot } from "./types";

const FOCUS = new Set(["journey", "orders", "tracking"] as const);

export function parseCustomerDeepLink(value: URLSearchParams | string): CustomerDeepLinkState {
  const params = typeof value === "string" ? new URLSearchParams(value.startsWith("?") ? value.slice(1) : value) : value;
  const focus = params.get("focus");
  return {
    version: parseVersion(params),
    customerId: isOpaqueId(params.get("customer_id")) ? params.get("customer_id") : null,
    focus: focus && FOCUS.has(focus as never) ? focus as CustomerDeepLinkState["focus"] : null,
    eventId: isOpaqueId(params.get("event_id")) ? params.get("event_id") : null,
    identifierRef: isOpaqueId(params.get("identifier_ref")) ? params.get("identifier_ref") : null,
    orderId: isOpaqueId(params.get("order_id")) ? params.get("order_id") : null,
    offerId: isOpaqueId(params.get("offer_id")) ? params.get("offer_id") : null,
    drawer: parseDrawerTarget(params, CUSTOMER_DRAWER_KINDS),
    searchRef: isOpaqueId(params.get("search_ref")) ? params.get("search_ref") : null,
    replay: params.get("replay") === "1",
  };
}

function validDrawer(target: CustomerDrawerTarget | null, snapshot?: CustomerWorkspaceSnapshot | null) {
  if (!target || !snapshot) return null;
  if (target.kind === "journey-event" && snapshot.journey.some(item => item.id === target.recordId)) return target;
  if (target.kind === "identifier" && snapshot.journey.some(event => event.identifiers.some(item => item.id === target.recordId))) return target;
  if (target.kind === "privacy-signal" && snapshot.privacySignals.some(item => item.id === target.recordId)) return target;
  if (target.kind === "related-order" && snapshot.orders.some(item => item.id === target.recordId)) return target;
  if (target.kind === "related-offer" && snapshot.offers.some(item => item.id === target.recordId)) return target;
  if (target.kind === "tracking-health" && target.recordId === "current") return target;
  return null;
}

export function normalizeCustomerDeepLink(state: CustomerDeepLinkState, customers: CustomerSummary[], snapshot?: CustomerWorkspaceSnapshot | null): CustomerDeepLinkState {
  const drawer = validDrawer(state.drawer, snapshot);
  return {
    ...state,
    customerId: customers.some(customer => customer.id === state.customerId) ? state.customerId : customers[0]?.id || null,
    eventId: snapshot?.journey.some(event => event.id === state.eventId) ? state.eventId : null,
    identifierRef: snapshot?.journey.some(event => event.identifiers.some(identifier => identifier.id === state.identifierRef)) ? state.identifierRef : null,
    orderId: snapshot?.orders.some(order => order.id === state.orderId) ? state.orderId : null,
    offerId: snapshot?.offers.some(offer => offer.id === state.offerId) ? state.offerId : state.offerId && customers.some(customer => customer.offerIds.includes(state.offerId!)) ? state.offerId : null,
    drawer,
    drawerId: drawer ? `${drawer.kind}:${drawer.recordId}` : null,
    replay: state.replay && Boolean(snapshot?.journey.length),
  };
}

function legacyDrawer(value: string | null | undefined): CustomerDrawerTarget | null {
  if (!value) return null;
  const [prefix, recordId] = value.split(":", 2);
  const kind = prefix === "event" ? "journey-event" : prefix === "order" ? "related-order" : prefix === "offer" ? "related-offer" : prefix;
  return CUSTOMER_DRAWER_KINDS.has(kind as CustomerDrawerTarget["kind"]) && isOpaqueId(recordId) ? { kind: kind as CustomerDrawerTarget["kind"], recordId } : null;
}

export function customerDeepLinkHref(state: Partial<CustomerDeepLinkState> = {}, _developmentIdentityId?: string) {
  const params = new URLSearchParams();
  addVersion(params);
  if (state.customerId && isOpaqueId(state.customerId)) params.set("customer_id", state.customerId);
  if (state.focus && FOCUS.has(state.focus)) params.set("focus", state.focus);
  if (state.eventId && isOpaqueId(state.eventId)) params.set("event_id", state.eventId);
  if (state.identifierRef && isOpaqueId(state.identifierRef)) params.set("identifier_ref", state.identifierRef);
  if (state.orderId && isOpaqueId(state.orderId)) params.set("order_id", state.orderId);
  if (state.offerId && isOpaqueId(state.offerId)) params.set("offer_id", state.offerId);
  addDrawerTarget(params, state.drawer || legacyDrawer(state.drawerId));
  if (state.searchRef && isOpaqueId(state.searchRef)) params.set("search_ref", state.searchRef);
  if (state.replay) params.set("replay", "1");
  return `/customers?${params.toString()}`;
}

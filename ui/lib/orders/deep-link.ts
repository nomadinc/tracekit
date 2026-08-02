import { ORDER_DRAWER_KINDS, type OrderDrawerTarget } from "@/lib/navigation/drawer-contract";
import { addDrawerTarget, addVersion, isOpaqueId, parseDrawerTarget, parseVersion } from "@/lib/navigation/deep-link";
import type { OrderDeepLinkState, OrderSummary, OrderWorkspaceSnapshot } from "./types";

const FOCUS = new Set(["ledger", "attribution", "timeline", "tracking"] as const);

export function parseOrderDeepLink(value: URLSearchParams | string): OrderDeepLinkState {
  const params = typeof value === "string" ? new URLSearchParams(value.startsWith("?") ? value.slice(1) : value) : value;
  const focus = params.get("focus");
  return {
    version: parseVersion(params),
    orderId: isOpaqueId(params.get("order_id")) ? params.get("order_id") : null,
    focus: focus && FOCUS.has(focus as never) ? focus as OrderDeepLinkState["focus"] : null,
    lineId: isOpaqueId(params.get("line")) ? params.get("line") : null,
    attributionId: isOpaqueId(params.get("attribution")) ? params.get("attribution") : null,
    eventId: isOpaqueId(params.get("event_id")) ? params.get("event_id") : null,
    identifierRef: isOpaqueId(params.get("identifier_ref")) ? params.get("identifier_ref") : null,
    customerId: isOpaqueId(params.get("customer_id")) ? params.get("customer_id") : null,
    offerId: isOpaqueId(params.get("offer_id")) ? params.get("offer_id") : null,
    drawer: parseDrawerTarget(params, ORDER_DRAWER_KINDS),
    searchRef: isOpaqueId(params.get("search_ref")) ? params.get("search_ref") : null,
    replay: params.get("replay") === "1",
  };
}

function validDrawer(target: OrderDrawerTarget | null, snapshot?: OrderWorkspaceSnapshot | null) {
  if (!target || !snapshot) return null;
  if ((target.kind === "financial-line" || target.kind === "shipping-analysis" || target.kind === "processor-fee") && snapshot.ledger.some(item => item.id === target.recordId)) return target;
  if (target.kind === "timeline-event" && snapshot.timeline.some(item => item.id === target.recordId)) return target;
  if (target.kind === "identifier" && snapshot.identifiers.some(item => item.id === target.recordId)) return target;
  if (target.kind === "intelligence" && snapshot.intelligence.some(item => item.id === target.recordId)) return target;
  if (target.kind === "attribution" && target.recordId === "summary") return target;
  return null;
}

export function normalizeOrderDeepLink(state: OrderDeepLinkState, list: OrderSummary[], snapshot?: OrderWorkspaceSnapshot | null): OrderDeepLinkState {
  const drawer = validDrawer(state.drawer, snapshot);
  return {
    ...state,
    orderId: list.some(order => order.id === state.orderId) ? state.orderId : list[0]?.id || null,
    lineId: snapshot?.ledger.some(line => line.id === state.lineId) ? state.lineId : null,
    attributionId: state.attributionId === "summary" ? state.attributionId : null,
    eventId: snapshot?.timeline.some(event => event.id === state.eventId) ? state.eventId : null,
    identifierRef: snapshot?.identifiers.some(identifier => identifier.id === state.identifierRef) ? state.identifierRef : null,
    customerId: state.customerId === snapshot?.relatedCustomer.id ? state.customerId : null,
    offerId: state.offerId === snapshot?.relatedOffer.id || list.some(order => order.offerId === state.offerId) ? state.offerId : null,
    drawer,
    drawerId: drawer ? `${drawer.kind}:${drawer.recordId}` : null,
    replay: state.replay && Boolean(snapshot?.timeline.length),
  };
}

function legacyDrawer(value: string | null | undefined): OrderDrawerTarget | null {
  if (!value) return null;
  const [prefix, recordId] = value.split(":", 2);
  const kind = prefix === "financial" ? "financial-line" : prefix === "event" ? "timeline-event" : prefix;
  return ORDER_DRAWER_KINDS.has(kind as OrderDrawerTarget["kind"]) && isOpaqueId(recordId) ? { kind: kind as OrderDrawerTarget["kind"], recordId } : null;
}

export function orderDeepLinkHref(state: Partial<OrderDeepLinkState> = {}, _developmentIdentityId?: string) {
  const params = new URLSearchParams();
  addVersion(params);
  if (state.orderId && isOpaqueId(state.orderId)) params.set("order_id", state.orderId);
  if (state.focus && FOCUS.has(state.focus)) params.set("focus", state.focus);
  if (state.lineId && isOpaqueId(state.lineId)) params.set("line", state.lineId);
  if (state.attributionId && isOpaqueId(state.attributionId)) params.set("attribution", state.attributionId);
  if (state.eventId && isOpaqueId(state.eventId)) params.set("event_id", state.eventId);
  if (state.identifierRef && isOpaqueId(state.identifierRef)) params.set("identifier_ref", state.identifierRef);
  if (state.customerId && isOpaqueId(state.customerId)) params.set("customer_id", state.customerId);
  if (state.offerId && isOpaqueId(state.offerId)) params.set("offer_id", state.offerId);
  addDrawerTarget(params, state.drawer || legacyDrawer(state.drawerId));
  if (state.searchRef && isOpaqueId(state.searchRef)) params.set("search_ref", state.searchRef);
  if (state.replay) params.set("replay", "1");
  return `/orders?${params.toString()}`;
}

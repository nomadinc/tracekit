import { OFFER_DRAWER_KINDS, type OfferDrawerTarget } from "@/lib/navigation/drawer-contract";
import { addDrawerTarget, addVersion, isOpaqueId, normalizedRepeatedIds, parseDrawerTarget, parseVersion } from "@/lib/navigation/deep-link";
import type { OfferDeepLinkState, OfferFocus, OfferSummary, OfferWorkspaceSnapshot } from "./types";

const FOCUS = new Set<OfferFocus>(["summary", "trend", "traffic-sources", "profit-drivers", "customer-quality", "significant-events"]);

export function parseOfferDeepLink(value: URLSearchParams | string): OfferDeepLinkState {
  const params = typeof value === "string" ? new URLSearchParams(value.startsWith("?") ? value.slice(1) : value) : value;
  const focus = params.get("focus") as OfferFocus | null;
  return {
    version: parseVersion(params),
    offerId: isOpaqueId(params.get("offer_id")) ? params.get("offer_id") : null,
    focus: focus && FOCUS.has(focus) ? focus : null,
    trafficSourceId: isOpaqueId(params.get("traffic_source")) ? params.get("traffic_source") : null,
    driverId: isOpaqueId(params.get("driver")) ? params.get("driver") : null,
    eventId: isOpaqueId(params.get("event_id")) ? params.get("event_id") : null,
    drawer: parseDrawerTarget(params, OFFER_DRAWER_KINDS),
    searchRef: isOpaqueId(params.get("search_ref")) ? params.get("search_ref") : null,
    compare: params.get("compare") === "1",
    comparisonOfferIds: normalizedRepeatedIds(params.getAll("compare_offer")),
  };
}

function validDrawer(target: OfferDrawerTarget | null, snapshot?: OfferWorkspaceSnapshot | null) {
  if (!target || !snapshot) return null;
  if (target.kind === "traffic-source" && snapshot.trafficSources.some(item => item.id === target.recordId)) return target;
  if (target.kind === "profit-driver" && snapshot.profitDrivers.some(item => item.id === target.recordId)) return target;
  if (target.kind === "significant-event" && snapshot.significantEvents.some(item => item.id === target.recordId)) return target;
  if (target.kind === "intelligence" && snapshot.intelligence.some(item => item.id === target.recordId)) return target;
  if (target.kind === "comparison" && target.recordId === "conclusion") return target;
  return null;
}

export function normalizeOfferDeepLink(state: OfferDeepLinkState, offers: OfferSummary[], snapshot?: OfferWorkspaceSnapshot | null): OfferDeepLinkState {
  const offerId = offers.some(offer => offer.id === state.offerId) ? state.offerId : offers[0]?.id || null;
  const comparisonOfferIds = normalizedRepeatedIds(state.comparisonOfferIds).filter(id => offers.some(offer => offer.id === id));
  const drawer = validDrawer(state.drawer, snapshot);
  return {
    ...state,
    offerId,
    trafficSourceId: snapshot?.trafficSources.some(source => source.id === state.trafficSourceId) ? state.trafficSourceId : null,
    driverId: snapshot?.profitDrivers.some(driver => driver.id === state.driverId) ? state.driverId : null,
    eventId: snapshot?.significantEvents.some(event => event.id === state.eventId) ? state.eventId : null,
    drawer,
    drawerId: drawer ? `${drawer.kind}:${drawer.recordId}` : null,
    compare: state.compare && comparisonOfferIds.length >= 2,
    comparisonOfferIds,
  };
}

function legacyDrawer(value: string | null | undefined): OfferDrawerTarget | null {
  if (!value) return null;
  const [prefix, recordId] = value.split(":", 2);
  const kind = prefix === "traffic" ? "traffic-source" : prefix === "driver" ? "profit-driver" : prefix === "event" ? "significant-event" : prefix === "compare-conclusion" ? "comparison" : prefix;
  return OFFER_DRAWER_KINDS.has(kind as OfferDrawerTarget["kind"]) && isOpaqueId(recordId) ? { kind: kind as OfferDrawerTarget["kind"], recordId } : null;
}

export function offerDeepLinkHref(state: Partial<OfferDeepLinkState> = {}, _developmentIdentityId?: string): string {
  const params = new URLSearchParams();
  addVersion(params);
  if (state.offerId && isOpaqueId(state.offerId)) params.set("offer_id", state.offerId);
  if (state.focus && FOCUS.has(state.focus)) params.set("focus", state.focus);
  if (state.trafficSourceId && isOpaqueId(state.trafficSourceId)) params.set("traffic_source", state.trafficSourceId);
  if (state.driverId && isOpaqueId(state.driverId)) params.set("driver", state.driverId);
  if (state.eventId && isOpaqueId(state.eventId)) params.set("event_id", state.eventId);
  addDrawerTarget(params, state.drawer || legacyDrawer(state.drawerId));
  if (state.searchRef && isOpaqueId(state.searchRef)) params.set("search_ref", state.searchRef);
  if (state.compare) params.set("compare", "1");
  for (const id of normalizedRepeatedIds(state.comparisonOfferIds || [])) params.append("compare_offer", id);
  return `/offers?${params.toString()}`;
}

import type { OfferDeepLinkState, OfferFocus, OfferSummary, OfferWorkspaceSnapshot } from "./types";

const FOCUS = new Set<OfferFocus>(["summary", "trend", "traffic-sources", "profit-drivers", "customer-quality", "significant-events"]);

export function parseOfferDeepLink(value: URLSearchParams | string): OfferDeepLinkState {
  const params = typeof value === "string" ? new URLSearchParams(value.startsWith("?") ? value.slice(1) : value) : value;
  const focus = params.get("focus") as OfferFocus | null;
  return { offerId: params.get("offer_id"), focus: focus && FOCUS.has(focus) ? focus : null, trafficSourceId: params.get("traffic_source"), driverId: params.get("driver"), eventId: params.get("event_id"), drawerId: params.get("drawer"), search: params.get("search"), compare: params.get("compare") === "1", comparisonOfferIds: params.getAll("compare_offer") };
}

export function normalizeOfferDeepLink(state: OfferDeepLinkState, offers: OfferSummary[], snapshot?: OfferWorkspaceSnapshot | null): OfferDeepLinkState {
  const offerId = offers.some(offer => offer.id === state.offerId) ? state.offerId : offers[0]?.id || null;
  const validCompare = Array.from(new Set(state.comparisonOfferIds)).filter(id => offers.some(offer => offer.id === id)).slice(0, 4);
  const trafficSourceId = snapshot?.trafficSources.some(source => source.id === state.trafficSourceId) ? state.trafficSourceId : null;
  const driverId = snapshot?.profitDrivers.some(driver => driver.id === state.driverId) ? state.driverId : null;
  const eventId = snapshot?.significantEvents.some(event => event.id === state.eventId) ? state.eventId : null;
  const drawerIds = new Set([...(snapshot?.trafficSources.map(item => `traffic:${item.id}`) || []), ...(snapshot?.profitDrivers.map(item => `driver:${item.id}`) || []), ...(snapshot?.significantEvents.map(item => `event:${item.id}`) || []), ...(snapshot?.intelligence.map(item => `intelligence:${item.id}`) || [])]);
  return { ...state, offerId, trafficSourceId, driverId, eventId, drawerId: state.drawerId && drawerIds.has(state.drawerId) ? state.drawerId : null, compare: state.compare && validCompare.length >= 2, comparisonOfferIds: validCompare };
}

export function offerDeepLinkHref(state: Partial<OfferDeepLinkState>, developmentIdentityId: string): string {
  const params = new URLSearchParams();
  if (state.offerId) params.set("offer_id", state.offerId);
  if (state.focus) params.set("focus", state.focus);
  if (state.trafficSourceId) params.set("traffic_source", state.trafficSourceId);
  if (state.driverId) params.set("driver", state.driverId);
  if (state.eventId) params.set("event_id", state.eventId);
  if (state.drawerId) params.set("drawer", state.drawerId);
  if (state.search) params.set("search", state.search);
  if (state.compare) params.set("compare", "1");
  for (const id of state.comparisonOfferIds || []) params.append("compare_offer", id);
  params.set("dev_identity", developmentIdentityId);
  return `/offers?${params.toString()}`;
}

import type { OfferComparison, OfferDrawerRecord, OfferScope, OfferSearchResult, OfferSummary, OfferTrendMeasure, OfferTrendRange, OfferWorkspaceSnapshot } from "./types";

export interface OfferRepository {
  listOffers(scope: OfferScope): Promise<OfferSummary[]>;
  resolveOffer(scope: OfferScope, offerId: string): Promise<{ organizationId: string; offerId: string } | null>;
  loadWorkspace(scope: OfferScope, offerId: string): Promise<OfferWorkspaceSnapshot | null>;
  loadTrend(scope: OfferScope, offerId: string, range: OfferTrendRange, measures: OfferTrendMeasure[]): Promise<OfferWorkspaceSnapshot["trends"][OfferTrendRange]>;
  loadComparison(scope: OfferScope, offerIds: string[]): Promise<OfferComparison | null>;
  loadDrawer(scope: OfferScope, offerId: string, drawerId: string): Promise<OfferDrawerRecord | null>;
  search(scope: OfferScope, query: string): Promise<OfferSearchResult[]>;
}

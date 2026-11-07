import type { OfferRepository } from "./repository";
import type { OfferScope, OfferSummary, OfferWorkspaceSnapshot, OfferTrendRange, OfferTrendMeasure, OfferComparison, OfferDrawerRecord, OfferSearchResult } from "./types";
import { mockRepositoryScopeAllows } from "../identity/mock-repository-scope";

// Retained public adapter contract. Unobserved reporting is empty, never synthetic.
export class MockOfferRepository implements OfferRepository {
  async listOffers(scope: OfferScope): Promise<OfferSummary[]> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return [];
    return [];
  }
  async resolveOffer(scope: OfferScope, _offerId: string): Promise<{ organizationId: string; offerId: string } | null> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return null;
    return null;
  }
  async loadWorkspace(scope: OfferScope, _offerId: string): Promise<OfferWorkspaceSnapshot | null> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return null;
    return null;
  }
  async loadTrend(scope: OfferScope, _offerId: string, _range: OfferTrendRange, _measures: OfferTrendMeasure[]): Promise<OfferWorkspaceSnapshot["trends"][OfferTrendRange]> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return [];
    return [];
  }
  async loadComparison(scope: OfferScope, _offerIds: string[]): Promise<OfferComparison | null> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return null;
    return null;
  }
  async loadDrawer(scope: OfferScope, _offerId: string, _drawerId: string): Promise<OfferDrawerRecord | null> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return null;
    return null;
  }
  async search(scope: OfferScope, _query: string): Promise<OfferSearchResult[]> {
    if (!mockRepositoryScopeAllows(scope, "offers.view")) return [];
    return [];
  }
}
export const offerRepository: OfferRepository = new MockOfferRepository();

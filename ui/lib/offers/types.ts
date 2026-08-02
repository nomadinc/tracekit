import type { Identity } from "../identity/types";
import type { OfferDrawerTarget } from "@/lib/navigation/drawer-contract";

export type OfferTrendRange = 7 | 14 | 30;
export type OfferTrendMeasure = "profit" | "revenue" | "spend" | "orders" | "customers" | "roas" | "cpa";
export type OfferFocus = "summary" | "trend" | "traffic-sources" | "profit-drivers" | "customer-quality" | "significant-events";
export type OfferDrawerKind = OfferDrawerTarget["kind"] | "compare-conclusion";

export type OfferScope = { authenticated: boolean; identity: Identity; organizationId: string | null };
export type OfferSummary = { id: string; organizationId: string; name: string; mark: string; profit: number; trend: number; status: "Estimated" | "Reconciled"; trackingHealth: "Excellent" | "Degraded" | "Poor" };
export type OfferMetric = { id: string; label: string; value: number; format: "currency" | "number" | "percent" | "multiple" | "duration"; detail?: string; drawerId?: string };
export type OfferTrendPoint = { date: string; eventIds: string[] } & Record<OfferTrendMeasure, number>;
export type TrafficSourcePerformance = { id: string; name: string; spend: number; revenue: number; profit: number; roas: number; cpa: number; orders: number; refundRate: number; customerLtv: number; trackingHealth: "Excellent" | "Degraded" | "Poor"; trend: number; intelligenceId?: string };
export type ProfitDriver = { id: string; label: string; amount: number; impact: string; evidence: string[]; relatedObjects: string[]; intelligenceId?: string };
export type CustomerQualitySummary = { newCustomers: number; returningCustomers: number; lifetimeValue: number; refundRate: number; chargebackRate: number; repeatPurchaseRate: number; clickToPurchaseHours: number; trackingQuality: string; highValueContribution: number; customerIds: string[]; orderIds: string[]; intelligenceId?: string };
export type SignificantEvent = { id: string; date: string; title: string; change: string; outcome: string; relationship: "Observed" | "Inferred"; relatedObject: string; trafficSourceId?: string; evidence: string[]; intelligenceId?: string };
export type IntelligenceObservation = { id: string; placement: "profit" | "tracking" | "trend" | "traffic" | "driver" | "customer-quality" | "event" | "compare"; fact: string; inference: string; whyItMatters: string; recommendation: string; evidenceStrength: string; evidence: string[]; relatedObjects: string[] };
export type OfferDrawerRecord = { id: string; kind: OfferDrawerKind; title: string; question: string; summary: string; facts: Array<{ label: string; value: string }>; evidence: string[]; relatedObjects: Array<{ type: "Customer" | "Order" | "Campaign" | "Creative" | "Affiliate" | "Evidence"; id: string; label: string }> };

export type OfferWorkspaceSnapshot = {
  offer: OfferSummary;
  revenue: number;
  spend: number;
  orders: number;
  customers: number;
  averageOrderValue: number;
  profitMargin: number;
  roas: number;
  cpa: number;
  refundRate: number;
  chargebackRate: number;
  trendLabel: string;
  attention: string;
  incompleteFinancialData?: string[];
  trends: Record<OfferTrendRange, OfferTrendPoint[]>;
  trafficSources: TrafficSourcePerformance[];
  profitDrivers: ProfitDriver[];
  customerQuality: CustomerQualitySummary;
  significantEvents: SignificantEvent[];
  intelligence: IntelligenceObservation[];
};

export type ComparisonMetric = { id: string; label: string; format: OfferMetric["format"]; values: Record<string, number | string> };
export type ComparisonTrafficSource = { sourceId: string; sourceName: string; offerValues: Record<string, Pick<TrafficSourcePerformance, "spend" | "revenue" | "profit" | "roas" | "cpa" | "orders" | "refundRate" | "customerLtv" | "trackingHealth">> };
export type ComparisonConclusion = { bestOfferId: string; strongest: { offerId: string; sourceId: string }; weakest: { offerId: string; sourceId: string }; drivers: string[]; recommendation: string; evidence: string[] };
export type OfferComparison = { offers: OfferSummary[]; metrics: ComparisonMetric[]; trafficSources: ComparisonTrafficSource[]; conclusion: ComparisonConclusion };
export type OfferSearchResult = { id: string; type: string; title: string; subtitle: string; value: string; href: string };

export type OfferDeepLinkState = { version: 1; offerId: string | null; focus: OfferFocus | null; trafficSourceId: string | null; driverId: string | null; eventId: string | null; drawer: OfferDrawerTarget | null; drawerId?: string | null; searchRef: string | null; search?: string | null; compare: boolean; comparisonOfferIds: string[] };

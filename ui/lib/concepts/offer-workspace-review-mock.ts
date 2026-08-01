import { offerContexts, type Health, type OfferContext, type TrafficSource } from "./offer-workspace-mock";

export type TrendMeasure = "profit" | "revenue" | "spend" | "cpa" | "roas" | "orders";
export type TrendRange = 7 | 14 | 30;
export type TrendDatum = Record<TrendMeasure, number> & { date: string };
export type SourceComparison = TrafficSource & { refundRate: number; ltv: number; repeatRate: number };
export type IntelligenceMoment = {
  id: string;
  placement: "profit" | "trend" | "traffic" | "driver" | "customer" | "event" | "tracking";
  observation: string;
  comparison: string;
  inference: string;
  recommendation: string;
  confidence: "Strong evidence" | "Moderate evidence";
  evidence: string[];
};

const sourceNames = ["Meta / Facebook", "Google", "TikTok", "Affiliates", "Native", "Email", "Organic"];
const sourceScale: Record<string, number> = { "Meta / Facebook": 1, Google: .68, TikTok: .34, Affiliates: .52, Native: .29, Email: .18, Organic: .14 };

export function sourceComparisons(offer: OfferContext): SourceComparison[] {
  return sourceNames.map((name, index) => {
    const existing = offer.traffic.find(source => source.name === name);
    const scale = sourceScale[name];
    const spend = existing?.spend ?? Math.round(offer.spend * scale * .18);
    const revenue = existing?.revenue ?? Math.round(spend * (1.7 + ((offer.id.length + index) % 5) * .38));
    const orders = existing?.orders ?? Math.max(18, Math.round(revenue / offer.aov));
    const profit = existing?.profit ?? Math.round(revenue * (offer.margin / 100) - spend * .12);
    return {
      id: existing?.id ?? `${offer.id}-${name.toLowerCase().replace(/\W+/g, "-")}`,
      name,
      spend,
      revenue,
      profit,
      roas: existing?.roas ?? +(revenue / Math.max(spend, 1)).toFixed(2),
      cpa: existing?.cpa ?? +(spend / Math.max(orders, 1)).toFixed(2),
      orders,
      quality: existing?.quality ?? (index % 2 ? "Strong" : "Moderate"),
      trend: existing?.trend ?? (index % 3 ? "+2.4%" : "-1.2%"),
      health: existing?.health ?? offer.health,
      campaigns: existing?.campaigns ?? [`${name} acquisition`],
      refundRate: +(Math.max(.8, offer.refundRate + (index - 3) * .28)).toFixed(1),
      ltv: Math.round(offer.customerQuality.ltv * (.84 + index * .065)),
      repeatRate: +(offer.customerQuality.repeatRate * (.82 + index * .05)).toFixed(1),
    };
  });
}

export function trendSeries(offer: OfferContext, days: TrendRange): TrendDatum[] {
  const base = offer.trendPoints;
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(2026, 6, 31 - (days - 1 - index));
    const seed = base[index % base.length];
    const progression = 1 + ((index - days / 2) / days) * (offer.trend / 100);
    const revenue = Math.round(seed.revenue * progression);
    const spend = Math.round(seed.spend * (1 + ((index % 4) - 1.5) * .012));
    const orders = Math.max(1, Math.round(revenue / offer.aov));
    return {
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      profit: Math.round(seed.profit * progression),
      revenue,
      spend,
      cpa: +(spend / Math.max(orders, 1)).toFixed(2),
      roas: +(revenue / Math.max(spend, 1)).toFixed(2),
      orders,
    };
  });
}

export function intelligenceFor(offer: OfferContext): IntelligenceMoment[] {
  const sources = sourceComparisons(offer);
  const bestLtv = [...sources].sort((a, b) => b.ltv - a.ltv)[0];
  const meta = sources.find(source => source.name === "Meta / Facebook")!;
  return [
    { id: "profit", placement: "profit", observation: `Profit ${offer.trend >= 0 ? "increased" : "declined"} ${Math.abs(offer.trend)}% as acquisition efficiency changed.`, comparison: `${offer.trendLabel}; current CPA is $${offer.cpa.toFixed(2)}.`, inference: "CPA movement is a likely contributor; other Profit Drivers also changed.", recommendation: offer.trend >= 0 ? "Protect the most efficient Traffic Sources while monitoring customer quality." : "Review declining sources before increasing budget.", confidence: "Moderate evidence", evidence: ["Daily qualified Profit", "Attributed Spend", "Customer acquisitions"] },
    { id: "traffic", placement: "traffic", observation: `${bestLtv.name} generates the highest customer lifetime value.`, comparison: `$${bestLtv.ltv} LTV versus $${Math.round(offer.customerQuality.ltv)} Offer average.`, inference: "This source is producing more durable Customers in the selected period.", recommendation: "Inspect capacity and CPA before testing additional budget.", confidence: "Strong evidence", evidence: ["Traffic Source cohorts", "Repeat Orders", "Customer lifetime value"] },
    { id: "meta", placement: "trend", observation: `Meta CPA is $${meta.cpa.toFixed(2)} and ${meta.trend.startsWith("-") ? "declining" : "moving"}.`, comparison: `${meta.trend} versus the prior comparison period.`, inference: "Recent Creative and budget changes may be contributing.", recommendation: "Inspect the annotated changes before adjusting Meta budget.", confidence: "Moderate evidence", evidence: ["Meta Spend", "Matched Orders", "Campaign change records"] },
    { id: "shipping", placement: "driver", observation: `Shipping Margin is ${offer.shippingMargin < 0 ? "negative" : "positive"} at $${Math.abs(offer.shippingMargin).toLocaleString()}.`, comparison: "Compared with customer Shipping Charged and observed carrier costs.", inference: "Shipping economics are materially affecting Offer margin.", recommendation: "Review Shipping terms and carrier costs.", confidence: "Strong evidence", evidence: ["Shipping Charged", "Carrier costs", "Packaging Financial Events"] },
    { id: "customer", placement: "customer", observation: `${bestLtv.name} also has a ${bestLtv.repeatRate}% repeat-purchase rate.`, comparison: `${offer.customerQuality.repeatRate}% repeat rate across the Offer.`, inference: "Source mix is affecting Customer quality.", recommendation: "Protect high-quality acquisition while scaling.", confidence: "Strong evidence", evidence: ["Customer cohorts", "Repeat Orders", "Attribution Relationships"] },
    { id: "tracking", placement: "tracking", observation: `Tracking Health is ${offer.health}.`, comparison: offer.health === "Excellent" ? "Expected tracking Evidence is present." : "Some expected Evidence is missing or partial.", inference: offer.health === "Excellent" ? "Performance comparisons are well supported." : "Reported source contribution may change as Evidence arrives.", recommendation: offer.health === "Excellent" ? "Continue monitoring." : "Resolve tracking gaps before reallocating budget.", confidence: offer.health === "Excellent" ? "Strong evidence" : "Moderate evidence", evidence: ["Tracking Diagnostics", "Attribution completeness", "Connector status"] },
    { id: "event", placement: "event", observation: offer.timeline[0] ? `Performance changed after “${offer.timeline[0].title}.”` : "No material business change was observed.", comparison: offer.timeline[0]?.outcome ?? "No matching-period change record.", inference: "The event is a likely contributor; the observed sequence does not prove causation.", recommendation: "Inspect the event marker and supporting comparison before acting.", confidence: "Moderate evidence", evidence: offer.timeline[0]?.evidence ?? ["Business change records", "Daily performance"] },
  ];
}

export function healthRank(health: Health) { return health === "Excellent" ? 3 : health === "Degraded" ? 2 : 1; }
export { offerContexts };

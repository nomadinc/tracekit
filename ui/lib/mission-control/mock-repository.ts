import type { MissionControlRepository } from "./repository";
import type { BusinessRange, MissionControlSnapshot, MissionItem, TrendPoint } from "./types";

const baseTrend = [
  { profit: 47200, revenue: 228000, spend: 81200, orders: 1380, customers: 1240, roas: 2.81, cpa: 65.48 },
  { profit: 49100, revenue: 234000, spend: 82400, orders: 1410, customers: 1275, roas: 2.84, cpa: 64.63 },
  { profit: 48600, revenue: 231000, spend: 83800, orders: 1398, customers: 1260, roas: 2.76, cpa: 66.51 },
  { profit: 51400, revenue: 242000, spend: 84700, orders: 1455, customers: 1312, roas: 2.86, cpa: 64.56 },
  { profit: 53200, revenue: 251000, spend: 85600, orders: 1510, customers: 1360, roas: 2.93, cpa: 62.94 },
  { profit: 54800, revenue: 258000, spend: 86200, orders: 1540, customers: 1398, roas: 2.99, cpa: 61.66 },
  { profit: 56200, revenue: 264000, spend: 87100, orders: 1584, customers: 1430, roas: 3.03, cpa: 60.91 },
];

function trend(range: BusinessRange): TrendPoint[] {
  const count = range === "7 Days" ? 7 : range === "14 Days" ? 14 : range === "30 Days" ? 30 : range === "90 Days" ? 18 : 24;
  return Array.from({ length: count }, (_, index) => {
    const source = baseTrend[index % baseTrend.length];
    const progression = 1 + (index - count / 2) * 0.004;
    const date = new Date(2026, 6, 31 - (count - 1 - index) * (range === "Year" ? 15 : range === "90 Days" ? 5 : 1));
    return {
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      profit: Math.round(source.profit * progression),
      revenue: Math.round(source.revenue * progression),
      spend: Math.round(source.spend * progression),
      orders: Math.round(source.orders * progression),
      customers: Math.round(source.customers * progression),
      roas: +(source.roas * progression).toFixed(2),
      cpa: +(source.cpa * progression).toFixed(2),
    };
  });
}

const attention: MissionItem[] = [
  { id: "shipping", business: "Bullseye", businessContextId: "offer-bullseye", mark: "B", title: "Shipping Margin declined 18%", detail: "$12,480 below the prior period", tone: "Warning", action: "Open Offer", destination: "offer", question: "Should I investigate this shipping change?", explanation: "Actual Shipping Cost increased while Shipping Charged remained unchanged.", evidence: ["3,240 matched Orders", "Carrier cost imports", "Shipping Charged", "Packaging costs"], intelligence: { comparison: "Shipping Margin is $3.40 per Order below the 30-day average.", recommendation: "Review shipping terms before increasing Meta spend.", confidence: "Strong evidence" } },
  { id: "meta", business: "Meta", businessContextId: "offer-bullseye", mark: "M", title: "CPA increased 22%", detail: "Three consecutive days above target", tone: "Warning", action: "Investigate", destination: "offer", question: "Should I investigate this acquisition change?", explanation: "Meta acquisition cost increased after the latest Campaign budget change.", evidence: ["Attributed Meta Spend", "Matched Customer acquisitions", "Campaign change record"], intelligence: { comparison: "CPA is $11.20 above the previous seven-day period.", recommendation: "Inspect the affected Campaigns before adding budget.", confidence: "Moderate evidence" } },
  { id: "valuerx", business: "ValueRx", businessContextId: "offer-valuerx-individual", mark: "VR", title: "Highest weekly Profit", detail: "$112,840 Reconciled Profit", tone: "Opportunity", action: "View", destination: "offer", question: "Should I invest more in ValueRx?", explanation: "ValueRx currently combines the strongest Profit Margin with lower CPA and refunds.", evidence: ["Reconciled Profit", "Traffic Source cohorts", "Refund Financial Events"], intelligence: { comparison: "Profit Margin is 9.3 points above Bullseye.", recommendation: "Review ValueRx Affiliates for the next bounded budget test.", confidence: "Strong evidence" } },
  { id: "tracking", business: "Manifest RX", mark: "MR", title: "Tracking degraded", detail: "Financial reconciliation remains partial", tone: "Warning", action: "Open Offer", destination: "offer", question: "Should I investigate this tracking change?", explanation: "Expected tracking Evidence is incomplete and may affect source-level conclusions.", evidence: ["Tracking Diagnostics", "Connector status", "Pending financial Evidence"] },
  { id: "affiliate-quality", business: "ValueRx", businessContextId: "offer-valuerx-individual", mark: "VR", title: "Affiliate quality improving", detail: "Customer LTV increased 24%", tone: "Opportunity", action: "Open Offer", destination: "offer", question: "Should I investigate this Customer quality improvement?", explanation: "Affiliate-acquired Customers have stronger repeat purchase and lifetime value.", evidence: ["Affiliate cohorts", "Repeat Orders", "Customer lifetime value"] },
];

const snapshot: MissionControlSnapshot = {
  generatedAt: "2026-08-01T08:00:00-07:00",
  businessHealth: { label: "Healthy", opportunities: 2, warnings: 1, critical: 0 },
  trends: { "7 Days": trend("7 Days"), "14 Days": trend("14 Days"), "30 Days": trend("30 Days"), "90 Days": trend("90 Days"), Year: trend("Year") },
  businesses: [
    { id: "bullseye", businessContextId: "offer-bullseye", mark: "B", name: "Bullseye", profit: 18240, trend: 6.8, tracking: "Excellent" },
    { id: "valuerx", businessContextId: "offer-valuerx-individual", mark: "VR", name: "ValueRx", profit: 22480, trend: 12.6, tracking: "Excellent" },
    { id: "petes", businessContextId: "offer-petes", mark: "PP", name: "Pete's Pasta", profit: 8640, trend: 4.7, tracking: "Excellent" },
    { id: "manifest", businessContextId: "offer-manifest", mark: "MR", name: "Manifest RX", profit: 5120, trend: -5.8, tracking: "Poor" },
  ],
  briefing: { opportunities: 2, warnings: 1, recommendations: 1, observation: "The business is healthy, with ValueRx leading Profit while Bullseye shipping and Meta CPA require review.", reason: "Profit improved overall, but acquisition and shipping economics diverged across Offers.", recommendation: "Review the two warnings before reallocating budget toward the strongest opportunity.", evidence: ["Qualified business Profit", "Offer comparisons", "Attributed Spend", "Shipping Financial Events"] },
  attention,
  winners: [
    { label: "Highest Profit", value: "ValueRx", detail: "$22,480 today" }, { label: "Highest ROAS", value: "Pete's Pasta", detail: "4.2×" }, { label: "Lowest CPA", value: "ValueRx Affiliates", detail: "$38.20" }, { label: "Highest LTV", value: "ValueRx Family", detail: "$326" }, { label: "Best Traffic Source", value: "Affiliates", detail: "$18,420 Profit" }, { label: "Most Improved Offer", value: "ValueRx", detail: "+12.6% Profit" },
  ],
  continuation: { businessContextId: "offer-bullseye", business: "Bullseye", subject: "Shipping Margin", detail: "Resume yesterday's investigation in the Offer Workspace." },
  recentActivity: [
    { id: "a1", type: "Offer", title: "Bullseye", detail: "Shipping Margin · viewed 2 hours ago", destination: "offer", businessContextId: "offer-bullseye" },
    { id: "a2", type: "Customer", title: "John Smith", detail: "Investigated yesterday", destination: "customer" },
    { id: "a3", type: "Order", title: "Order TK-10482", detail: "Processor fee Evidence", destination: "order" },
    { id: "a4", type: "Connector", title: "Manifest RX", detail: "Tracking Health reviewed", destination: "offer" },
  ],
  recentSearches: [
    { id: "s1", type: "Everflow Transaction ID", value: "ef_offer_771", destination: "customer" },
    { id: "s2", type: "Offer", value: "Bullseye", destination: "offer", businessContextId: "offer-bullseye" },
    { id: "s3", type: "Customer", value: "john@example.com", destination: "customer" },
    { id: "s4", type: "Order", value: "TK-10482", destination: "order" },
  ],
};

export class MockMissionControlRepository implements MissionControlRepository {
  async getMissionControl(): Promise<MissionControlSnapshot> {
    return structuredClone(snapshot);
  }
}

export const missionControlRepository: MissionControlRepository = new MockMissionControlRepository();

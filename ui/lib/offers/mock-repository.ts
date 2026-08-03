import { hasPermission } from "../identity/authorization";
import { mockRepositoryScopeAllows } from "../identity/mock-repository-scope";
import { withDevelopmentIdentity } from "../identity/development-state";
import { offerDeepLinkHref } from "./deep-link";
import type { OfferRepository } from "./repository";
import type {
  IntelligenceObservation,
  OfferComparison,
  OfferDrawerRecord,
  OfferFocus,
  OfferScope,
  OfferSummary,
  OfferTrendMeasure,
  OfferTrendPoint,
  OfferTrendRange,
  OfferWorkspaceSnapshot,
  ProfitDriver,
  SignificantEvent,
  TrafficSourcePerformance,
} from "./types";

type OfferSeed = OfferSummary & {
  revenue: number;
  spend: number;
  orders: number;
  customers: number;
  margin: number;
  roas: number;
  cpa: number;
  refund: number;
  chargeback: number;
  aov: number;
  ltv: number;
  repeat: number;
  shippingMargin: number;
};

const seeds: OfferSeed[] = [
  {
    id: "offer-bullseye",
    organizationId: "org-bullseye",
    name: "Bullseye",
    mark: "B",
    profit: 18240,
    trend: 6.8,
    status: "Reconciled",
    trackingHealth: "Excellent",
    revenue: 224900,
    spend: 87420,
    orders: 1584,
    customers: 1430,
    margin: 8.1,
    roas: 2.57,
    cpa: 61.13,
    refund: 5.2,
    chargeback: 0.8,
    aov: 142,
    ltv: 238,
    repeat: 22.4,
    shippingMargin: -4.62,
  },
  {
    id: "offer-bullseye-retention",
    organizationId: "org-bullseye",
    name: "Bullseye Retention",
    mark: "BR",
    profit: 26480,
    trend: 11.2,
    status: "Estimated",
    trackingHealth: "Degraded",
    revenue: 148200,
    spend: 31800,
    orders: 1124,
    customers: 864,
    margin: 17.9,
    roas: 4.66,
    cpa: 36.81,
    refund: 3.1,
    chargeback: 0.4,
    aov: 132,
    ltv: 286,
    repeat: 38.2,
    shippingMargin: 1.28,
  },
  {
    id: "offer-valuerx-individual",
    organizationId: "org-valuerx",
    name: "ValueRx Individual",
    mark: "V1",
    profit: 22480,
    trend: 12.6,
    status: "Reconciled",
    trackingHealth: "Excellent",
    revenue: 194600,
    spend: 62400,
    orders: 1428,
    customers: 1312,
    margin: 17.5,
    roas: 3.12,
    cpa: 47.56,
    refund: 3.1,
    chargeback: 0.3,
    aov: 136,
    ltv: 298,
    repeat: 31.8,
    shippingMargin: 0.56,
  },
  {
    id: "offer-valuerx-family",
    organizationId: "org-valuerx",
    name: "ValueRx Family",
    mark: "VF",
    profit: 20840,
    trend: 4.2,
    status: "Estimated",
    trackingHealth: "Excellent",
    revenue: 176400,
    spend: 58800,
    orders: 934,
    customers: 882,
    margin: 11.8,
    roas: 3,
    cpa: 66.67,
    refund: 4.2,
    chargeback: 0.5,
    aov: 189,
    ltv: 326,
    repeat: 34.1,
    shippingMargin: 0.42,
  },
  {
    id: "offer-petes",
    organizationId: "org-petes",
    name: "Pete's Pasta",
    mark: "PP",
    profit: 8640,
    trend: 4.7,
    status: "Reconciled",
    trackingHealth: "Excellent",
    revenue: 78600,
    spend: 18600,
    orders: 724,
    customers: 548,
    margin: 11,
    roas: 4.23,
    cpa: 33.94,
    refund: 1.8,
    chargeback: 0.2,
    aov: 109,
    ltv: 244,
    repeat: 42.7,
    shippingMargin: -1.16,
  },
];

const sourceNames = [
  "Meta / Facebook",
  "Google",
  "TikTok",
  "Affiliates",
  "Native",
  "Email",
  "Organic",
];
const driverNames = [
  "Media cost",
  "Affiliate commission",
  "Refunds",
  "Chargebacks",
  "Processor fees",
  "COGS",
  "Shipping charged",
  "Actual shipping cost",
  "Packaging",
  "Taxes",
  "Discounts",
  "Upsell performance",
  "Order-bump performance",
];

function sources(seed: OfferSeed): TrafficSourcePerformance[] {
  const weights = [0.38, 0.2, 0.08, 0.17, 0.06, 0.07, 0.04];
  return sourceNames.map((name, index) => {
    const weight = weights[index];
    const spend = index >= 5 ? 0 : Math.round(seed.spend * weight);
    const revenue = Math.round(
      seed.revenue * weight * (index === 3 ? 1.18 : 1),
    );
    const profit = Math.round(
      seed.profit * weight * (index === 3 ? 1.35 : index === 0 ? 0.78 : 1),
    );
    const orders = Math.round(seed.orders * weight);
    return {
      id: name
        .toLowerCase()
        .replace(/[^a-z]+/g, "-")
        .replace(/^-|-$/g, ""),
      name,
      spend,
      revenue,
      profit,
      roas: spend ? +(revenue / spend).toFixed(2) : 0,
      cpa: spend ? +(spend / Math.max(orders, 1)).toFixed(2) : 0,
      orders,
      refundRate: +(seed.refund * (index === 0 ? 1.14 : 0.92)).toFixed(1),
      customerLtv: Math.round(
        seed.ltv * (index === 3 ? 1.24 : index === 5 ? 1.12 : 0.96),
      ),
      trackingHealth:
        index === 2 && seed.trackingHealth !== "Excellent"
          ? "Poor"
          : seed.trackingHealth,
      trend: +(seed.trend - index * 1.4).toFixed(1),
      intelligenceId:
        index === 0 || index === 3 ? `traffic-${index}` : undefined,
    };
  });
}

function drivers(seed: OfferSeed): ProfitDriver[] {
  const amounts = [
    -seed.spend,
    -seed.revenue * 0.08,
    (-seed.revenue * seed.refund) / 100,
    (-seed.revenue * seed.chargeback) / 100,
    -seed.revenue * 0.029,
    -seed.revenue * 0.23,
    seed.revenue * 0.025,
    -seed.revenue * 0.041,
    -seed.orders * 0.62,
    -seed.revenue * 0.06,
    -seed.revenue * 0.015,
    seed.revenue * 0.12,
    seed.revenue * 0.05,
  ];
  return driverNames.map((label, index) => ({
    id: label
      .toLowerCase()
      .replace(/[^a-z]+/g, "-")
      .replace(/^-|-$/g, ""),
    label,
    amount: Math.round(amounts[index]),
    impact:
      amounts[index] >= 0 ? "Increases Offer Profit" : "Reduces Offer Profit",
    evidence: [
      `Qualified ${label} records`,
      "Matched Orders",
      seed.status === "Reconciled"
        ? "Reconciled reporting period"
        : "Available financial inputs",
    ],
    relatedObjects:
      index < 2 ? ["Campaigns", "Orders"] : ["Orders", "Financial Events"],
    intelligenceId: label === "Actual shipping cost" ? "shipping" : undefined,
  }));
}

function events(seed: OfferSeed): SignificantEvent[] {
  return [
    {
      id: "landing-page-update",
      date: "Jul 25",
      title: "Landing Page updated",
      change: "The primary Landing Page changed.",
      outcome: "Conversion rate improved 8% afterward.",
      relationship: "Observed",
      relatedObject: "Landing Page LP-204",
      trafficSourceId: "meta-facebook",
      evidence: [
        "Published Landing Page version",
        "Conversion observations before and after",
      ],
    },
    {
      id: "shipping-price-change",
      date: "Jul 18",
      title: "Shipping charge increased",
      change: "Shipping Charged increased by $2.00.",
      outcome: `Shipping Margin moved to $${seed.shippingMargin.toFixed(2)} per Order.`,
      relationship: "Observed",
      relatedObject: "Offer terms",
      evidence: [
        "Offer configuration history",
        "Matched shipping Financial Events",
      ],
      intelligenceId: "shipping",
    },
    {
      id: "meta-creative-launch",
      date: "Jul 22",
      title: "New Meta Creative launched",
      change: "Creative CR-882 entered delivery.",
      outcome: "CPA declined during the following period.",
      relationship: "Inferred",
      relatedObject: "Creative CR-882",
      trafficSourceId: "meta-facebook",
      evidence: [
        "Creative launch timestamp",
        "Attributed Spend and Customer acquisition",
      ],
    },
    {
      id: "affiliate-launch",
      date: "Jul 27",
      title: "Affiliate 104 launched",
      change: "A new Affiliate began sending traffic.",
      outcome: "Customer LTV increased in the Affiliate cohort.",
      relationship: "Observed",
      relatedObject: "Affiliate 104",
      trafficSourceId: "affiliates",
      evidence: ["Affiliate activation", "Customer cohort comparison"],
    },
  ];
}

function intelligence(seed: OfferSeed): IntelligenceObservation[] {
  return [
    {
      id: "profit",
      placement: "profit",
      fact: `Profit changed ${seed.trend > 0 ? "+" : ""}${seed.trend}% in the selected period.`,
      inference: "Acquisition efficiency is a likely contributor.",
      whyItMatters: "The change affects the decision to increase spend.",
      recommendation:
        "Inspect Traffic Source efficiency before changing budget.",
      evidenceStrength: "Strong evidence",
      evidence: ["Qualified Profit", "Attributed Spend", "Matched Orders"],
      relatedObjects: ["Traffic Sources", "Orders"],
    },
    {
      id: "trend",
      placement: "trend",
      fact: "Performance changed after the Landing Page update.",
      inference:
        "The update is a likely contributor; causation is not asserted.",
      whyItMatters: "The change may explain improving conversion economics.",
      recommendation:
        "Continue the bounded test while monitoring Profit and refunds.",
      evidenceStrength: "Moderate evidence",
      evidence: ["Landing Page version history", "Daily performance series"],
      relatedObjects: ["Landing Page", "Campaign"],
    },
    {
      id: "traffic-0",
      placement: "traffic",
      fact: "Meta CPA increased for three consecutive days.",
      inference: "Recent budget expansion may be reducing efficiency.",
      whyItMatters: "Higher CPA compresses Offer margin.",
      recommendation: "Review affected Campaigns before increasing spend.",
      evidenceStrength: "Moderate evidence",
      evidence: ["Attributed Meta Spend", "Customer acquisitions"],
      relatedObjects: ["Campaigns", "Creatives"],
    },
    {
      id: "traffic-3",
      placement: "traffic",
      fact: "Affiliates generate the highest Customer LTV.",
      inference: "Affiliate cohorts appear more durable.",
      whyItMatters:
        "Higher-value Customers support greater allowable acquisition cost.",
      recommendation: "Inspect Affiliate 104 for the next bounded budget test.",
      evidenceStrength: "Strong evidence",
      evidence: ["Affiliate cohorts", "Repeat Orders"],
      relatedObjects: ["Affiliates", "Customers"],
    },
    {
      id: "shipping",
      placement: "driver",
      fact: `Shipping Margin is ${seed.shippingMargin < 0 ? "negative" : "positive"} at $${seed.shippingMargin.toFixed(2)} per Order.`,
      inference: "Carrier cost and Shipping Charged are misaligned.",
      whyItMatters: "Shipping economics directly affect Profit.",
      recommendation: "Review shipping terms and carrier costs.",
      evidenceStrength: "Strong evidence",
      evidence: ["Shipping Charged", "Carrier costs", "Packaging"],
      relatedObjects: ["Orders", "Financial Events"],
    },
    {
      id: "customer-quality",
      placement: "customer-quality",
      fact: `Repeat Purchase Rate is ${seed.repeat}%.`,
      inference: "Customer durability is supporting lifetime value.",
      whyItMatters: "Customer quality changes the acceptable acquisition cost.",
      recommendation: "Compare source cohorts before reallocating budget.",
      evidenceStrength: "Strong evidence",
      evidence: ["Repeat Orders", "Customer cohorts"],
      relatedObjects: ["Customers", "Orders"],
    },
  ];
}

function trend(seed: OfferSeed, range: OfferTrendRange): OfferTrendPoint[] {
  return Array.from({ length: range }, (_, index) => {
    const ratio = 0.84 + index * (0.16 / Math.max(range - 1, 1));
    const date = new Date(2026, 6, 31 - (range - 1 - index));
    const eventIds =
      index === Math.round(range * 0.35)
        ? ["meta-creative-launch"]
        : index === Math.round(range * 0.65)
          ? ["landing-page-update"]
          : [];
    return {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      eventIds,
      profit: Math.round(seed.profit * ratio),
      revenue: Math.round(seed.revenue * ratio),
      spend: Math.round(seed.spend * ratio),
      orders: Math.round(seed.orders * ratio),
      customers: Math.round(seed.customers * ratio),
      roas: +(seed.roas * ratio).toFixed(2),
      cpa: +(seed.cpa / Math.max(ratio, 0.1)).toFixed(2),
    };
  });
}

function workspace(seed: OfferSeed): OfferWorkspaceSnapshot {
  const related = seed.id === "offer-bullseye"
    ? { customerIds: ["cust-123", "cust-124"], orderIds: ["ord-123", "ord-125"] }
    : seed.id === "offer-bullseye-retention"
      ? { customerIds: ["cust-125"], orderIds: ["ord-126"] }
      : seed.id === "offer-valuerx-individual"
        ? { customerIds: ["cust-vrx-1"], orderIds: ["ord-vrx-1"] }
        : { customerIds: [], orderIds: [] };
  return {
    offer: {
      id: seed.id,
      organizationId: seed.organizationId,
      name: seed.name,
      mark: seed.mark,
      profit: seed.profit,
      trend: seed.trend,
      status: seed.status,
      trackingHealth: seed.trackingHealth,
    },
    revenue: seed.revenue,
    spend: seed.spend,
    orders: seed.orders,
    customers: seed.customers,
    averageOrderValue: seed.aov,
    profitMargin: seed.margin,
    roas: seed.roas,
    cpa: seed.cpa,
    refundRate: seed.refund,
    chargebackRate: seed.chargeback,
    trendLabel: `${seed.trend >= 0 ? "Up" : "Down"} ${Math.abs(seed.trend)}% versus the prior period`,
    attention:
      seed.shippingMargin < 0
        ? "Shipping Margin requires attention"
        : "No critical issue",
    incompleteFinancialData:
      seed.status === "Estimated" ? ["Monthly processor statement"] : undefined,
    trends: { 7: trend(seed, 7), 14: trend(seed, 14), 30: trend(seed, 30) },
    trafficSources: sources(seed),
    profitDrivers: drivers(seed),
    customerQuality: {
      newCustomers: Math.round(seed.customers * 0.76),
      returningCustomers: Math.round(seed.customers * 0.24),
      lifetimeValue: seed.ltv,
      refundRate: seed.refund,
      chargebackRate: seed.chargeback,
      repeatPurchaseRate: seed.repeat,
      clickToPurchaseHours: 5.8,
      trackingQuality: seed.trackingHealth,
      highValueContribution: 38.4,
      customerIds: related.customerIds,
      orderIds: related.orderIds,
      intelligenceId: "customer-quality",
    },
    significantEvents: events(seed),
    intelligence: intelligence(seed),
  };
}

function allowedSeeds(scope: OfferScope): OfferSeed[] {
  if (
    !scope.authenticated ||
    !mockRepositoryScopeAllows(scope, "offers.view")
  )
    return [];
  return seeds.filter(
    (seed) =>
      seed.organizationId === scope.mockOrganizationId &&
      scope.accessibleOfferIds.includes(seed.id),
  );
}

const clone = <T>(value: T): T => structuredClone(value);

function searchRecords(seed: OfferSeed, identityId: string) {
  const offer = (focus: OfferFocus, extra: Record<string, unknown> = {}) =>
    withDevelopmentIdentity(offerDeepLinkHref({ offerId: seed.id, focus, ...extra }), identityId);
  return [
    {
      id: `offer:${seed.id}`,
      type: "Offer",
      title: seed.name,
      subtitle: "Offer Workspace",
      value: seed.name,
      href: offer("summary"),
    },
    {
      id: `url:${seed.id}`,
      type: "Offer URL",
      title: `${seed.name} Offer URL`,
      subtitle: "Landing Page",
      value: `https://${seed.name.toLowerCase().replace(/[^a-z]+/g, "")}.example/offer`,
      href: offer("significant-events", {
        eventId: "landing-page-update",
        drawerId: "event:landing-page-update",
      }),
    },
    {
      id: `campaign:${seed.id}`,
      type: "Campaign",
      title: `${seed.name} Campaign 101`,
      subtitle: "Meta / Facebook",
      value: "campaign 101",
      href: offer("traffic-sources", {
        trafficSourceId: "meta-facebook",
        drawerId: "traffic:meta-facebook",
      }),
    },
    {
      id: `affiliate:${seed.id}`,
      type: "Affiliate",
      title: `${seed.name} Affiliates`,
      subtitle: "Affiliate 104",
      value: "affiliate 104",
      href: offer("traffic-sources", {
        trafficSourceId: "affiliates",
        drawerId: "traffic:affiliates",
      }),
    },
    {
      id: `creative:${seed.id}`,
      type: "Creative",
      title: "Creative CR-882",
      subtitle: seed.name,
      value: "CR-882",
      href: offer("significant-events", {
        eventId: "meta-creative-launch",
        drawerId: "event:meta-creative-launch",
      }),
    },
    {
      id: `order:${seed.id}`,
      type: "Order",
      title: "Order TK-10482",
      subtitle: seed.name,
      value: "TK-10482",
      href: offer("summary", { searchRef: `search-order-${seed.id}` }),
    },
    {
      id: `customer:${seed.id}`,
      type: "Customer",
      title: "john.smith@example.com",
      subtitle: seed.name,
      value: "john.smith@example.com",
      href: offer("customer-quality", { searchRef: `search-customer-${seed.id}` }),
    },
    {
      id: `everflow:${seed.id}`,
      type: "Everflow Transaction ID",
      title: "EF-8D29A1",
      subtitle: seed.name,
      value: "EF-8D29A1",
      href: offer("traffic-sources", {
        trafficSourceId: "affiliates",
        drawer: { kind: "traffic-source", recordId: "affiliates" },
        searchRef: `search-everflow-${seed.id}`,
      }),
    },
    {
      id: `fbclid:${seed.id}`,
      type: "fbclid",
      title: "IwAR3mocktracekit",
      subtitle: seed.name,
      value: "IwAR3mocktracekit",
      href: offer("traffic-sources", {
        trafficSourceId: "meta-facebook",
        drawer: { kind: "traffic-source", recordId: "meta-facebook" },
        searchRef: `search-fbclid-${seed.id}`,
      }),
    },
    {
      id: `gclid:${seed.id}`,
      type: "gclid",
      title: "CjwKCAiMock",
      subtitle: seed.name,
      value: "CjwKCAiMock",
      href: offer("traffic-sources", {
        trafficSourceId: "google",
        drawer: { kind: "traffic-source", recordId: "google" },
        searchRef: `search-gclid-${seed.id}`,
      }),
    },
  ];
}

export class MockOfferRepository implements OfferRepository {
  async listOffers(scope: OfferScope): Promise<OfferSummary[]> {
    return clone(
      allowedSeeds(scope).map(
        ({
          id,
          organizationId,
          name,
          mark,
          profit,
          trend,
          status,
          trackingHealth,
        }) => ({
          id,
          organizationId,
          name,
          mark,
          profit,
          trend,
          status,
          trackingHealth,
        }),
      ),
    );
  }
  async resolveOffer(scope: OfferScope, offerId: string) {
    const seed =
      mockRepositoryScopeAllows(scope, "offers.view")
        ? seeds.find(
            (item) =>
              item.id === offerId &&
              item.organizationId === scope.mockOrganizationId &&
              scope.accessibleOfferIds.includes(item.id),
          )
        : null;
    return seed
      ? clone({ organizationId: seed.organizationId, offerId: seed.id })
      : null;
  }
  async loadWorkspace(scope: OfferScope, offerId: string) {
    const seed = allowedSeeds(scope).find((item) => item.id === offerId);
    return seed ? clone(workspace(seed)) : null;
  }
  async loadTrend(
    scope: OfferScope,
    offerId: string,
    range: OfferTrendRange,
    measures: OfferTrendMeasure[],
  ) {
    const snapshot = await this.loadWorkspace(scope, offerId);
    if (!snapshot || !measures.length) return [];
    return clone(snapshot.trends[range]);
  }
  async loadComparison(
    scope: OfferScope,
    offerIds: string[],
  ): Promise<OfferComparison | null> {
    const selected = Array.from(new Set(offerIds))
      .map((id) => allowedSeeds(scope).find((seed) => seed.id === id))
      .filter((seed): seed is OfferSeed => Boolean(seed))
      .slice(0, 4);
    if (selected.length < 2) return null;
    const offerSummaries = selected.map(
      ({
        id,
        organizationId,
        name,
        mark,
        profit,
        trend,
        status,
        trackingHealth,
      }) => ({
        id,
        organizationId,
        name,
        mark,
        profit,
        trend,
        status,
        trackingHealth,
      }),
    );
    const metrics = [
      ["profit", "Profit", "currency", (s: OfferSeed) => s.profit],
      ["revenue", "Revenue", "currency", (s: OfferSeed) => s.revenue],
      ["spend", "Spend", "currency", (s: OfferSeed) => s.spend],
      ["margin", "Profit Margin", "percent", (s: OfferSeed) => s.margin],
      ["roas", "ROAS", "multiple", (s: OfferSeed) => s.roas],
      ["cpa", "CPA", "currency", (s: OfferSeed) => s.cpa],
      ["orders", "Orders", "number", (s: OfferSeed) => s.orders],
      ["customers", "Customers", "number", (s: OfferSeed) => s.customers],
      ["aov", "Average Order Value", "currency", (s: OfferSeed) => s.aov],
      ["refund", "Refund Rate", "percent", (s: OfferSeed) => s.refund],
      [
        "chargeback",
        "Chargeback Rate",
        "percent",
        (s: OfferSeed) => s.chargeback,
      ],
      [
        "shipping",
        "Shipping Margin",
        "currency",
        (s: OfferSeed) => s.shippingMargin,
      ],
      ["ltv", "Customer Lifetime Value", "currency", (s: OfferSeed) => s.ltv],
      ["repeat", "Repeat Purchase Rate", "percent", (s: OfferSeed) => s.repeat],
      [
        "tracking",
        "Tracking Health",
        "number",
        (s: OfferSeed) => s.trackingHealth,
      ],
    ] as const;
    const comparisonMetrics = metrics.map(([id, label, format, getter]) => ({
      id,
      label,
      format,
      values: Object.fromEntries(
        selected.map((seed) => [seed.id, getter(seed)]),
      ),
    }));
    const sourceSets = selected.map((seed) => [seed, sources(seed)] as const);
    const trafficSources = sourceNames.map((name, index) => ({
      sourceId: sourceSets[0][1][index].id,
      sourceName: name,
      offerValues: Object.fromEntries(
        sourceSets.map(([seed, list]) => {
          const {
            spend,
            revenue,
            profit,
            roas,
            cpa,
            orders,
            refundRate,
            customerLtv,
            trackingHealth,
          } = list[index];
          return [
            seed.id,
            {
              spend,
              revenue,
              profit,
              roas,
              cpa,
              orders,
              refundRate,
              customerLtv,
              trackingHealth,
            },
          ];
        }),
      ),
    }));
    const best = [...selected].sort((a, b) => b.margin - a.margin)[0];
    const weakest = [...selected].sort((a, b) => a.margin - b.margin)[0];
    const ranked = sourceSets
      .flatMap(([seed, list]) => list.map((source) => ({ seed, source })))
      .sort((a, b) => b.source.profit - a.source.profit);
    const strongest = ranked[0];
    const weakestSource = ranked[ranked.length - 1];
    return clone({
      offers: offerSummaries,
      metrics: comparisonMetrics,
      trafficSources,
      conclusion: {
        bestOfferId: best.id,
        strongest: {
          offerId: strongest.seed.id,
          sourceId: strongest.source.id,
        },
        weakest: {
          offerId: weakestSource.seed.id,
          sourceId: weakestSource.source.id,
        },
        drivers: [
          `Profit Margin is ${(best.margin - weakest.margin).toFixed(1)} points higher`,
          `CPA is $${Math.abs(best.cpa - weakest.cpa).toFixed(2)} different`,
          `Refund Rate is ${Math.abs(best.refund - weakest.refund).toFixed(1)} points different`,
          `Shipping Margin is $${Math.abs(best.shippingMargin - weakest.shippingMargin).toFixed(2)} different per Order`,
        ],
        recommendation: `Shift 15% of ${weakest.name} ${weakestSource.source.name} spend to ${best.name} ${strongest.source.name} for the next test period.`,
        evidence: [
          "Matching-period Offer metrics",
          "Traffic Source cohorts",
          "Qualified financial inputs",
          "Customer quality cohorts",
        ],
      },
    });
  }
  async loadDrawer(
    scope: OfferScope,
    offerId: string,
    drawerId: string,
  ): Promise<OfferDrawerRecord | null> {
    const snapshot = await this.loadWorkspace(scope, offerId);
    if (!snapshot) return null;
    const [kind, id] = drawerId.split(":", 2);
    if (kind === "traffic" || kind === "traffic-source") {
      const item = snapshot.trafficSources.find((source) => source.id === id);
      if (!item) return null;
      return clone({
        id: drawerId,
        kind: "traffic-source",
        title: item.name,
        question: "How is this source contributing to Offer performance?",
        summary: `${item.name} generated $${item.profit.toLocaleString()} Profit.`,
        facts: [
          ["Spend", `$${item.spend.toLocaleString()}`],
          ["Revenue", `$${item.revenue.toLocaleString()}`],
          ["ROAS", `${item.roas}×`],
          ["CPA", `$${item.cpa}`],
          ["Tracking Health", item.trackingHealth],
        ].map(([label, value]) => ({ label, value })),
        evidence: ["Attributed Spend", "Matched Orders", "Customer cohorts"],
        relatedObjects: [
          { type: "Campaign", id: "campaign-101", label: "Campaign 101" },
          {
            type: "Evidence",
            id: "source-evidence",
            label: "Traffic source evidence",
          },
        ],
      });
    }
    if (kind === "driver" || kind === "profit-driver") {
      const item = snapshot.profitDrivers.find((driver) => driver.id === id);
      if (!item) return null;
      return clone({
        id: drawerId,
        kind: "profit-driver",
        title: item.label,
        question: "Why is this factor affecting Offer profit?",
        summary: item.impact,
        facts: [
          { label: "Amount", value: `$${item.amount.toLocaleString()}` },
          { label: "Profit impact", value: item.impact },
        ],
        evidence: item.evidence,
        relatedObjects: item.relatedObjects.map((label, index) => ({
          type: index ? "Evidence" : "Order",
          id: `${id}-${index}`,
          label,
        })),
      });
    }
    if (kind === "event" || kind === "significant-event") {
      const item = snapshot.significantEvents.find((event) => event.id === id);
      if (!item) return null;
      return clone({
        id: drawerId,
        kind: "significant-event",
        title: item.title,
        question:
          "What changed, what happened afterward, and what Evidence connects them?",
        summary: item.outcome,
        facts: [
          { label: "Date", value: item.date },
          { label: "Change", value: item.change },
          { label: "Relationship", value: item.relationship },
          { label: "Related Object", value: item.relatedObject },
        ],
        evidence: item.evidence,
        relatedObjects: [
          { type: "Evidence", id: item.id, label: item.relatedObject },
        ],
      });
    }
    if (kind === "intelligence") {
      const item = snapshot.intelligence.find(
        (observation) => observation.id === id,
      );
      if (!item) return null;
      return clone({
        id: drawerId,
        kind: "intelligence",
        title: "TraceKit Intelligence",
        question:
          "What did TraceKit notice, why does it matter, and what action is recommended?",
        summary: item.fact,
        facts: [
          { label: "Fact", value: item.fact },
          { label: "Inference", value: item.inference },
          { label: "Why it matters", value: item.whyItMatters },
          { label: "Recommendation", value: item.recommendation },
          { label: "Evidence strength", value: item.evidenceStrength },
        ],
        evidence: item.evidence,
        relatedObjects: item.relatedObjects.map((label, index) => ({
          type: "Evidence",
          id: `${id}-${index}`,
          label,
        })),
      });
    }
    return null;
  }
  async search(scope: OfferScope, query: string) {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return clone(
      allowedSeeds(scope)
        .flatMap((seed) => searchRecords(seed, scope.identity.id))
        .filter((result) =>
          `${result.type} ${result.title} ${result.subtitle} ${result.value}`
            .toLowerCase()
            .includes(normalized),
        )
        .slice(0, 8),
    );
  }
}

export const offerRepository: OfferRepository = new MockOfferRepository();

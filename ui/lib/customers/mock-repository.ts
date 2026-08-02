import {
  accessibleOrganizations,
  hasPermission,
} from "@/lib/identity/authorization";
import { customerDeepLinkHref, normalizeCustomerDeepLink } from "./deep-link";
import { withDevelopmentIdentity } from "@/lib/identity/development-state";
import type { CustomerRepository } from "./repository";
import type {
  CustomerDeepLinkState,
  CustomerDrawerRecord,
  CustomerJourneyEvent,
  CustomerListFilter,
  CustomerPrivacySignal,
  CustomerScope,
  CustomerSummary,
  CustomerTrackingState,
  CustomerWorkspaceSnapshot,
} from "./types";

type Seed = {
  summary: CustomerSummary;
  revenue: number;
  since: string;
  firstTouch: string;
  lastPurchase: string;
  journeyId: string;
};
const seeds: Seed[] = [
  {
    summary: {
      id: "cust-123",
      organizationId: "org-bullseye",
      offerIds: ["offer-bullseye"],
      name: "John Smith",
      email: "john.smith@example.com",
      phone: "+1 415 555 0182",
      sensitiveMasked: false,
      profit: 842,
      profitStatus: "Reconciled",
      lastActivity: "Purchased today",
      status: "Active",
      trackingHealth: "Healthy",
      repeat: true,
      refunded: false,
      interferenceLikely: false,
      journeyPreview: "Facebook → Landing Page → Purchase",
    },
    revenue: 1420,
    since: "Jan 12, 2025",
    firstTouch: "Facebook · Summer Scale",
    lastPurchase: "Today, 9:49 AM",
    journeyId: "jrn_01JTK8FQ7B6P3V",
  },
  {
    summary: {
      id: "cust-124",
      organizationId: "org-bullseye",
      offerIds: ["offer-bullseye"],
      name: "Mary Johnson",
      email: "mary.johnson@example.com",
      phone: "+1 312 555 0144",
      sensitiveMasked: false,
      profit: 421,
      profitStatus: "Estimated",
      lastActivity: "Refund yesterday",
      status: "Needs attention",
      trackingHealth: "Degraded",
      repeat: false,
      refunded: true,
      interferenceLikely: false,
      journeyPreview: "Affiliate → Redirect → Purchase → Refund",
    },
    revenue: 690,
    since: "Mar 04, 2026",
    firstTouch: "Affiliate 104",
    lastPurchase: "Jul 30, 2:14 PM",
    journeyId: "jrn_01MARY1088",
  },
  {
    summary: {
      id: "cust-125",
      organizationId: "org-bullseye",
      offerIds: ["offer-bullseye-retention"],
      name: "Alex Rivera",
      email: "alex.rivera@example.com",
      phone: "+1 206 555 0117",
      sensitiveMasked: false,
      profit: 188,
      profitStatus: "Estimated",
      lastActivity: "Tracking review",
      status: "Evidence incomplete",
      trackingHealth: "Interference Likely",
      repeat: false,
      refunded: false,
      interferenceLikely: true,
      journeyPreview: "Meta → Privacy restriction → Server purchase",
    },
    revenue: 329,
    since: "Jul 18, 2026",
    firstTouch: "Meta · Creative CR-882",
    lastPurchase: "Jul 28, 11:07 AM",
    journeyId: "jrn_01ALEX1177",
  },
  {
    summary: {
      id: "cust-vrx-1",
      organizationId: "org-valuerx",
      offerIds: ["offer-valuerx-individual"],
      name: "Sarah Wilson",
      email: "sarah.wilson@example.com",
      phone: "+1 646 555 0198",
      sensitiveMasked: false,
      profit: 1240,
      profitStatus: "Reconciled",
      lastActivity: "Repeat purchase 3 days ago",
      status: "High value",
      trackingHealth: "Healthy",
      repeat: true,
      refunded: false,
      interferenceLikely: false,
      journeyPreview: "Affiliate → ValueRx → Repeat purchase",
    },
    revenue: 2580,
    since: "Sep 09, 2024",
    firstTouch: "Affiliate 104",
    lastPurchase: "Jul 28, 8:16 AM",
    journeyId: "jrn_01SARAH2042",
  },
];
const clone = <T>(v: T): T => structuredClone(v);
const eventNames = [
  "Ad Click",
  "Tracking Redirect",
  "Landing Page",
  "Checkout",
  "Purchase",
  "Upsell",
  "Payment",
  "Affiliate Conversion",
  "Financial Import",
  "Profit Updated",
];
function journey(seed: Seed): CustomerJourneyEvent[] {
  const interference = seed.summary.interferenceLikely;
  return eventNames.map((name, index) => {
    const id = `${seed.summary.id}-evt-${index}`;
    const missing = interference && index >= 1 && index <= 4;
    const identifierValue =
      index < 5
        ? missing && index > 1
          ? "Missing"
          : "IwAR3mocktracekit"
        : seed.summary.id;
    return {
      id,
      name,
      timestamp: `Jul ${22 + Math.floor(index / 3)}, ${9 + index}:4${index} AM`,
      domain:
        index === 0
          ? "facebook.com"
          : index === 1
            ? "go.tracekit.test"
            : index >= 4
              ? "checkout.example"
              : "offer.example",
      role:
        index === 0
          ? "First touch"
          : index === 4
            ? "Conversion"
            : "Journey touchpoint",
      status: missing ? "Partial evidence" : "Observed",
      confidence: missing ? "Moderate" : "High",
      trackingHealth: missing
        ? "Interference Likely"
        : seed.summary.trackingHealth,
      trackingStatus: missing
        ? "Identifier missing after redirect"
        : "Identifiers preserved",
      originalUrl: `https://source.example/${id}?fbclid=IwAR3mocktracekit`,
      referrer: index
        ? `https://previous.example/${index - 1}`
        : "https://facebook.com/",
      destinationUrl: `https://destination.example/${index}`,
      queryParameters: {
        utm_source: "facebook",
        utm_campaign: "summer_scale",
        fbclid: identifierValue,
        _ef_transaction_id: index > 1 ? "ef_21a7f0ce98" : "pending",
      },
      identifiers: [
        {
          id: `fbclid-${id}`,
          type: "Facebook Click ID",
          value: identifierValue,
          status: missing ? "Missing" : "Observed",
          eventId: id,
        },
        {
          id: `journey-${id}`,
          type: "TraceKit Journey ID",
          value: seed.journeyId,
          status: "Observed",
          eventId: id,
        },
        {
          id: `customer-${id}`,
          type: "Customer ID",
          value: seed.summary.id,
          status: "Observed",
          eventId: id,
        },
        {
          id: `order-${id}`,
          type: "Order ID",
          value: seed.summary.id === "cust-123" ? "TK-10482" : "TK-10501",
          status: "Observed",
          eventId: id,
        },
        {
          id: `everflow-${id}`,
          type: "Everflow Transaction ID",
          value: "ef_21a7f0ce98",
          status: missing ? "Recovered" : "Observed",
          eventId: id,
        },
      ],
      redirects: [
        {
          url: "https://facebook.com/click",
          statusCode: 302,
          added: ["fbclid"],
          removed: [],
          transition: "facebook.com → go.tracekit.test",
          elapsedMs: 84,
        },
        {
          url: "https://go.tracekit.test/r",
          statusCode: 302,
          added: ["_ef_transaction_id"],
          removed: missing ? ["fbclid"] : [],
          transition: "go.tracekit.test → offer.example",
          elapsedMs: 112,
        },
      ],
      diagnostics: missing
        ? [
            {
              label: "Expected browser identifier not observed",
              result: "Missing",
            },
            {
              label: "Browser privacy restriction may have affected tracking",
              result: "Likely",
            },
            { label: "Server-side Order received", result: "Observed" },
          ]
        : [
            {
              label: "First-party cookie stored successfully",
              result: "Observed",
            },
            { label: "Cross-domain identifier preserved", result: "Observed" },
            { label: "Server-side conversion received", result: "Observed" },
          ],
      relationships: [
        { type: "Customer", id: seed.summary.id, label: seed.summary.name },
        { type: "Journey", id: seed.journeyId, label: seed.journeyId },
        { type: "Offer", id: seed.summary.offerIds[0], label: "Related Offer" },
        {
          type: "Order",
          id: seed.summary.id === "cust-123" ? "TK-10482" : "TK-10501",
          label: "Related Order",
        },
      ],
      explanation: {
        conclusion:
          index === 0
            ? "First Touch: Facebook"
            : `${name} linked to this Customer`,
        reason:
          index === 0
            ? "This was the earliest qualifying recorded Traffic Source associated with the Customer."
            : "Preserved Journey, Customer, and commerce identifiers connect this event.",
        evidence: [
          "Source timestamp",
          "Journey identifier",
          "Matched Customer",
          "Related Order",
        ],
      },
    };
  });
}
function privacy(seed: Seed): CustomerPrivacySignal[] {
  return seed.summary.interferenceLikely
    ? [
        {
          id: "cookie-interference",
          label: "Interference likely",
          state: "Likely",
          explanation:
            "Expected browser evidence was not observed. A content blocker or browser privacy restriction may have affected tracking.",
          evidence: [
            "First-party cookie missing after redirect",
            "Expected Meta request not observed",
            "Server-side purchase received",
          ],
        },
      ]
    : [
        {
          id: "cookie-health",
          label: "Browser storage observed",
          state: "Observed",
          explanation:
            "First-party storage and cross-domain identifiers were observed throughout the Journey.",
          evidence: [
            "Cookie write observed",
            "Identifier preserved",
            "Session matched",
          ],
        },
      ];
}
function allowed(scope: CustomerScope) {
  if (
    !scope.authenticated ||
    !scope.organizationId ||
    !hasPermission(scope.identity, "customers.view") ||
    !accessibleOrganizations(scope.identity).some(
      (o) => o.id === scope.organizationId,
    )
  )
    return [];
  return seeds.filter(
    (s) =>
      s.summary.organizationId === scope.organizationId &&
      (!scope.businessContextId ||
        s.summary.offerIds.includes(scope.businessContextId)),
  );
}
function mask(summary: CustomerSummary, scope: CustomerScope) {
  return hasPermission(scope.identity, "customers.view_sensitive_data")
    ? summary
    : {
        ...summary,
        email: "••••••@••••••.com",
        phone: "••• ••• ••••",
        sensitiveMasked: true,
      };
}
function snapshot(seed: Seed, scope: CustomerScope): CustomerWorkspaceSnapshot {
  const j = journey(seed);
  const orderNumber =
    seed.summary.id === "cust-123"
      ? "TK-10482"
      : seed.summary.id === "cust-124"
        ? "TK-10501"
        : seed.summary.id === "cust-125"
          ? "TK-10544"
          : "VR-20114";
  const orderId =
    seed.summary.id === "cust-123"
      ? "ord-123"
      : seed.summary.id === "cust-124"
        ? "ord-125"
        : seed.summary.id === "cust-125"
          ? "ord-126"
          : "ord-vrx-1";
  return {
    customer: mask(clone(seed.summary), scope),
    lifetimeRevenue: seed.revenue,
    customerSince: seed.since,
    firstTouch: seed.firstTouch,
    lastPurchase: seed.lastPurchase,
    journeyId: seed.journeyId,
    journey: j,
    orders: [
      {
        id: orderId,
        number: orderNumber,
        date: "Jul 30, 2026",
        amount: seed.revenue,
        profit: hasPermission(scope.identity, "financials.view")
          ? seed.summary.profit
          : null,
        profitStatus: seed.summary.profitStatus,
        status: seed.summary.refunded ? "Refunded" : "Paid",
        refunded: seed.summary.refunded,
        offerId: seed.summary.offerIds[0],
        offerName: "Bullseye",
        trackingHealth: seed.summary.trackingHealth,
      },
    ],
    offers: seed.summary.offerIds.map((id) => ({
      id,
      name: id.includes("retention")
        ? "Bullseye Retention"
        : id.includes("valuerx")
          ? "ValueRx Individual"
          : "Bullseye",
      firstTouch: seed.firstTouch,
    })),
    privacySignals: privacy(seed),
    trackingExplanation: seed.summary.interferenceLikely
      ? "Tracking interference is likely based on missing browser evidence; the specific cause is unknown."
      : seed.summary.trackingHealth === "Degraded"
        ? "Some identifiers were recovered from supporting evidence."
        : "Expected tracking evidence was observed and linked.",
  };
}
export class MockCustomerRepository implements CustomerRepository {
  async listCustomers(scope: CustomerScope, filter: CustomerListFilter = {}) {
    let values = allowed(scope).map((s) => mask(clone(s.summary), scope));
    const q = filter.query?.toLowerCase();
    if (q)
      values = values.filter((c) =>
        `${c.name} ${c.email} ${c.phone} ${c.id} ${c.journeyPreview}`
          .toLowerCase()
          .includes(q),
      );
    if (filter.state === "repeat") values = values.filter((c) => c.repeat);
    if (filter.state === "refunded") values = values.filter((c) => c.refunded);
    if (filter.state === "interference")
      values = values.filter((c) => c.interferenceLikely);
    if (filter.offerId)
      values = values.filter((c) => c.offerIds.includes(filter.offerId!));
    return clone(values);
  }
  async resolveCustomer(scope: CustomerScope, id: string) {
    if (
      !scope.authenticated ||
      !hasPermission(scope.identity, "customers.view")
    )
      return null;
    const orgs = new Set(
      accessibleOrganizations(scope.identity).map((o) => o.id),
    );
    const s = seeds.find(
      (x) => x.summary.id === id && orgs.has(x.summary.organizationId),
    );
    return s
      ? clone({
          organizationId: s.summary.organizationId,
          businessContextId: s.summary.offerIds[0] || null,
          customerId: id,
        })
      : null;
  }
  async loadWorkspace(scope: CustomerScope, id: string) {
    const s = allowed(scope).find((x) => x.summary.id === id);
    return s ? clone(snapshot(s, scope)) : null;
  }
  async loadJourney(scope: CustomerScope, id: string) {
    return clone((await this.loadWorkspace(scope, id))?.journey || []);
  }
  async loadDrawer(
    scope: CustomerScope,
    id: string,
    drawerId: string,
  ): Promise<CustomerDrawerRecord | null> {
    const s = await this.loadWorkspace(scope, id);
    if (!s) return null;
    const [kind, key] = drawerId.split(":", 2);
    if (kind === "event" || kind === "journey-event") {
      const e = s.journey.find((x) => x.id === key);
      if (!e) return null;
      return clone({
        id: drawerId,
        kind: "event",
        title: e.name,
        question: "What happened, and what evidence proves it?",
        summary: e.explanation.conclusion,
        facts: [
          { label: "Timestamp", value: e.timestamp },
          { label: "Status", value: e.status },
          { label: "Confidence", value: e.confidence },
          { label: "Attribution role", value: e.role },
        ],
        originalUrl: e.originalUrl,
        referrer: e.referrer,
        destinationUrl: e.destinationUrl,
        queryParameters: e.queryParameters,
        identifiers: e.identifiers,
        redirects: e.redirects,
        diagnostics: e.diagnostics,
        evidence: e.explanation.evidence,
        relationships: e.relationships,
      });
    }
    if (kind === "identifier") {
      const e = s.journey.find((x) => x.identifiers.some((i) => i.id === key));
      const i = e?.identifiers.find((x) => x.id === key);
      if (!e || !i) return null;
      return clone({
        id: drawerId,
        kind: "identifier",
        title: i.type,
        question: "What Customer Story does this Identifier belong to?",
        summary: i.value,
        facts: [
          { label: "Status", value: i.status },
          { label: "Journey event", value: e.name },
        ],
        identifiers: [i],
        evidence: e.explanation.evidence,
        relationships: e.relationships,
      });
    }
    if (kind === "privacy" || kind === "privacy-signal") {
      const p = s.privacySignals.find((x) => x.id === key);
      if (!p) return null;
      return clone({
        id: drawerId,
        kind: "privacy",
        title: p.label,
        question: "What tracking evidence supports this conclusion?",
        summary: p.explanation,
        facts: [{ label: "Conclusion strength", value: p.state }],
        evidence: p.evidence,
        relationships: [
          { type: "Customer", id: s.customer.id, label: s.customer.name },
          { type: "Journey", id: s.journeyId, label: s.journeyId },
        ],
      });
    }
    if (kind === "order" || kind === "related-order") {
      const o = s.orders.find((x) => x.id === key);
      if (!o) return null;
      return clone({
        id: drawerId,
        kind: "order",
        title: `Order ${o.id}`,
        question: "What happened in this Order?",
        summary: `${o.status} · ${o.profitStatus}`,
        facts: [
          { label: "Revenue", value: `$${o.amount.toLocaleString()}` },
          {
            label: "Profit",
            value:
              o.profit === null
                ? "Restricted"
                : `$${o.profit.toLocaleString()}`,
          },
          { label: "Tracking Health", value: o.trackingHealth },
        ],
        evidence: ["Order record", "Payment record", "Journey relationship"],
        relationships: [{ type: "Offer", id: o.offerId, label: o.offerName }],
      });
    }
    if (drawerId === "tracking")
      return clone({
        id: "tracking",
        kind: "tracking",
        title: "Tracking Health",
        question: "Why did TraceKit assign this Tracking Health?",
        summary: s.trackingExplanation,
        facts: [{ label: "State", value: s.customer.trackingHealth }],
        diagnostics: s.journey.flatMap((e) => e.diagnostics).slice(0, 6),
        evidence: s.privacySignals.flatMap((p) => p.evidence),
        relationships: [
          { type: "Journey", id: s.journeyId, label: s.journeyId },
        ],
      });
    return null;
  }
  async search(scope: CustomerScope, query: string) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const records = allowed(scope).flatMap((s) => {
      const identifiers = journey(s).flatMap((e) => e.identifiers);
      return [
        {
          id: `customer:${s.summary.id}`,
          type: "Customer",
          title: s.summary.name,
          subtitle: s.summary.id,
          value: `${s.summary.email} ${s.summary.phone}`,
          href: withDevelopmentIdentity(customerDeepLinkHref({ customerId: s.summary.id }), scope.identity.id),
        },
        ...identifiers.map((i) => ({
          id: `identifier:${i.id}`,
          type: i.type,
          title: i.value,
          subtitle: s.summary.name,
          value: i.value,
          href: withDevelopmentIdentity(customerDeepLinkHref(
            {
              customerId: s.summary.id,
              focus: "journey",
              eventId: i.eventId,
              identifierRef: i.id,
              drawer: { kind: "identifier", recordId: i.id },
              searchRef: `search-${i.id}`,
            },
          ), scope.identity.id),
        })),
        ...snapshot(s, scope).orders.map((o) => ({
          id: `order:${o.id}`,
          type: "Order ID",
          title: o.id,
          subtitle: s.summary.name,
          value: o.id,
          href: withDevelopmentIdentity(customerDeepLinkHref(
            {
              customerId: s.summary.id,
              focus: "orders",
              orderId: o.id,
              drawer: { kind: "related-order", recordId: o.id },
              searchRef: `search-${o.id}`,
            },
          ), scope.identity.id),
        })),
      ];
    });
    return clone(
      records
        .filter((r) =>
          `${r.type} ${r.title} ${r.subtitle} ${r.value}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 12),
    );
  }
  async resolveDeepLink(scope: CustomerScope, state: CustomerDeepLinkState) {
    const list = await this.listCustomers(scope, { offerId: state.offerId });
    const snap = state.customerId
      ? await this.loadWorkspace(scope, state.customerId)
      : null;
    return normalizeCustomerDeepLink(state, list, snap);
  }
}
export const customerRepository: CustomerRepository =
  new MockCustomerRepository();

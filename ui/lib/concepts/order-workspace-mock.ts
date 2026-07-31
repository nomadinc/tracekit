export type OrderTrackingHealth = "Excellent" | "Degraded" | "Poor";
export type ProfitStatus = "Estimated" | "Reconciled";

export type Diagnostic = {
  label: string;
  state: "observed" | "warning" | "missing";
};

export type RedirectHop = {
  url: string;
  status: number;
  transition: string;
  added: string[];
  removed: string[];
  elapsedMs: number;
};

export type EvidenceItem = {
  id: string;
  title: string;
  kind: "Financial" | "Attribution" | "Timeline" | "Shipping" | "Intelligence";
  timestamp: string;
  status: string;
  confidence: "High" | "Medium" | "Low";
  summary: string;
  amount?: number;
  rawUrl?: string;
  referrer?: string;
  destination?: string;
  queryParameters: Record<string, string>;
  identifiers: Record<string, string>;
  redirectPath: RedirectHop[];
  diagnostics: Diagnostic[];
  relationships: Array<{ type: string; label: string }>;
  evidence: string[];
  explain: {
    conclusion: string;
    reason: string;
    limitations?: string;
  };
};

export type BreakdownItem = {
  id: string;
  label: string;
  amount: number;
  role: "revenue" | "deduction" | "credit" | "result";
  evidenceId: string;
};

export type ProcessorFee = {
  processorName: string;
  percentageRate: number;
  fixedFee: number;
  currency: string;
  captures: Array<{ id: string; amount: number }>;
  expectedFee: number;
  observedFee: number;
  settlementStatus: string;
};

export type TimelineEvent = {
  id: string;
  label: string;
  timestamp: string;
  state: "complete" | "attention" | "negative";
  evidenceId: string;
};

export type IntelligenceCard = {
  id: string;
  title: string;
  observation: string;
  recommendation: string;
  evidenceId: string;
};

export type MockOrder = {
  id: string;
  number: string;
  scenario: string;
  date: string;
  customer: { name: string; email: string; phone: string };
  status: "Paid" | "Refunded" | "Chargeback";
  profitStatus: ProfitStatus;
  profit: number;
  revenue: number;
  trackingHealth: OrderTrackingHealth;
  offerUrl: string;
  clickPurchaseDelta: string;
  affiliate: string;
  trafficSource: string;
  campaign: string;
  creative: string;
  landingPage: string;
  commercial: {
    mainProduct: string;
    orderBumps: string[];
    upsells: string[];
    shippingCharged: number;
    taxCollected: number;
    discounts: number;
    quantity: number;
  };
  shipping: {
    charged: number;
    actual: number;
    packaging: number;
    margin: number;
  };
  processorFee: ProcessorFee;
  waitingOn: string[];
  breakdown: BreakdownItem[];
  timeline: TimelineEvent[];
  intelligence: IntelligenceCard[];
  evidence: Record<string, EvidenceItem>;
};

const baseRedirectPath: RedirectHop[] = [
  {
    url: "https://facebook.com/ads/click?fbclid=IwAR4order9x2",
    status: 302,
    transition: "facebook.com → go.acme.co",
    added: ["utm_source", "utm_campaign"],
    removed: [],
    elapsedMs: 76,
  },
  {
    url: "https://go.acme.co/r/ef_ord_10482?affid=104&sub1=creative_b",
    status: 302,
    transition: "go.acme.co → try.acme.com",
    added: ["affid", "sub1", "_ef_transaction_id"],
    removed: [],
    elapsedMs: 109,
  },
  {
    url: "https://try.acme.com/restore?utm_source=facebook&utm_campaign=scale_q3",
    status: 200,
    transition: "try.acme.com → checkout.acme.com",
    added: ["session_id"],
    removed: ["fbclid"],
    elapsedMs: 241,
  },
];

const baseParams = {
  utm_source: "facebook",
  utm_campaign: "scale_q3",
  affid: "104",
  sub1: "creative_b",
  sub2: "prospecting_40plus",
  _ef_transaction_id: "ef_ord_10482",
  fbclid: "IwAR4order9x2",
  gclid: "—",
};

const baseIds = {
  "Order ID": "TK-10482",
  "TraceKit Journey ID": "jrn_order_01J8PF",
  "Session ID": "ses_order_7f21",
  "Customer ID": "cus_tk_1042",
  "Everflow Transaction ID": "ef_ord_10482",
  "Facebook Click ID": "IwAR4order9x2",
  "Google Click ID": "—",
  "Stripe Charge ID": "ch_3QOrder10482",
};

const goodDiagnostics: Diagnostic[] = [
  { label: "First-party identifier stored", state: "observed" },
  { label: "Cross-domain identifier preserved", state: "observed" },
  { label: "Everflow conversion received", state: "observed" },
  { label: "Payment matched to Order", state: "observed" },
];

const poorDiagnostics: Diagnostic[] = [
  { label: "First-party identifier observed before redirect", state: "observed" },
  { label: "Cross-domain identifier missing at Landing Page", state: "missing" },
  { label: "Expected browser request not observed", state: "missing" },
  { label: "Tracking interference likely", state: "warning" },
  { label: "Server-side Order still matched", state: "observed" },
];

function relationships(orderNumber: string, customer: string) {
  return [
    { type: "Order", label: orderNumber },
    { type: "Customer", label: customer },
    { type: "Journey", label: "jrn_order_01J8PF" },
    { type: "Affiliate", label: "Affiliate 104" },
    { type: "Campaign", label: "Scale Q3 · Prospecting" },
    { type: "Payment", label: "ch_3QOrder10482" },
    { type: "Profit", label: `Profit calculation · ${orderNumber}` },
  ];
}

function evidenceItem(
  id: string,
  title: string,
  kind: EvidenceItem["kind"],
  summary: string,
  conclusion: string,
  overrides: Partial<EvidenceItem> = {},
): EvidenceItem {
  return {
    id,
    title,
    kind,
    timestamp: "Jul 31, 2026 · 10:14:32 AM",
    status: "Observed",
    confidence: "High",
    summary,
    rawUrl: "https://try.acme.com/restore?utm_source=facebook&utm_campaign=scale_q3&affid=104",
    referrer: "https://go.acme.co/r/ef_ord_10482",
    destination: "https://checkout.acme.com/order/TK-10482",
    queryParameters: { ...baseParams },
    identifiers: { ...baseIds },
    redirectPath: baseRedirectPath,
    diagnostics: goodDiagnostics,
    relationships: relationships("TK-10482", "John Smith"),
    evidence: [
      "Source timestamp preserved",
      "Order and payment identifiers matched",
      "Source value retained without modification",
      "Related Financial Event observed",
    ],
    explain: {
      conclusion,
      reason: "TraceKit connected the observed source values to this Order through matching Order, Journey, session, and payment identifiers.",
    },
    ...overrides,
  };
}

function buildEvidence(orderNumber: string, customer: string, poorTracking = false): Record<string, EvidenceItem> {
  const relationSet = relationships(orderNumber, customer);
  const ids = { ...baseIds, "Order ID": orderNumber };
  const common = { identifiers: ids, relationships: relationSet };
  return {
    revenue: evidenceItem("revenue", "Revenue", "Financial", "Gross customer payment before deductions.", "Revenue is based on the observed Order amount and matched payment.", { ...common, amount: 224.9 }),
    media: evidenceItem("media", "Media Cost", "Financial", "Allocated advertising cost associated with the attributed click.", "Media Cost was assigned from the Campaign and click Evidence matched to this Order.", { ...common, amount: -38.42 }),
    affiliate: evidenceItem("affiliate", "Affiliate Commission", "Financial", "Commission associated with Affiliate 104 and this conversion.", "Affiliate Commission follows the observed conversion and approved commission Evidence.", { ...common, amount: -26.99 }),
    processor: evidenceItem("processor", "Processor Fees", "Financial", "Observed PayPal processing fee compared with the configured pricing rule.", "Processor Fees come from the imported processor events matched to this Order.", { ...common, amount: -7.14 }),
    cogs: evidenceItem("cogs", "COGS", "Financial", "Product cost applied to the purchased items and quantities.", "COGS reflects the configured Product costs for the observed Order items.", { ...common, amount: -51.8 }),
    shipping: evidenceItem("shipping", "Shipping", "Shipping", "Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin.", "This Order lost $4.62 on shipping after the observed carrier and Packaging costs.", {
      ...common,
      amount: -4.62,
      evidence: ["Shipping Charged: $4.95", "Actual Shipping Cost: $8.95", "Packaging Cost: $0.62", "Net Shipping Margin: -$4.62"],
    }),
    taxes: evidenceItem("taxes", "Taxes", "Financial", "Tax collected and its treatment in the Order Profit Story.", "Taxes reflect the observed Order tax amount.", { ...common, amount: -13.49 }),
    profit: evidenceItem("profit", "Net Profit", "Financial", "Revenue less every currently available cost and Financial Event.", "Profit is Estimated because the monthly processor statement remains pending.", {
      ...common,
      amount: 82.44,
      status: "Estimated",
      explain: {
        conclusion: "Estimated Profit is $82.44.",
        reason: "All currently available sales, fees, commissions, Product costs, shipping costs, Packaging, and taxes are included.",
        limitations: "Waiting on the monthly processor statement, so this amount may change slightly.",
      },
    }),
    attribution: evidenceItem("attribution", "Attribution", "Attribution", "Facebook · Affiliate 104 · Scale Q3 · Creative B", "Facebook was the earliest qualifying Traffic Source and Affiliate 104 was matched to the conversion.", { ...common }),
    click: evidenceItem("click", "Click", "Timeline", "The earliest qualifying Facebook click for this Order Story.", "This click is the first qualifying Touchpoint associated with the Customer and Order.", { ...common }),
    landing: evidenceItem("landing", "Landing", "Timeline", "The Customer reached the approved Offer landing page.", "The Landing Page retained the Journey and session Evidence.", { ...common }),
    checkout: evidenceItem("checkout", "Checkout", "Timeline", "Checkout began six minutes after the first click.", "The Checkout Touchpoint remained linked by session and Journey identifiers.", { ...common }),
    purchase: evidenceItem("purchase", "Purchase", "Timeline", "Order TK-10482 was created.", "Purchase was linked to the preserved Journey, Customer, and checkout session.", { ...common }),
    payment: evidenceItem("payment", "Payment", "Timeline", "Stripe charge ch_3QOrder10482 was received and matched.", "The payment matched the Order through the Order ID and customer Evidence.", { ...common }),
    conversion: evidenceItem("conversion", "Affiliate Conversion", "Timeline", "Everflow conversion ef_ord_10482 was received.", "The conversion matched Affiliate 104 through the preserved transaction ID.", { ...common }),
    financial: evidenceItem("financial", "Financial Import", "Timeline", "Processor fee and Financial Events were observed.", "The Financial Import expanded the Order's currently available cost Evidence.", { ...common }),
    timelineProfit: evidenceItem("timelineProfit", "Profit Updated", "Timeline", "Estimated Profit was recalculated when Financial Evidence arrived.", "Profit changed because a new observed processor fee was included.", { ...common }),
    refund: evidenceItem("refund", "Refund", "Timeline", "A full refund changed the Order's financial outcome.", "The refund is supported by the matched payment and refund Financial Events.", { ...common, status: "Observed · Negative", amount: -224.9 }),
    intelligenceShipping: evidenceItem("intelligenceShipping", "Shipping loss observation", "Intelligence", "Shipping losses increased 18% across the observed 30-day comparison.", "This Order contributes to an observed shipping-loss pattern.", {
      ...common,
      evidence: ["Current 30-day observed shipping margin: -$1,842", "Prior 30-day observed shipping margin: -$1,561", "Observed change: 18%"],
    }),
    intelligenceProcessor: evidenceItem("intelligenceProcessor", "Processor fee observation", "Intelligence", "This Order's processor fee rate exceeds the observed average.", "Review the matched processor fee Evidence before changing any configuration.", {
      ...common,
      evidence: ["Order processor rate: 3.18%", "Observed 30-day average: 2.87%", "Difference: 0.31 percentage points"],
    }),
    intelligenceAffiliate: evidenceItem("intelligenceAffiliate", "Affiliate profit observation", "Intelligence", "Affiliate 104 generates above-average Profit in the observed comparison.", "Protect the relationship while monitoring commission and refund quality.", {
      ...common,
      evidence: ["Affiliate 104 observed average Profit: $71.20", "All-affiliate observed average: $54.80", "Comparison based on matched Orders"],
    }),
    intelligenceOffer: evidenceItem("intelligenceOffer", "Offer conversion observation", "Intelligence", "Offer URL conversion rate declined in the observed comparison.", "Inspect Traffic Source and Landing Page Evidence before changing the Offer.", {
      ...common,
      evidence: ["Current observed conversion rate: 3.8%", "Prior observed conversion rate: 4.4%", "Same Offer URL and comparison window"],
    }),
    tracking: evidenceItem("tracking", "Tracking Health", "Attribution", poorTracking ? "Tracking interference likely." : "Required tracking Evidence is complete and linked.", poorTracking ? "Tracking Health is Poor because cross-domain Evidence was lost." : "Tracking Health is Excellent because expected Evidence was observed.", {
      ...common,
      confidence: poorTracking ? "Low" : "High",
      status: poorTracking ? "Poor · Attention" : "Excellent · Verified",
      diagnostics: poorTracking ? poorDiagnostics : goodDiagnostics,
      explain: poorTracking
        ? {
            conclusion: "Tracking interference likely.",
            reason: "A cross-domain Identifier and expected browser request were not observed, while server-side Order Evidence remained available.",
            limitations: "TraceKit cannot identify a specific browser extension or blocker from the observed Evidence.",
          }
        : {
            conclusion: "Tracking Health is Excellent.",
            reason: "Expected Journey, cross-domain, conversion, and payment Evidence was observed and matched.",
          },
    }),
  };
}

const baseBreakdown: BreakdownItem[] = [
  { id: "b-revenue", label: "Revenue", amount: 224.9, role: "revenue", evidenceId: "revenue" },
  { id: "b-media", label: "Media Cost", amount: -38.42, role: "deduction", evidenceId: "media" },
  { id: "b-affiliate", label: "Affiliate Commission", amount: -26.99, role: "deduction", evidenceId: "affiliate" },
  { id: "b-processor", label: "Processor Fees", amount: -7.14, role: "deduction", evidenceId: "processor" },
  { id: "b-cogs", label: "COGS", amount: -51.8, role: "deduction", evidenceId: "cogs" },
  { id: "b-shipping-charged", label: "Shipping Charged", amount: 4.95, role: "credit", evidenceId: "shipping" },
  { id: "b-shipping", label: "Actual Shipping", amount: -8.95, role: "deduction", evidenceId: "shipping" },
  { id: "b-packaging", label: "Packaging", amount: -0.62, role: "deduction", evidenceId: "shipping" },
  { id: "b-taxes", label: "Taxes", amount: -13.49, role: "deduction", evidenceId: "taxes" },
  { id: "b-profit", label: "Net Profit", amount: 82.44, role: "result", evidenceId: "profit" },
];

const baseTimeline: TimelineEvent[] = [
  { id: "t-click", label: "Click", timestamp: "10:02:14", state: "complete", evidenceId: "click" },
  { id: "t-landing", label: "Landing", timestamp: "10:02:15", state: "complete", evidenceId: "landing" },
  { id: "t-checkout", label: "Checkout", timestamp: "10:08:41", state: "complete", evidenceId: "checkout" },
  { id: "t-purchase", label: "Purchase", timestamp: "10:14:29", state: "complete", evidenceId: "purchase" },
  { id: "t-payment", label: "Payment", timestamp: "10:14:32", state: "complete", evidenceId: "payment" },
  { id: "t-conversion", label: "Affiliate Conversion", timestamp: "10:14:34", state: "complete", evidenceId: "conversion" },
  { id: "t-financial", label: "Financial Import", timestamp: "10:18:07", state: "complete", evidenceId: "financial" },
  { id: "t-profit", label: "Profit", timestamp: "10:18:09", state: "complete", evidenceId: "timelineProfit" },
];

const intelligenceCards: IntelligenceCard[] = [
  { id: "intel-shipping", title: "Shipping pressure", observation: "Shipping losses increased 18% over the last 30 days.", recommendation: "Review carrier and Packaging Evidence before changing shipping prices.", evidenceId: "intelligenceShipping" },
  { id: "intel-processor", title: "Fee variance", observation: "Processor fees exceed the observed average.", recommendation: "Verify the matched fee and compare the processor statement when available.", evidenceId: "intelligenceProcessor" },
  { id: "intel-affiliate", title: "Affiliate quality", observation: "Affiliate 104 generates above-average Profit.", recommendation: "Protect the relationship while monitoring refunds and commission quality.", evidenceId: "intelligenceAffiliate" },
  { id: "intel-offer", title: "Offer performance", observation: "Offer URL conversion rate declined.", recommendation: "Inspect Traffic Source and Landing Page Evidence before changing the Offer.", evidenceId: "intelligenceOffer" },
];

function scenario(
  id: string,
  number: string,
  scenarioLabel: string,
  overrides: Partial<MockOrder> = {},
): MockOrder {
  const customer = overrides.customer || { name: "John Smith", email: "john.smith@example.com", phone: "+1 (512) 555-0182" };
  const evidence = buildEvidence(number, customer.name, overrides.trackingHealth === "Poor");
  const shipping = overrides.shipping || { charged: 4.95, actual: 8.95, packaging: 0.62, margin: -4.62 };
  const processorFee = overrides.processorFee || {
    processorName: "PayPal",
    percentageRate: 2.9,
    fixedFee: 0.29,
    currency: "USD",
    captures: [
      { id: "PAY-10482-C1", amount: 150 },
      { id: "PAY-10482-C2", amount: 74.9 },
    ],
    expectedFee: 7.1,
    observedFee: 7.14,
    settlementStatus: "Imported · settlement pending",
  };
  const profit = overrides.profit ?? 82.44;
  const breakdown = overrides.breakdown || baseBreakdown.map((item) => {
    if (item.label === "Shipping Charged") return { ...item, amount: shipping.charged };
    if (item.label === "Actual Shipping") return { ...item, amount: -shipping.actual };
    if (item.label === "Packaging") return { ...item, amount: -shipping.packaging };
    if (item.role === "result") return { ...item, amount: profit };
    return item;
  });
  evidence.profit.amount = profit;
  evidence.profit.status = overrides.profitStatus || "Estimated";
  evidence.profit.explain.conclusion = `${overrides.profitStatus || "Estimated"} Profit is ${profit < 0 ? "−" : ""}$${Math.abs(profit).toFixed(2)}.`;
  if (overrides.status === "Refunded" || overrides.status === "Chargeback") {
    evidence.profit.explain.reason = `The observed ${overrides.status.toLowerCase()} Financial Event changed the Order's Profit after the original sale.`;
    evidence.profit.evidence = [...evidence.profit.evidence, `${overrides.status} Financial Event matched to ${number}`];
  }
  evidence.shipping.amount = shipping.margin;
  evidence.shipping.evidence = [
    `Shipping Charged: $${shipping.charged.toFixed(2)}`,
    `Actual Shipping Cost: $${shipping.actual.toFixed(2)}`,
    `Packaging Cost: $${shipping.packaging.toFixed(2)}`,
    `Net Shipping Margin: ${shipping.margin < 0 ? "−" : ""}$${Math.abs(shipping.margin).toFixed(2)}`,
  ];
  evidence.processor.amount = -processorFee.observedFee;
  evidence.processor.evidence = [
    `${processorFee.processorName} pricing rule: ${processorFee.percentageRate.toFixed(2)}% + $${processorFee.fixedFee.toFixed(2)} per transaction`,
    ...processorFee.captures.map((capture) => `${capture.id}: $${capture.amount.toFixed(2)} captured`),
    `Expected fee: $${processorFee.expectedFee.toFixed(2)}`,
    `Observed imported fee: $${processorFee.observedFee.toFixed(2)}`,
  ];
  for (const item of breakdown) {
    if (item.evidenceId !== "shipping" && evidence[item.evidenceId]) evidence[item.evidenceId].amount = item.amount;
  }
  return {
    id,
    number,
    scenario: scenarioLabel,
    date: "Jul 31, 2026 · 10:14 AM",
    status: "Paid",
    profitStatus: "Estimated",
    profit,
    revenue: 224.9,
    trackingHealth: "Excellent",
    offerUrl: "try.acme.com/restore",
    clickPurchaseDelta: "12m 15s",
    affiliate: "Affiliate 104",
    trafficSource: "Facebook",
    campaign: "Scale Q3 · Prospecting",
    creative: "Creative B · Video",
    landingPage: "Restore Offer · V3",
    commercial: {
      mainProduct: "Restore Complete System",
      orderBumps: ["Priority Processing"],
      upsells: ["90-Day Supply"],
      shippingCharged: 4.95,
      taxCollected: 13.49,
      discounts: 15,
      quantity: 3,
    },
    shipping,
    processorFee,
    waitingOn: ["Monthly processor statement"],
    breakdown,
    timeline: baseTimeline,
    intelligence: intelligenceCards,
    ...overrides,
    customer,
    evidence,
  };
}

export const mockOrders: MockOrder[] = [
  scenario("ord-10482", "TK-10482", "Healthy profitable", { profitStatus: "Reconciled", waitingOn: [] }),
  scenario("ord-10508", "TK-10508", "Low margin", {
    customer: { name: "Nina Patel", email: "nina.patel@example.com", phone: "+1 (206) 555-0174" },
    profit: 9.24,
    revenue: 149.9,
    breakdown: baseBreakdown.map((item) => item.role === "result" ? { ...item, amount: 9.24 } : item),
  }),
  scenario("ord-10519", "TK-10519", "Shipping loss", {
    customer: { name: "Marcus Green", email: "marcus.green@example.com", phone: "+1 (404) 555-0119" },
    profit: 34.81,
    shipping: { charged: 4.95, actual: 18.4, packaging: 1.08, margin: -14.53 },
  }),
  scenario("ord-10527", "TK-10527", "High affiliate commission", {
    customer: { name: "Elena Rossi", email: "elena.rossi@example.com", phone: "+1 (917) 555-0162" },
    affiliate: "Affiliate 771",
    profit: 41.55,
    breakdown: baseBreakdown.map((item) => item.label === "Affiliate Commission" ? { ...item, amount: -62.5 } : item.role === "result" ? { ...item, amount: 41.55 } : item),
  }),
  scenario("ord-10531", "TK-10531", "Refunded", {
    customer: { name: "Mary Johnson", email: "mary.johnson@example.com", phone: "+1 (602) 555-0137" },
    status: "Refunded",
    profit: -18.74,
    timeline: [...baseTimeline, { id: "t-refund", label: "Refund", timestamp: "Next day · 3:02 PM", state: "negative", evidenceId: "refund" }],
  }),
  scenario("ord-10538", "TK-10538", "Chargeback", {
    customer: { name: "Robert Chen", email: "robert.chen@example.com", phone: "+1 (312) 555-0148" },
    status: "Chargeback",
    profit: -242.6,
    timeline: [...baseTimeline, { id: "t-chargeback", label: "Chargeback", timestamp: "12 days later", state: "negative", evidenceId: "refund" }],
  }),
  scenario("ord-10544", "TK-10544", "Tracking issue", {
    customer: { name: "Alex Ramirez", email: "alex.ramirez@example.com", phone: "+1 (415) 555-0144" },
    trackingHealth: "Poor",
    trafficSource: "Facebook · Low confidence",
    affiliate: "Unconfirmed",
  }),
];

export type OrderSearchMatch = {
  id: string;
  type: string;
  value: string;
  orderId: string;
  evidenceId: string;
  title: string;
  subtitle: string;
};

export const orderSearchMatches: OrderSearchMatch[] = [
  { id: "s-order", type: "Order ID", value: "TK-10482", orderId: "ord-10482", evidenceId: "purchase", title: "Order TK-10482", subtitle: "John Smith · Reconciled" },
  { id: "s-ef", type: "Everflow Transaction ID", value: "ef_ord_10482", orderId: "ord-10482", evidenceId: "conversion", title: "Affiliate Conversion", subtitle: "Order TK-10482 · Affiliate 104" },
  { id: "s-fb", type: "Facebook Click ID", value: "IwAR4order9x2", orderId: "ord-10482", evidenceId: "click", title: "Facebook click", subtitle: "Order TK-10482 · First touch" },
  { id: "s-gclid", type: "Google Click ID", value: "Cj0Order77", orderId: "ord-10508", evidenceId: "click", title: "Google click", subtitle: "Order TK-10508 · Paid Search" },
  { id: "s-stripe", type: "Stripe charge ID", value: "ch_3QOrder10482", orderId: "ord-10482", evidenceId: "payment", title: "Stripe payment", subtitle: "Order TK-10482 · $224.90" },
  { id: "s-email", type: "Email", value: "mary.johnson@example.com", orderId: "ord-10531", evidenceId: "purchase", title: "Mary Johnson", subtitle: "Order TK-10531 · Refunded" },
  { id: "s-phone", type: "Phone", value: "+1 (415) 555-0144", orderId: "ord-10544", evidenceId: "tracking", title: "Alex Ramirez", subtitle: "Order TK-10544 · Tracking issue" },
  { id: "s-journey", type: "TraceKit Journey ID", value: "jrn_order_01J8PF", orderId: "ord-10482", evidenceId: "landing", title: "Order journey", subtitle: "Order TK-10482 · 8 observed events" },
];

export function detectOrderIdentifier(query: string) {
  const value = query.trim();
  if (!value) return "Paste any identifier";
  if (value.includes("@")) return "Email";
  if (/^\+?[\d\s().-]{10,}$/.test(value)) return "Phone";
  if (/^TK-\d+$/i.test(value)) return "Order ID";
  if (/^ef_/i.test(value)) return "Everflow Transaction ID";
  if (/^IwAR/i.test(value)) return "Facebook Click ID";
  if (/^Cj0/i.test(value)) return "Google Click ID";
  if (/^ch_/i.test(value)) return "Stripe charge ID";
  if (/^jrn_/i.test(value)) return "TraceKit Journey ID";
  return "Possible identifier";
}

export function searchOrderMockData(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return orderSearchMatches.slice(0, 5);
  return orderSearchMatches.filter((item) =>
    [item.value, item.type, item.title, item.subtitle].some((value) => value.toLowerCase().includes(normalized)),
  );
}

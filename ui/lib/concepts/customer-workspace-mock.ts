export type TrackingHealth = "Excellent" | "Degraded" | "Poor";

export type RedirectHop = {
  url: string;
  statusCode: number;
  parametersAdded: string[];
  parametersRemoved: string[];
  transition: string;
  elapsedMs: number;
};

export type JourneyEvent = {
  id: string;
  name: string;
  shortName: string;
  timestamp: string;
  domain: string;
  originalUrl: string;
  referrer: string;
  destinationUrl: string;
  attributionRole: string;
  status: string;
  confidence: string;
  trackingHealth: TrackingHealth;
  trackingStatus: string;
  identifiers: Record<string, string>;
  queryParameters: Record<string, string>;
  redirectPath: RedirectHop[];
  diagnostics: Array<{ label: string; state: "positive" | "warning" | "negative" }>;
  relationships: Array<{ type: string; label: string }>;
  explanation: {
    title: string;
    reason: string;
    evidence: string[];
  };
};

export type CustomerOrder = {
  id: string;
  number: string;
  date: string;
  revenue: number;
  operationalProfit: number;
  status: "Paid" | "Refunded" | "Partially refunded";
  attributionSource: string;
  paymentId: string;
  summary: string;
};

export type MockCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  statusTone: "success" | "warning" | "neutral";
  operationalProfit: number;
  lifetimeRevenue: number;
  customerSince: string;
  firstTouch: string;
  lastPurchase: string;
  lastActivity: string;
  eventLabel: string;
  journeyPreview: string;
  trackingHealth: TrackingHealth;
  tags: string[];
  journey: JourneyEvent[];
  orders: CustomerOrder[];
};

const baseIdentifiers = {
  "TraceKit Journey ID": "jrn_01JTK8FQ7B6P3V",
  "Session ID": "ses_7d3c91a844",
  "Customer ID": "cus_tk_1042",
  "Everflow Transaction ID": "ef_21a7f0ce98",
  "Facebook Click ID": "IwAR2zE9f8jQ4N",
  "Google Click ID": "—",
  "Order ID": "TK-10482",
  "Payment ID": "ch_3QeY71Lkd",
};

const redirectPath: RedirectHop[] = [
  {
    url: "https://facebook.com/ads/click?fbclid=IwAR2zE9f8jQ4N",
    statusCode: 302,
    parametersAdded: ["utm_source", "utm_campaign"],
    parametersRemoved: [],
    transition: "facebook.com → go.acme.co",
    elapsedMs: 84,
  },
  {
    url: "https://go.acme.co/r/ef_21a7f0ce98?affid=2041&sub1=summer",
    statusCode: 302,
    parametersAdded: ["affid", "sub1", "_ef_transaction_id"],
    parametersRemoved: [],
    transition: "go.acme.co → try.acme.com",
    elapsedMs: 112,
  },
  {
    url: "https://try.acme.com/restore?utm_source=facebook&utm_campaign=summer_scale",
    statusCode: 200,
    parametersAdded: [],
    parametersRemoved: [],
    transition: "try.acme.com → try.acme.com",
    elapsedMs: 238,
  },
  {
    url: "https://try.acme.com/checkout",
    statusCode: 200,
    parametersAdded: ["session_id"],
    parametersRemoved: ["fbclid"],
    transition: "try.acme.com → checkout.acme.com",
    elapsedMs: 164,
  },
  {
    url: "https://try.acme.com/thank-you?order=TK-10482",
    statusCode: 200,
    parametersAdded: ["order"],
    parametersRemoved: [],
    transition: "checkout.acme.com → try.acme.com",
    elapsedMs: 401,
  },
];

function event(
  id: string,
  name: string,
  shortName: string,
  timestamp: string,
  domain: string,
  attributionRole: string,
  overrides: Partial<JourneyEvent> = {},
): JourneyEvent {
  return {
    id,
    name,
    shortName,
    timestamp,
    domain,
    originalUrl: `https://${domain}/event/${id}`,
    referrer: "https://facebook.com/",
    destinationUrl: `https://${domain}/next`,
    attributionRole,
    status: "Observed",
    confidence: "High",
    trackingHealth: "Excellent",
    trackingStatus: "Identifiers preserved",
    identifiers: { ...baseIdentifiers },
    queryParameters: {
      utm_source: "facebook",
      utm_campaign: "summer_scale",
      affid: "2041",
      sub1: "video_a",
      sub2: "prospecting",
      _ef_transaction_id: "ef_21a7f0ce98",
      fbclid: "IwAR2zE9f8jQ4N",
      gclid: "—",
    },
    redirectPath,
    diagnostics: [
      { label: "First-party cookie stored successfully", state: "positive" },
      { label: "Local storage available", state: "positive" },
      { label: "Session storage available", state: "positive" },
      { label: "Cross-domain identifier preserved", state: "positive" },
      { label: "Server-side conversion received", state: "positive" },
    ],
    relationships: [
      { type: "Customer", label: "John Smith" },
      { type: "Journey", label: "jrn_01JTK8FQ7B6P3V" },
      { type: "Order", label: "TK-10482" },
      { type: "Payment", label: "ch_3QeY71Lkd" },
      { type: "Affiliate conversion", label: "ef_21a7f0ce98" },
      { type: "Financial event", label: "fin_83913" },
      { type: "Profit calculation", label: "profit_10482" },
    ],
    explanation: {
      title: attributionRole === "First touch" ? "First Touch: Facebook" : `${name} classification`,
      reason:
        attributionRole === "First touch"
          ? "This was the earliest qualifying recorded traffic source associated with the customer."
          : "This event was linked through preserved journey, session, and commerce identifiers.",
      evidence: [
        "Earliest qualifying timestamp",
        "fbclid captured",
        "Session persisted",
        "Everflow transaction matched",
        "Order matched",
      ],
    },
    ...overrides,
  };
}

const healthyJourney: JourneyEvent[] = [
  event("evt-facebook", "Facebook Ad", "Facebook Ad", "Today, 9:41:02 AM", "facebook.com", "First touch"),
  event("evt-redirect", "Tracking Redirect", "Redirect", "Today, 9:41:03 AM", "go.acme.co", "Attribution bridge"),
  event("evt-landing", "Landing Page", "Landing", "Today, 9:41:04 AM", "try.acme.com", "Qualifying touch"),
  event("evt-checkout", "Checkout", "Checkout", "Today, 9:47:18 AM", "checkout.acme.com", "Conversion assist"),
  event("evt-purchase", "Purchase", "Purchase", "Today, 9:49:31 AM", "checkout.acme.com", "Conversion"),
  event("evt-upsell", "Upsell", "Upsell", "Today, 9:50:14 AM", "checkout.acme.com", "Post-purchase"),
  event("evt-payment", "Payment", "Payment", "Today, 9:50:17 AM", "stripe.com", "Financial event"),
  event("evt-everflow", "Everflow Conversion", "Everflow", "Today, 9:50:19 AM", "api.eflow.team", "Affiliate conversion"),
  event("evt-financial", "Financial Import", "Import", "Today, 9:54:02 AM", "api.stripe.com", "Financial authority"),
  event("evt-profit", "Profit Updated", "Profit", "Today, 9:54:04 AM", "tracekit.local", "Operational outcome"),
];

const lostIdDiagnostics: JourneyEvent["diagnostics"] = [
  { label: "First-party cookie stored successfully", state: "positive" },
  { label: "Local storage available", state: "positive" },
  { label: "Cross-domain identifier lost", state: "negative" },
  { label: "Everflow transaction ID missing after redirect", state: "negative" },
  { label: "Order matched through customer and session evidence", state: "warning" },
];

const interferenceDiagnostics: JourneyEvent["diagnostics"] = [
  { label: "First-party cookie missing after redirect", state: "negative" },
  { label: "Third-party cookie unavailable", state: "warning" },
  { label: "Local storage available", state: "positive" },
  { label: "Expected Meta request not observed", state: "negative" },
  { label: "Possible content blocker or browser privacy restriction", state: "warning" },
];

function degradedJourney(): JourneyEvent[] {
  return healthyJourney.map((item, index) =>
    index >= 2 && index <= 5
      ? {
          ...item,
          id: `mary-${item.id}`,
          trackingHealth: "Degraded",
          trackingStatus: "Everflow identifier lost",
          confidence: "Medium",
          identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1088", "Everflow Transaction ID": "Missing after redirect", "Order ID": "TK-10501" },
          diagnostics: lostIdDiagnostics,
          explanation: {
            title: "Attribution recovered from supporting evidence",
            reason: "The Everflow transaction ID was lost during a cross-domain transition. TraceKit retained the original first touch but lowered confidence.",
            evidence: ["First qualifying Facebook touch observed", "Session identifier preserved", "Everflow transaction ID absent at landing page", "Customer and order matched"],
          },
        }
      : { ...item, id: `mary-${item.id}`, identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1088", "Order ID": "TK-10501" } },
  );
}

function poorJourney(): JourneyEvent[] {
  return healthyJourney.slice(0, 7).map((item, index) =>
    index >= 1 && index <= 4
      ? {
          ...item,
          id: `alex-${item.id}`,
          trackingHealth: "Poor",
          trackingStatus: "Tracking interference likely",
          confidence: "Low",
          identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1177", "Facebook Click ID": "Not observed", "Everflow Transaction ID": "Not observed", "Order ID": "TK-10544" },
          diagnostics: interferenceDiagnostics,
          explanation: {
            title: "Tracking interference likely",
            reason: "Expected browser evidence was not observed. A content blocker or browser privacy restriction may have affected tracking.",
            evidence: ["Meta request not observed", "First-party cookie absent after redirect", "Local storage remained available", "Purchase matched from server-side order evidence"],
          },
        }
      : { ...item, id: `alex-${item.id}`, identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1177", "Order ID": "TK-10544" } },
  );
}

export const mockCustomers: MockCustomer[] = [
  {
    id: "cus_tk_1042",
    name: "John Smith",
    email: "john.smith@example.com",
    phone: "+1 (512) 555-0182",
    status: "Active customer",
    statusTone: "success",
    operationalProfit: 842,
    lifetimeRevenue: 1274,
    customerSince: "Feb 12, 2026",
    firstTouch: "Facebook · Summer Scale",
    lastPurchase: "Today, 9:49 AM",
    lastActivity: "Purchased today",
    eventLabel: "Healthy journey",
    journeyPreview: "Facebook → Landing Page → Purchase",
    trackingHealth: "Excellent",
    tags: ["Recent", "New Today", "High Value"],
    journey: healthyJourney,
    orders: [
      { id: "ord-10482", number: "TK-10482", date: "Today, 9:49 AM", revenue: 642, operationalProfit: 421, status: "Paid", attributionSource: "Facebook", paymentId: "ch_3QeY71Lkd", summary: "Restore Bundle + Post-purchase Upsell" },
      { id: "ord-10311", number: "TK-10311", date: "May 18, 2026", revenue: 632, operationalProfit: 421, status: "Paid", attributionSource: "Facebook", paymentId: "ch_3NbL18Zst", summary: "Restore Bundle" },
    ],
  },
  {
    id: "cus_tk_1088",
    name: "Mary Johnson",
    email: "mary.johnson@example.com",
    phone: "+1 (602) 555-0137",
    status: "Needs attention",
    statusTone: "warning",
    operationalProfit: 421,
    lifetimeRevenue: 899,
    customerSince: "Mar 4, 2026",
    firstTouch: "Facebook · Wellness 40+",
    lastPurchase: "Yesterday, 4:22 PM",
    lastActivity: "Refund yesterday",
    eventLabel: "Everflow ID lost",
    journeyPreview: "Facebook → Redirect gap → Purchase",
    trackingHealth: "Degraded",
    tags: ["Recent", "Needs Attention", "Refunded"],
    journey: degradedJourney(),
    orders: [
      { id: "ord-10501", number: "TK-10501", date: "Yesterday, 4:22 PM", revenue: 478, operationalProfit: 0, status: "Refunded", attributionSource: "Facebook · Medium confidence", paymentId: "ch_3Qf011Rdk", summary: "Complete Wellness Pack · Full refund posted" },
    ],
  },
  {
    id: "cus_tk_1095",
    name: "Sarah Wilson",
    email: "sarah.wilson@example.com",
    phone: "+1 (303) 555-0199",
    status: "Repeat customer",
    statusTone: "success",
    operationalProfit: 1240,
    lifetimeRevenue: 2188,
    customerSince: "Nov 9, 2025",
    firstTouch: "Google · Brand search",
    lastPurchase: "3 days ago",
    lastActivity: "Repeat customer",
    eventLabel: "4 lifetime orders",
    journeyPreview: "Google → Product Page → Repeat Purchase",
    trackingHealth: "Excellent",
    tags: ["High Value"],
    journey: healthyJourney.map((item) => ({ ...item, id: `sarah-${item.id}`, identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1095", "Google Click ID": "Cj0KCQjwz7", "Facebook Click ID": "—", "Order ID": "TK-10470" } })),
    orders: [
      { id: "ord-10470", number: "TK-10470", date: "3 days ago", revenue: 629, operationalProfit: 388, status: "Paid", attributionSource: "Google", paymentId: "ch_3Qe877Wqp", summary: "Restore Bundle" },
      { id: "ord-10082", number: "TK-10082", date: "Apr 2, 2026", revenue: 519, operationalProfit: 302, status: "Paid", attributionSource: "Email", paymentId: "ch_3LK890Bqp", summary: "Subscription renewal" },
      { id: "ord-9821", number: "TK-9821", date: "Jan 15, 2026", revenue: 520, operationalProfit: 288, status: "Paid", attributionSource: "Direct", paymentId: "ch_3JK372Mls", summary: "Restore Bundle" },
    ],
  },
  {
    id: "cus_tk_1177",
    name: "Alex Ramirez",
    email: "alex.ramirez@example.com",
    phone: "+1 (415) 555-0144",
    status: "Review tracking",
    statusTone: "warning",
    operationalProfit: 186,
    lifetimeRevenue: 398,
    customerSince: "Today",
    firstTouch: "Facebook · Unconfirmed",
    lastPurchase: "Today, 8:18 AM",
    lastActivity: "Purchased today",
    eventLabel: "Tracking interference likely",
    journeyPreview: "Ad click → Evidence gap → Purchase",
    trackingHealth: "Poor",
    tags: ["New Today", "Needs Attention"],
    journey: poorJourney(),
    orders: [
      { id: "ord-10544", number: "TK-10544", date: "Today, 8:18 AM", revenue: 398, operationalProfit: 186, status: "Paid", attributionSource: "Facebook · Low confidence", paymentId: "ch_3Qg442Pmw", summary: "Starter System" },
    ],
  },
  {
    id: "cus_tk_1024",
    name: "David Lee",
    email: "david.lee@example.com",
    phone: "+1 (646) 555-0126",
    status: "Active customer",
    statusTone: "neutral",
    operationalProfit: 337,
    lifetimeRevenue: 724,
    customerSince: "Jan 21, 2026",
    firstTouch: "Affiliate · Partner 2041",
    lastPurchase: "12 days ago",
    lastActivity: "Email opened 2 days ago",
    eventLabel: "Affiliate journey",
    journeyPreview: "Affiliate → Advertorial → Purchase",
    trackingHealth: "Excellent",
    tags: ["Recent"],
    journey: healthyJourney.map((item) => ({ ...item, id: `david-${item.id}`, identifiers: { ...item.identifiers, "Customer ID": "cus_tk_1024", "Order ID": "TK-10394" } })),
    orders: [
      { id: "ord-10394", number: "TK-10394", date: "12 days ago", revenue: 724, operationalProfit: 337, status: "Paid", attributionSource: "Affiliate 2041", paymentId: "pp_8FM82910CA", summary: "Complete System" },
    ],
  },
];

export type SearchMatch = {
  id: string;
  identifierType: string;
  value: string;
  customerId: string;
  eventId?: string;
  orderId?: string;
  objectType: "Customer" | "Journey event" | "Order" | "Payment";
  title: string;
  subtitle: string;
};

export const searchMatches: SearchMatch[] = [
  { id: "search-email", identifierType: "Email", value: "john.smith@example.com", customerId: "cus_tk_1042", objectType: "Customer", title: "John Smith", subtitle: "Customer · john.smith@example.com" },
  { id: "search-phone", identifierType: "Phone number", value: "+1 (602) 555-0137", customerId: "cus_tk_1088", objectType: "Customer", title: "Mary Johnson", subtitle: "Customer · +1 (602) 555-0137" },
  { id: "search-order", identifierType: "Order ID", value: "TK-10501", customerId: "cus_tk_1088", eventId: "mary-evt-purchase", orderId: "ord-10501", objectType: "Order", title: "Order TK-10501", subtitle: "Mary Johnson · Refunded" },
  { id: "search-everflow", identifierType: "Everflow Transaction ID", value: "ef_21a7f0ce98", customerId: "cus_tk_1042", eventId: "evt-everflow", objectType: "Journey event", title: "Everflow Conversion", subtitle: "John Smith · Today, 9:50 AM" },
  { id: "search-fbclid", identifierType: "Facebook Click ID", value: "IwAR2zE9f8jQ4N", customerId: "cus_tk_1042", eventId: "evt-facebook", objectType: "Journey event", title: "Facebook Ad", subtitle: "John Smith · First touch" },
  { id: "search-gclid", identifierType: "Google Click ID", value: "Cj0KCQjwz7", customerId: "cus_tk_1095", eventId: "sarah-evt-facebook", objectType: "Journey event", title: "Google Ad Click", subtitle: "Sarah Wilson · First touch" },
  { id: "search-session", identifierType: "Session ID", value: "ses_7d3c91a844", customerId: "cus_tk_1042", eventId: "evt-landing", objectType: "Journey event", title: "Landing Page", subtitle: "John Smith · Session ses_7d3c91a844" },
  { id: "search-stripe", identifierType: "Stripe charge ID", value: "ch_3QeY71Lkd", customerId: "cus_tk_1042", eventId: "evt-payment", objectType: "Payment", title: "Stripe payment", subtitle: "John Smith · $642.00" },
  { id: "search-paypal", identifierType: "PayPal transaction ID", value: "pp_8FM82910CA", customerId: "cus_tk_1024", eventId: "david-evt-payment", orderId: "ord-10394", objectType: "Payment", title: "PayPal payment", subtitle: "David Lee · $724.00" },
  { id: "search-journey", identifierType: "TraceKit Journey ID", value: "jrn_01JTK8FQ7B6P3V", customerId: "cus_tk_1042", eventId: "evt-redirect", objectType: "Journey event", title: "Customer journey", subtitle: "John Smith · 10 observed events" },
];

export function detectIdentifierType(query: string) {
  const value = query.trim();
  if (!value) return "Paste any identifier";
  if (value.includes("@")) return "Email";
  if (/^\+?[\d\s().-]{10,}$/.test(value)) return "Phone number";
  if (/^TK-\d+$/i.test(value)) return "Order ID";
  if (/^ef_/i.test(value)) return "Everflow Transaction ID";
  if (/^IwAR/i.test(value)) return "Facebook Click ID";
  if (/^Cj0/i.test(value)) return "Google Click ID";
  if (/^ses_/i.test(value)) return "Session ID";
  if (/^ch_/i.test(value)) return "Stripe charge ID";
  if (/^pp_/i.test(value)) return "PayPal transaction ID";
  if (/^jrn_/i.test(value)) return "TraceKit Journey ID";
  return "Possible identifier";
}

export function searchMockData(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return searchMatches.slice(0, 4);
  return searchMatches.filter((match) =>
    [match.value, match.title, match.subtitle, match.identifierType].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

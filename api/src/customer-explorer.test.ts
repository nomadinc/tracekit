import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildCustomer360 } from "./explanations.ts";
import {
  buildJourneyActivity,
  buildJourneyActivitySummary,
  customerDisplayName,
  decodeCustomerListCursor,
  decodeJourneyEventCursor,
  encodeCustomerListCursor,
  encodeJourneyEventCursor,
  matchCustomerExplorerRoute,
  narrativeEventTitle,
  normalizeCustomerJourneyDetailParams,
  normalizeCustomerListParams,
  redactTechnicalMetadata,
} from "./customer-explorer.ts";

test("customer explorer routes are canonical and method-safe", () => {
  assert.deepEqual(matchCustomerExplorerRoute("GET", "/v1/customers"), { kind: "customer_list" });
  assert.deepEqual(matchCustomerExplorerRoute("GET", "/v1/customers/"), { kind: "customer_list" });
  assert.deepEqual(matchCustomerExplorerRoute("GET", "/v1/customers/person-1"), { kind: "customer_detail", person_id: "person-1" });
  assert.deepEqual(matchCustomerExplorerRoute("GET", "/v1/customers/person-1/journeys/journey-1"), {
    kind: "customer_journey_detail",
    person_id: "person-1",
    journey_id: "journey-1",
  });
  assert.deepEqual(matchCustomerExplorerRoute("POST", "/v1/customers"), {
    kind: "method_not_allowed",
    path: "/v1/customers",
    allowed_methods: ["GET"],
  });
  assert.deepEqual(matchCustomerExplorerRoute("DELETE", "/v1/customers/person-1"), {
    kind: "method_not_allowed",
    path: "/v1/customers/:person_id",
    allowed_methods: ["GET"],
  });
});

test("customer list params are workspace scoped bounded and preserve real filters", () => {
  const params = normalizeCustomerListParams({
    workspace_id: " default ",
    search: " Jane@Example.COM ",
    limit: "500",
    from: "2026-07-01",
    to: "2026-07-25",
    journey_status: "completed",
    has_purchase: "true",
    has_attribution: "false",
    has_commission: "yes",
    identity_status: "active",
    source: "wowboost",
    affiliate_id: "affiliate-1",
  });
  assert.equal(params.workspace_id, "default");
  assert.equal(params.search, "Jane@Example.COM");
  assert.equal(params.limit, 50);
  assert.equal(params.from, "2026-07-01T00:00:00.000Z");
  assert.equal(params.to_exclusive, "2026-07-26T00:00:00.000Z");
  assert.equal(params.journey_status, "completed");
  assert.equal(params.has_purchase, true);
  assert.equal(params.has_attribution, false);
  assert.equal(params.has_commission, true);
  assert.equal(params.identity_status, "active");
  assert.equal(params.source_platform, "wowboost");
  assert.equal(params.affiliate_id, "affiliate-1");
});

test("customer explorer cursors round-trip deterministically", () => {
  const customerCursor = { updated_at: "2026-07-25T12:00:00.000Z", id: "person-1" };
  assert.deepEqual(decodeCustomerListCursor(encodeCustomerListCursor(customerCursor)), customerCursor);

  const eventCursor = { event_time: "2026-07-25T12:01:00.000Z", id: "event-1" };
  assert.deepEqual(decodeJourneyEventCursor(encodeJourneyEventCursor(eventCursor)), eventCursor);
});

test("customer journey detail params are bounded and reject missing IDs", () => {
  const params = normalizeCustomerJourneyDetailParams({
    workspace_id: "other",
    person_id: "person-1",
    journey_id: "journey-1",
    limit: "1000",
  });
  assert.equal(params.workspace_id, "other");
  assert.equal(params.limit, 100);
  assert.equal(params.person_id, "person-1");
  assert.equal(params.journey_id, "journey-1");
  assert.throws(() => normalizeCustomerJourneyDetailParams({ person_id: "", journey_id: "journey-1" }), /person_id and journey_id/);
});

test("customer display prefers useful deterministic identifiers over generic unknowns", () => {
  assert.equal(customerDisplayName({ display_name: "Jane Customer" }, []), "Jane Customer");
  assert.equal(customerDisplayName({ primary_email: "jane@example.com" }, []), "jane@example.com");
  assert.equal(customerDisplayName({ primary_phone: "+15555551212" }, []), "+15555551212");
  assert.equal(customerDisplayName({ id: "person-1" }, [{ identifier_type: "external_customer_id", normalized_value: "shop-customer-7" }]), "shop-customer-7");
});

test("customer explorer is wired through read-only authenticated backend routes", () => {
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const module = readFileSync(new URL("./customer-explorer.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/028_customer_journey_explorer_indexes.sql", import.meta.url), "utf8");
  const uiList = readFileSync(new URL("../../ui/app/(app)/customers/customers-client.tsx", import.meta.url), "utf8");
  const uiDetail = readFileSync(new URL("../../ui/app/(app)/customers/[person_id]/customer-detail-client.tsx", import.meta.url), "utf8");
  const uiProxy = readFileSync(new URL("../../ui/app/api/customers/route.ts", import.meta.url), "utf8");
  const uiProxyDetail = readFileSync(new URL("../../ui/app/api/customers/[...customerPath]/route.ts", import.meta.url), "utf8");

  assert.match(worker, /matchCustomerExplorerRoute/);
  assert.match(worker, /adminAuthError\(req, env\)/);
  assert.match(worker, /listCustomers\(getSupabase\(env\), params\)/);
  assert.match(worker, /getCustomerDetail\(getSupabase\(env\)/);
  assert.match(worker, /getCustomerJourneyDetail\(getSupabase\(env\), params\)/);
  assert.doesNotMatch(module, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.match(module, /\.eq\("workspace_id", params\.workspace_id\)/);
  assert.match(module, /\.eq\("workspace_id", args\.workspace_id\)/);
  assert.match(migration, /people_customer_explorer_updated_idx/);
  assert.match(migration, /platform_orders_customer_explorer_person_order_idx/);
  assert.match(migration, /journey_events_customer_explorer_journey_timeline_idx/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|delete from|update public|alter table/);
  assert.match(uiProxy, /\/v1\/customers/);
  assert.match(uiProxy, /"x-tk-secret": secret/);
  assert.match(uiProxyDetail, /\/v1\/customers\/\$\{path\}/);
  assert.match(uiList, /Customer Journey Explorer/);
  assert.match(uiList, /Has attribution/);
  assert.match(uiDetail, /EntityHeader/);
  assert.match(uiDetail, /CustomerMetricGrid/);
  assert.match(uiDetail, /Journey Explorer/);
  assert.match(uiDetail, /IdentityExplanationCard/);
  assert.match(uiDetail, /NarrativeTimeline/);
  assert.equal(existsSync(new URL("../../ui/app/(app)/customers/[identity_key]/page.tsx", import.meta.url)), false);
});

test("narrative activity feed composes mixed subsystem events in stable story order", () => {
  const events = [
    {
      id: "purchase-1",
      journey_id: "journey-1",
      person_id: "person-1",
      event_type: "purchase",
      event_time: "2026-07-20T10:05:00.000Z",
      source_platform: "wowboost",
      platform_order_id: "wowboost:88392",
      amount: "149.00",
      currency: "USD",
      metadata: { api_token: "secret", url: "/checkout" },
      created_at: "2026-07-20T10:05:02.000Z",
    },
    {
      id: "click-1",
      journey_id: "journey-1",
      person_id: "person-1",
      event_type: "click",
      event_time: "2026-07-20T10:00:00.000Z",
      source_platform: "browser",
      affiliate_id: "98",
      metadata: { url: "/offer-page" },
      created_at: "2026-07-20T10:00:01.000Z",
    },
  ];
  const credits = [
    {
      id: "credit-1",
      journey_id: "journey-1",
      conversion_event_id: "purchase-1",
      touchpoint_event_id: "click-1",
      model: "first_touch",
      model_version: 1,
      status: "attributed",
      reason: "Earliest eligible touchpoint",
      credit_percent: "100",
      credit_amount: "149.00",
      currency: "USD",
      affiliate_id: "98",
      calculated_at: "2026-07-20T10:05:05.000Z",
    },
    {
      id: "credit-2",
      journey_id: "journey-1",
      conversion_event_id: "purchase-1",
      touchpoint_event_id: "click-1",
      model: "linear",
      model_version: 1,
      status: "attributed",
      credit_percent: "50",
      credit_amount: "74.50",
      currency: "USD",
      affiliate_id: "12",
      calculated_at: "2026-07-20T10:05:05.000Z",
    },
  ];
  const activity = buildJourneyActivity({
    events,
    identityEvents: [{
      id: "identity-1",
      person_id: "person-1",
      resolution_action: "attached_identifier",
      resolution_reason: "Matched using normalized email.",
      source_platform: "browser",
      created_at: "2026-07-20T10:02:00.000Z",
      metadata: {},
    }],
    orders: [{
      platform: "wowboost",
      platform_order_id: "wowboost:88392",
      order_id: "88392",
      order_ts: "2026-07-20T10:05:00.000Z",
      gross_amount: "149.00",
      currency: "USD",
      status: "complete",
      raw_json: { Authorization: "Bearer secret", line_items: [{ sku: "SKU-1" }] },
    }],
    credits,
    commissions: [{
      id: "commission-1",
      journey_attribution_credit_id: "credit-1",
      conversion_event_id: "purchase-1",
      affiliate_id: "98",
      status: "draft",
      credit_amount: "149.00",
      commission_rate: "0.20",
      commission_amount: "29.80",
      currency: "USD",
      generated_at: "2026-07-20T10:05:08.000Z",
    }],
  });

  assert.deepEqual(activity.map((row) => row.category), ["marketing", "identity", "commerce", "attribution", "attribution", "commission"]);
  assert.equal(activity[0].title, "Affiliate click");
  assert.match(activity[0].summary, /Affiliate 98 brought the customer to \/offer-page/);
  assert.equal(activity[2].title, "Purchase completed");
  assert.match(activity[2].summary, /wowboost:88392 was completed for \$149.00/);
  assert.equal(activity[3].title, "Attribution calculated");
  assert.equal(activity[3].explanation.reason, "Earliest eligible touchpoint");
  assert.equal(activity[5].explanation.formula, "$149.00 x 20% = $29.80");
  assert.equal(activity[2].technical_evidence.metadata.api_token, "[redacted]");
});

test("journey activity summary uses stored metrics without inferring journey outcome", () => {
  const activity = buildJourneyActivity({
    events: [{ id: "click-1", event_type: "click", event_time: "2026-07-20T10:00:00.000Z", affiliate_id: "98", metadata: {} }],
    identityEvents: [],
    orders: [],
    credits: [{ affiliate_id: "98", source: "affiliate", model: "first_touch", currency: "USD" }],
    commissions: [{ commission_amount: "29.80", currency: "USD" }],
  });
  const summary = buildJourneyActivitySummary({
    started_at: "2026-07-20T10:00:00.000Z",
    ended_at: "2026-07-22T10:00:00.000Z",
    status: "active",
    event_count: 17,
    purchase_count: 1,
    total_revenue: "149.00",
  }, activity, [{ affiliate_id: "98", model: "first_touch", currency: "USD" }], [{ commission_amount: "29.80", currency: "USD" }]);
  assert.equal(summary.status, "active");
  assert.equal(summary.events, 17);
  assert.equal(summary.marketing_touchpoints, 1);
  assert.equal(summary.revenue, "$149.00");
  assert.equal(summary.attributed_source.affiliate_id, "98");
  assert.equal(summary.commission_total, "$29.80");
});

test("narrative labels and evidence redaction are deterministic and safe", () => {
  assert.equal(narrativeEventTitle("page_view"), "Page viewed");
  assert.equal(narrativeEventTitle("custom_event_name"), "Custom Event Name");
  assert.deepEqual(redactTechnicalMetadata({
    nested: { access_token: "secret", safe: "kept" },
    card_number: "4111111111111111",
    long: "a".repeat(510),
  }), {
    nested: { access_token: "[redacted]", safe: "kept" },
    card_number: "[redacted]",
    long: `${"a".repeat(500)}...`,
  });
});

test("customer 360 aggregates commercial value attribution commissions and risk without duplicate event counting", () => {
  const customer360 = buildCustomer360({
    person: { id: "person-1", display_name: "Jane Smith", first_seen_at: "2026-01-14T10:00:00.000Z", primary_email: "jane@example.com" },
    identifiers: [{ id: "identifier-1", identifier_type: "email", normalized_value: "jane@example.com" }],
    identityEvents: [{ id: "identity-event-1", resolution_reason: "Matched using normalized email." }],
    journeys: [{ id: "journey-1" }, { id: "journey-2" }],
    orders: [
      { platform_order_id: "wowboost:base-1", order_id: "88392", platform: "wowboost", order_ts: "2026-07-20T10:00:00.000Z", gross_amount: "149.00", currency: "USD", status: "complete", affiliate_id: "98", raw_json: { line_items: [{ sku: "BASE" }] } },
      { platform_order_id: "wowboost:upsell-1", order_id: "88392-U1", platform: "wowboost", order_ts: "2026-07-20T10:05:00.000Z", gross_amount: "49.00", currency: "USD", status: "complete", affiliate_id: "98" },
      { platform_order_id: "wowboost:refund-1", order_id: "88392-R", platform: "wowboost", order_ts: "2026-07-22T10:05:00.000Z", gross_amount: "-20.00", currency: "USD", status: "refund" },
      { platform_order_id: "wowboost:chargeback-1", order_id: "88400-C", platform: "wowboost", order_ts: "2026-07-23T10:05:00.000Z", gross_amount: "-10.00", currency: "USD", status: "chargeback" },
      { platform_order_id: "wowboost:base-1", order_id: "88392", platform: "wowboost", order_ts: "2026-07-20T10:00:00.000Z", gross_amount: "149.00", currency: "USD", status: "complete" },
    ],
    credits: [
      { id: "credit-1", conversion_event_id: "wowboost:base-1", touchpoint_event_id: "touch-1", journey_id: "journey-1", status: "attributed", affiliate_id: "98", model: "first_touch", credit_percent: "100", credit_amount: "149.00", currency: "USD", conversion_event_time: "2026-07-20T10:00:00.000Z", touchpoint_event_time: "2026-07-19T10:00:00.000Z", reason: "Stored result" },
      { id: "credit-2", conversion_event_id: "wowboost:upsell-1", touchpoint_event_id: "touch-2", journey_id: "journey-1", status: "attributed", affiliate_id: "98", model: "linear", credit_percent: "50", credit_amount: "24.50", currency: "USD", conversion_event_time: "2026-07-20T10:05:00.000Z" },
      { id: "credit-3", conversion_event_id: "wowboost:upsell-1", touchpoint_event_id: "touch-3", journey_id: "journey-1", status: "attributed", source: "google", medium: "cpc", model: "linear", credit_percent: "50", credit_amount: "24.50", currency: "USD", conversion_event_time: "2026-07-20T10:05:00.000Z" },
    ],
    commissions: [
      { id: "commission-1", conversion_event_id: "wowboost:base-1", affiliate_id: "98", status: "paid", credit_amount: "149.00", commission_rate: "0.20", commission_amount: "29.80", currency: "USD", generated_at: "2026-07-20T10:10:00.000Z" },
      { id: "commission-2", conversion_event_id: "wowboost:upsell-1", affiliate_id: "98", status: "pending", credit_amount: "24.50", commission_rate: "0.20", commission_amount: "4.90", currency: "USD", generated_at: "2026-07-20T10:11:00.000Z" },
      { id: "commission-3", conversion_event_id: "wowboost:refund-1", affiliate_id: "98", status: "reversed", commission_amount: "-2.00", currency: "USD", generated_at: "2026-07-22T10:11:00.000Z" },
    ],
  });

  assert.equal(customer360.metrics.orders, 2);
  assert.equal(customer360.metrics.lifetime_revenue, "$198.00");
  assert.equal(customer360.metrics.average_order_value, "$99.00");
  assert.equal(customer360.metrics.refunded_revenue, "$20.00");
  assert.equal(customer360.metrics.chargeback_revenue, "$10.00");
  assert.equal(customer360.metrics.attributed_revenue, "$198.00");
  assert.equal(customer360.metrics.attributed_orders, 2);
  assert.equal(customer360.metrics.commission_generated, "$32.70");
  assert.equal(customer360.metrics.commission_paid, "$29.80");
  assert.equal(customer360.metrics.commission_pending, "$4.90");
  assert.equal(customer360.metrics.commission_reversed, "-$2.00");
  assert.equal(customer360.refunds.count, 1);
  assert.equal(customer360.chargebacks.count, 1);
  assert.equal(customer360.channels[0].channel, "Affiliate 98");
  assert.equal(customer360.acquisition.first_attributed_source.source, "Affiliate 98");
  assert.equal(customer360.commercial_summary.orders.length, 4);
  assert.match(customer360.commercial_summary.aggregation_keys.order_count, /never email/);
  assert.equal(customer360.value_by_month.length, 1);
  assert.equal(customer360.value_by_month[0].order_revenue, "$198.00");
  assert.match(customer360.explanations.customer.summary, /Jane Smith/);
  assert.ok(customer360.explanations.customer.statements.every((statement: any) => Array.isArray(statement.evidence_ids)));
  assert.ok(customer360.explanations.orders["wowboost:base-1"].statements.some((statement: any) => statement.id === "order_commissions"));
});

test("customer 360 omits unsupported subscription and records limited-evidence explanations", () => {
  const customer360 = buildCustomer360({
    person: { id: "person-limited", first_seen_at: "2026-01-01T00:00:00.000Z" },
    identifiers: [],
    identityEvents: [],
    journeys: [],
    orders: [],
    credits: [],
    commissions: [],
  });
  assert.equal(customer360.subscription, null);
  assert.equal(customer360.metrics.orders, 0);
  assert.equal(customer360.operational_health.find((item: any) => item.id === "identity_linked").status, "attention");
  assert.ok(customer360.explanations.customer.limitations.includes("No linked purchases are available for this customer."));
  assert.ok(customer360.explanations.customer.limitations.includes("No eligible marketing touchpoint was retained for this customer."));
});

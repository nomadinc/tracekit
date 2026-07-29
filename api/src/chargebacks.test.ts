import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPaypalDisputeDetailUrl,
  buildPaypalDisputeListUrl,
  classifyGatewayClassicAction,
  clampPaypalDisputeUpdateTimeBefore,
  dedupePaypalDisputeListItems,
  mergePaypalDisputeListAndDetail,
  normalizePaypalDisputeEvents,
  paypalDisputeContinuationCursor,
  paypalDisputeWindowBounds,
  parsePaypalDisputeListPage,
  sanitizePaypalDisputeNextQuery,
  stableChargebackEventId,
  summarizeGatewayClassicActionsForDiagnostics,
  summarizePaypalDisputeNormalizationDiagnostics,
} from "./chargebacks.ts";

test("PayPal dispute list URL uses update-time filters and bounded page size", () => {
  const url = new URL(buildPaypalDisputeListUrl({
    base_url: "https://api-m.paypal.com",
    from_iso: "2026-07-01T00:00:00.000Z",
    to_iso: "2026-08-01T00:00:00.000Z",
    page: 2,
    page_size: 500,
  }));

  assert.equal(url.pathname, "/v1/customer/disputes");
  assert.equal(url.searchParams.get("update_time_after"), "2026-07-01T00:00:00.000Z");
  assert.ok(Date.parse(url.searchParams.get("update_time_before") || "") <= Date.now());
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("page_size"), "50");
});

test("PayPal dispute list pagination fixture parses next page and token", () => {
  const page = parsePaypalDisputeListPage({
    page: 1,
    page_size: 2,
    total_pages: 3,
    total_items: 5,
    items: [{ dispute_id: "PP-D-1" }, { dispute_id: "PP-D-2" }],
    links: [
      { rel: "self", href: "https://api-m.paypal.com/v1/customer/disputes?page=1" },
      { rel: "next", href: "https://api-m.paypal.com/v1/customer/disputes?page=2&next_page_token=TOKEN-2" },
    ],
  }, { requested_page: 1, page_size: 2 });

  assert.equal(page.disputes.length, 2);
  assert.equal(page.has_more, true);
  assert.equal(page.next_page, 2);
  assert.equal(page.next_page_token, "TOKEN-2");
  assert.equal(page.next_cursor, "TOKEN-2");
  assert.deepEqual(page.next_query, {
    page: "2",
    next_page_token: "TOKEN-2",
  });
});

test("PayPal dispute list uses HATEOAS next without numeric pagination metadata", () => {
  const page = parsePaypalDisputeListPage({
    items: [{ dispute_id: "PP-D-1" }],
    links: [
      { rel: "self", href: "https://api-m.paypal.com/v1/customer/disputes?page_size=1&page=1" },
      { rel: "next", href: "https://api-m.paypal.com/v1/customer/disputes?page_size=1&page=2&update_time_after=2026-07-21T00%3A00%3A00.000Z&update_time_before=2026-07-28T00%3A00%3A00.000Z" },
    ],
  }, { requested_page: 1, page_size: 1 });

  assert.equal(page.has_more, true);
  assert.equal(page.next_page, 2);
  assert.equal(page.next_cursor, "2");
  assert.deepEqual(page.next_query, {
    page_size: "1",
    page: "2",
    update_time_after: "2026-07-21T00:00:00.000Z",
    update_time_before: "2026-07-28T00:00:00.000Z",
  });
});

test("PayPal continuation validation respects production and sandbox hosts", () => {
  assert.deepEqual(
    sanitizePaypalDisputeNextQuery("https://api-m.paypal.com/v1/customer/disputes?page=2", "https://api-m.paypal.com"),
    { page: "2" },
  );
  assert.deepEqual(
    sanitizePaypalDisputeNextQuery("https://api-m.sandbox.paypal.com/v1/customer/disputes?page=2", "https://api-m.sandbox.paypal.com"),
    { page: "2" },
  );
  assert.equal(
    sanitizePaypalDisputeNextQuery("https://api-m.sandbox.paypal.com/v1/customer/disputes?page=2", "https://api-m.paypal.com"),
    null,
  );
  assert.equal(
    sanitizePaypalDisputeNextQuery("https://api-m.paypal.com/v1/customer/disputes?page=2", "https://api-m.sandbox.paypal.com"),
    null,
  );
});

test("PayPal dispute continuation rejects non-PayPal next URLs", () => {
  assert.equal(
    sanitizePaypalDisputeNextQuery("https://evil.example/v1/customer/disputes?page=2", "https://api-m.paypal.com"),
    null,
  );
  assert.equal(
    sanitizePaypalDisputeNextQuery("http://api-m.paypal.com/v1/customer/disputes?page=2", "https://api-m.paypal.com"),
    null,
  );
  assert.equal(
    sanitizePaypalDisputeNextQuery("https://api-m.paypal.com/v1/customer/disputes/PP-D-1?page=2", "https://api-m.paypal.com"),
    null,
  );
  assert.equal(
    sanitizePaypalDisputeNextQuery("https://user:secret@api-m.paypal.com/v1/customer/disputes?page=2", "https://api-m.paypal.com"),
    null,
  );
});

test("PayPal continuation cursor canonicalizes query-only cursors", () => {
  assert.equal(
    paypalDisputeContinuationCursor({
      update_time_before: "2026-07-28T00:00:00.000Z",
      update_time_after: "2026-07-21T00:00:00.000Z",
    }),
    "update_time_after=2026-07-21T00:00:00.000Z&update_time_before=2026-07-28T00:00:00.000Z",
  );
  assert.equal(
    paypalDisputeContinuationCursor({
      update_time_after: "2026-07-21T00:00:00.000Z",
      update_time_before: "2026-07-28T00:00:00.000Z",
    }),
    "update_time_after=2026-07-21T00:00:00.000Z&update_time_before=2026-07-28T00:00:00.000Z",
  );
});

test("PayPal repeated next cursor can be detected by the runtime", () => {
  const page = parsePaypalDisputeListPage({
    items: [{ dispute_id: "PP-D-1" }],
    links: [
      { rel: "next", href: "https://api-m.paypal.com/v1/customer/disputes?page_size=1&page=1" },
    ],
  }, { requested_page: 1, page_size: 1 });

  assert.equal(page.has_more, true);
  assert.equal(paypalDisputeContinuationCursor(page.next_query), "1");
});

test("PayPal empty or inverted update-time windows are detectable after clamping", () => {
  assert.deepEqual(
    paypalDisputeWindowBounds(
      "2026-07-28T12:00:00.000Z",
      "2026-07-28T12:00:00.000Z",
      new Date("2026-07-28T12:00:00.000Z"),
    ),
    {
      from_iso: "2026-07-28T12:00:00.000Z",
      to_iso: "2026-07-28T12:00:00.000Z",
      empty: true,
    },
  );
  assert.equal(
    paypalDisputeWindowBounds(
      "2026-07-29T00:00:00.000Z",
      "2026-07-30T00:00:00.000Z",
      new Date("2026-07-28T12:00:00.000Z"),
    ).empty,
    true,
  );
});

test("PayPal dispute list URL clamps future update_time_before", () => {
  const url = new URL(buildPaypalDisputeListUrl({
    base_url: "https://api-m.paypal.com",
    from_iso: "2026-07-01T00:00:00.000Z",
    to_iso: "2026-08-01T00:00:00.000Z",
    page: 1,
    page_size: 1,
  }));

  assert.equal(
    clampPaypalDisputeUpdateTimeBefore("2026-08-01T00:00:00.000Z", new Date("2026-07-28T12:00:00.000Z")),
    "2026-07-28T12:00:00.000Z",
  );
  assert.ok(Date.parse(url.searchParams.get("update_time_before") || "") <= Date.now());
});

test("PayPal duplicate dispute IDs on one page are deduped before detail fetch", () => {
  const unique = dedupePaypalDisputeListItems([
    { dispute_id: "PP-D-DUPE", update_time: "2026-07-10T00:00:00.000Z" },
    { dispute_id: "PP-D-DUPE", update_time: "2026-07-10T00:00:00.000Z" },
    { dispute_id: "PP-D-OTHER", update_time: "2026-07-11T00:00:00.000Z" },
  ]);

  assert.deepEqual(unique.map((dispute) => dispute.dispute_id), ["PP-D-DUPE", "PP-D-OTHER"]);
});

test("PayPal detail URL uses the dispute id path and no authorization material", () => {
  const detailUrl = new URL(buildPaypalDisputeDetailUrl("https://api-m.paypal.com", "PP-R-EER-638402066") || "");

  assert.equal(detailUrl.origin, "https://api-m.paypal.com");
  assert.equal(detailUrl.pathname, "/v1/customer/disputes/PP-R-EER-638402066");
  assert.equal(detailUrl.search, "");
});

test("PayPal malformed detail payload fails before normalization", () => {
  assert.throws(
    () => mergePaypalDisputeListAndDetail({ dispute_id: "PP-D-1" }, {}),
    /missing dispute_id/,
  );
  assert.throws(
    () => mergePaypalDisputeListAndDetail({ dispute_id: "PP-D-1" }, { dispute_id: "PP-D-2" }),
    /mismatch/,
  );
  assert.throws(
    () => mergePaypalDisputeListAndDetail({ dispute_id: "PP-D-1" }, null),
    /malformed/,
  );
});

test("PayPal detail payload is required before deterministic seller-transaction matching", () => {
  const listDispute = {
    dispute_id: "PP-D-LIVE",
    dispute_amount: { value: "50.00", currency_code: "USD" },
    disputed_transactions: [{ buyer_transaction_id: "BUYER-TXN-1" }],
    update_time: "2026-07-21T12:00:00.000Z",
  };
  const detailDispute = {
    dispute_id: "PP-D-LIVE",
    dispute_amount: { value: "50.00", currency_code: "USD" },
    disputed_transactions: [{
      buyer_transaction_id: "BUYER-TXN-1",
      seller_transaction_id: "SELLER-TXN-1",
      custom: "ORDER-1001",
      gross_amount: { value: "50.00", currency_code: "USD" },
    }],
    update_time: "2026-07-21T12:00:00.000Z",
  };

  const fromListOnly = normalizePaypalDisputeEvents(listDispute, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  })[0];
  const fromDetail = normalizePaypalDisputeEvents(mergePaypalDisputeListAndDetail(listDispute, detailDispute), {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  })[0];

  assert.equal(fromListOnly.processor_transaction_id, "BUYER-TXN-1");
  assert.equal(fromDetail.processor_transaction_id, "SELLER-TXN-1");
  assert.equal(fromDetail.commerce_reference, "ORDER-1001");
  assert.equal((fromDetail.meta as any).buyer_transaction_id, "BUYER-TXN-1");
});

test("PayPal detail response fixture emits separate principal and fee events", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-4012",
    status: "RESOLVED_BUYER_FAVOUR",
    disputed_transaction_id: "PAYPAL-TXN-1",
    invoice_id: "ORDER-1001",
    dispute_amount: { value: "99.00", currency_code: "USD" },
    chargeback_fee: { value: "15.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.length, 2);
  assert.equal(events.find((event) => event.ledger_type === "chargeback")?.amount, -99);
  assert.equal(events.find((event) => event.ledger_type === "chargeback_fee")?.amount, -15);
  assert.ok(events.every((event) => event.processor_account_id === "merchant-1"));
  assert.ok(events.every((event) => event.dispute_id === "PP-D-4012"));
});

test("PayPal missing fee fields emit no chargeback fee event", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-NO-FEE",
    status: "WAITING_FOR_SELLER_RESPONSE",
    disputed_transactions: [{
      seller_transaction_id: "SELLER-TXN-NO-FEE",
      buyer_transaction_id: "BUYER-TXN-NO-FEE",
      custom: "ORDER-NO-FEE",
    }],
    dispute_amount: { value: "99.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].ledger_type, "chargeback");
  assert.equal(events[0].amount, -99);
});

test("PayPal inspected live payload shape emits no fee or recovery without explicit money evidence", () => {
  const liveShape = mergePaypalDisputeListAndDetail({
    dispute_id: "PP-D-LIVE-SHAPE",
    dispute_amount: { value: "25.00", currency_code: "USD" },
    disputed_transactions: [{ buyer_transaction_id: "BUYER-LIVE-SHAPE" }],
    status: "RESOLVED",
    outcome: "RESOLVED_BUYER_FAVOUR",
    update_time: "2026-07-21T12:00:00.000Z",
  }, {
    dispute_id: "PP-D-LIVE-SHAPE",
    dispute_amount: { value: "25.00", currency_code: "USD" },
    disputed_transactions: [{
      buyer_transaction_id: "BUYER-LIVE-SHAPE",
      seller_transaction_id: "SELLER-LIVE-SHAPE",
      custom: "ORDER-LIVE-SHAPE",
      gross_amount: { value: "25.00", currency_code: "USD" },
    }],
    status: "RESOLVED",
    dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" },
    refund_details: {},
    evidences: [],
    adjudications: [],
    extensions: {},
    update_time: "2026-07-21T12:00:00.000Z",
  });
  const events = normalizePaypalDisputeEvents(liveShape, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });
  const diagnostics = summarizePaypalDisputeNormalizationDiagnostics(liveShape);

  assert.deepEqual(events.map((event) => event.ledger_type), ["chargeback"]);
  assert.equal(events[0].amount, -25);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.reason === "paypal_dispute_fee_not_exposed"));
});

test("PayPal explicit principal amount emits one stable chargeback event", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-PRINCIPAL",
    status: "OPEN",
    disputed_transactions: [{
      seller_transaction_id: "SELLER-TXN-PRINCIPAL",
      custom: "ORDER-PRINCIPAL",
    }],
    dispute_amount: { value: "10.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].ledger_type, "chargeback");
  assert.equal(events[0].source_event_id, "paypal_dispute:PP-D-PRINCIPAL:chargeback");
  assert.equal(events[0].processor_transaction_id, "SELLER-TXN-PRINCIPAL");
});

test("PayPal unmatched dispute remains insertable with source identifiers", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-UNMATCHED",
    status: "OPEN",
    dispute_amount: { value: "11.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].order_id, null);
  assert.equal(events[0].platform_order_id, null);
  assert.equal(events[0].source_event_id, "paypal_dispute:PP-D-UNMATCHED:chargeback");
});

test("PayPal later deterministic match preserves the same event identity as an unmatched dispute", () => {
  const unmatched = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-LATER-MATCH",
    status: "OPEN",
    dispute_amount: { value: "11.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  })[0];
  const laterMatched = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-LATER-MATCH",
    status: "OPEN",
    dispute_amount: { value: "11.00", currency_code: "USD" },
    disputed_transactions: [{ seller_transaction_id: "SELLER-LATER-MATCH", custom: "ORDER-LATER-MATCH" }],
    update_time: "2026-07-10T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  })[0];

  assert.equal(unmatched.source_event_id, laterMatched.source_event_id);
  assert.equal(unmatched.transaction_id, laterMatched.transaction_id);
  assert.equal(laterMatched.commerce_reference, "ORDER-LATER-MATCH");
});

test("PayPal seller-favorable update appends recoveries without rewriting original debit", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-4012",
    status: "RESOLVED_SELLER_FAVOUR",
    outcome: "seller won",
    disputed_transaction_id: "PAYPAL-TXN-1",
    money_movements: [
      {
        id: "MM-PRINCIPAL-1",
        party: "SELLER",
        type: "CREDIT",
        reason: "DISPUTE_SETTLEMENT",
        amount: { value: "99.00", currency_code: "USD" },
      },
      {
        id: "MM-FEE-1",
        party: "SELLER",
        type: "CREDIT",
        reason: "REVERSED_TRANSACTION_FEE",
        amount: { value: "15.00", currency_code: "USD" },
      },
    ],
    update_time: "2026-07-15T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.find((event) => event.ledger_type === "chargeback_reversal")?.amount, 99);
  assert.equal(events.find((event) => event.ledger_type === "chargeback_fee_reversal")?.amount, 15);
  assert.notEqual(
    events.find((event) => event.ledger_type === "chargeback_reversal")?.transaction_id,
    "paypal:merchant-1:PP-D-4012:chargeback",
  );
});

test("PayPal seller-favorable status without explicit money movement does not manufacture recoveries", () => {
  const events = normalizePaypalDisputeEvents({
    dispute_id: "PP-D-SELLER-NO-MOVEMENT",
    status: "RESOLVED_SELLER_FAVOUR",
    outcome: "seller won",
    disputed_transaction_id: "PAYPAL-TXN-1",
    dispute_amount: { value: "99.00", currency_code: "USD" },
    dispute_fee: { value: "15.00", currency_code: "USD" },
    update_time: "2026-07-15T12:00:00.000Z",
  }, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(events.length, 0);
});

test("same PayPal dispute polled repeatedly preserves stable event identities", () => {
  const dispute = {
    dispute_id: "PP-D-REPEAT",
    status: "WAITING_FOR_SELLER_RESPONSE",
    disputed_transaction_id: "PAYPAL-TXN-REPEAT",
    dispute_amount: { value: "42.00", currency_code: "USD" },
    chargeback_fee: { value: "5.00", currency_code: "USD" },
    update_time: "2026-07-10T12:00:00.000Z",
  };
  const runs = [1, 2, 3].map(() => normalizePaypalDisputeEvents(dispute, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  }));
  const firstIds = runs[0].map((event) => event.source_event_id).sort();

  assert.deepEqual(runs[1].map((event) => event.source_event_id).sort(), firstIds);
  assert.deepEqual(runs[2].map((event) => event.source_event_id).sort(), firstIds);
  assert.ok(firstIds.every(Boolean));
});

test("boundary duplicate windows rely on source-event idempotency", () => {
  const dispute = {
    dispute_id: "PP-D-BOUNDARY",
    status: "OPEN",
    disputed_transaction_id: "PAYPAL-TXN-BOUNDARY",
    dispute_amount: { value: "10.00", currency_code: "USD" },
    update_time: "2026-07-01T00:00:00.000Z",
  };
  const first = normalizePaypalDisputeEvents(dispute, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });
  const second = normalizePaypalDisputeEvents(dispute, {
    workspace_id: "default",
    connector_id: "paypal:merchant-1",
    processor_account_id: "merchant-1",
  });

  assert.equal(first[0].source_event_id, second[0].source_event_id);
  assert.equal(first[0].transaction_id, second[0].transaction_id);
});

test("same upstream transaction ID in two processor accounts produces distinct event identities", () => {
  const first = stableChargebackEventId({
    workspace_id: "default",
    platform: "paypal",
    processor_account_id: "merchant-a",
    ledger_type: "chargeback",
    source_event_id: "paypal_dispute:PP-D-SAME:chargeback",
  });
  const second = stableChargebackEventId({
    workspace_id: "default",
    platform: "paypal",
    processor_account_id: "merchant-b",
    ledger_type: "chargeback",
    source_event_id: "paypal_dispute:PP-D-SAME:chargeback",
  });

  assert.notEqual(first, second);
});

test("missing native source event ID receives a deterministic fallback identity", () => {
  const first = stableChargebackEventId({
    workspace_id: "default",
    platform: "paypal",
    processor_account_id: "merchant-a",
    ledger_type: "chargeback",
    source_event_id: null,
    fallback_parts: ["PP-D-NATIVELESS", "PAYPAL-TXN-1", "2026-07-10T00:00:00.000Z", "99.00", "USD"],
  });
  const second = stableChargebackEventId({
    workspace_id: "default",
    platform: "paypal",
    processor_account_id: "merchant-a",
    ledger_type: "chargeback",
    source_event_id: null,
    fallback_parts: ["PP-D-NATIVELESS", "PAYPAL-TXN-1", "2026-07-10T00:00:00.000Z", "99.00", "USD"],
  });

  assert.equal(first, second);
  assert.match(first, /default:paypal:merchant-a:chargeback:fallback:/);
});

test("NMI/PayDiverse parser does not classify ACH returns or refunds as card chargebacks", () => {
  assert.equal(classifyGatewayClassicAction({
    transaction_id: "TXN-ACH",
    order_id: "ORDER-ACH",
    action_type: "return",
    action_date: "20260710120000",
    amount: "10.00",
    requested_amount: null,
    response_text: "ACH return R01 insufficient funds",
    condition: "complete",
    currency: "USD",
    raw: {},
  }), "ach_return");

  assert.equal(classifyGatewayClassicAction({
    transaction_id: "TXN-REFUND",
    order_id: "ORDER-REFUND",
    action_type: "refund",
    action_date: "20260710120000",
    amount: "10.00",
    requested_amount: null,
    response_text: "refund approved",
    condition: "complete",
    currency: "USD",
    raw: {},
  }), "refund");
});

test("unknown NMI action remains a diagnostic and is not inserted", () => {
  const diagnostics = summarizeGatewayClassicActionsForDiagnostics({
    platform: "nmi:lifeheater14090",
    processor_account_id: "nmi:lifeheater14090",
    actions: [{
      transaction_id: "TXN-UNKNOWN",
      order_id: "ORDER-UNKNOWN",
      action_type: "settle",
      action_date: "20260710120000",
      amount: "10.00",
      requested_amount: null,
      response_text: "settlement complete",
      condition: "complete",
      currency: "USD",
      raw: {},
    }],
  });

  assert.equal(diagnostics[0].classification, "unknown");
  assert.equal(diagnostics[0].inserted, false);
  assert.equal(diagnostics[0].reason, "not_a_card_chargeback_mapping");
});

test("NMI refund, sale, and settle actions produce diagnostics only and no ledger inserts", () => {
  const diagnostics = summarizeGatewayClassicActionsForDiagnostics({
    platform: "nmi:echolabsaudio24",
    processor_account_id: "nmi:echolabsaudio24",
    actions: ["refund", "sale", "settle"].map((actionType) => ({
      transaction_id: `TXN-${actionType}`,
      order_id: `ORDER-${actionType}`,
      action_type: actionType,
      action_date: "20260710120000",
      amount: "10.00",
      requested_amount: null,
      response_text: `${actionType} approved`,
      condition: "complete",
      currency: "USD",
      raw: {},
    })),
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.inserted), [false, false, false]);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.classification), ["refund", "unknown", "unknown"]);
});

test("ambiguous generic NMI return remains diagnostic-only", () => {
  const diagnostic = summarizeGatewayClassicActionsForDiagnostics({
    platform: "nmi:lifeheater14090",
    processor_account_id: "nmi:lifeheater14090",
    actions: [{
      transaction_id: "TXN-RETURN",
      order_id: "ORDER-RETURN",
      action_type: "return",
      action_date: "20260710120000",
      amount: "10.00",
      requested_amount: null,
      response_text: "return processed",
      condition: "complete",
      currency: "USD",
      raw: {},
    }],
  })[0];

  assert.equal(diagnostic.classification, "unknown");
  assert.equal(diagnostic.inserted, false);
  assert.equal(diagnostic.reason, "not_a_card_chargeback_mapping");
});

test("NMI empty and unknown action types remain diagnostic-only", () => {
  const diagnostics = summarizeGatewayClassicActionsForDiagnostics({
    platform: "paydiverse",
    processor_account_id: "paydiverse",
    actions: [
      {
        transaction_id: "TXN-EMPTY",
        order_id: "ORDER-EMPTY",
        action_type: "",
        action_date: "20260710120000",
        amount: "10.00",
        requested_amount: null,
        response_text: "",
        condition: "complete",
        currency: "USD",
        raw: {},
      },
      {
        transaction_id: "TXN-UNKNOWN",
        order_id: "ORDER-UNKNOWN",
        action_type: "mystery",
        action_date: "20260710120000",
        amount: "10.00",
        requested_amount: null,
        response_text: "unknown action",
        condition: "complete",
        currency: "USD",
        raw: {},
      },
    ],
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.classification), ["unknown", "unknown"]);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.inserted), [false, false]);
});

test("chargeback migration uses processor-account-aware idempotency and service role RPC", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/035_chargeback_ingestion_v1.sql", import.meta.url), "utf8");

  assert.match(migration, /add column if not exists processor_account_id text/);
  assert.match(migration, /add column if not exists source_event_id text/);
  assert.match(migration, /conversions_chargeback_event_uidx/);
  assert.match(migration, /workspace_id, platform, processor_account_id, ledger_type, source_event_id/);
  assert.match(migration, /create or replace function public\.insert_chargeback_ledger_events/);
  assert.match(migration, /source_event_id'\), ''\) is not null/);
  assert.match(migration, /observed_count bigint/);
  assert.match(migration, /invalid_count bigint/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /grant execute on function public\.insert_chargeback_ledger_events\(jsonb\) to service_role/);
});

test("chargeback runtime route and task type are wired without changing gateway snapshot imports", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

  assert.match(source, /const CHARGEBACK_INGESTION_TASK_TYPE = "chargeback_ingest_account_page"/);
  assert.match(source, /platform\.eq\.paypal,platform\.like\.paypal:%,platform\.like\.nmi:%,platform\.eq\.paydiverse,platform\.like\.paydiverse:%/);
  assert.match(source, /CHARGEBACK_GATEWAY_DEFAULT_MAX_PAGES/);
  assert.match(source, /CHARGEBACK_MAX_DATE_RANGE_DAYS/);
  assert.match(source, /CHARGEBACK_PAYPAL_MAX_PAGES/);
  assert.match(source, /const auth = adminAuthError\(req, env\)/);
  assert.match(source, /function chargebackCredentialWorkspaceId/);
  assert.match(source, /metadata\.workspace_id \?\? metadata\.workspaceId \?\? metadata\.workspace \?\? "default"/);
  assert.match(source, /discoverChargebackProcessorAccounts\(env, args\.workspace_id, args\.platforms\)/);
  assert.match(source, /paypal_dispute_pagination_repeated_cursor/);
  assert.match(source, /PayPal dispute detail failed/);
  assert.match(source, /dedupePaypalDisputeListItems\(pageResult\.disputes\)/);
  assert.match(source, /paypal_dispute_window_empty_after_clamp/);
  const paypalTaskSource = source.slice(
    source.indexOf("async function executePaypalChargebackIngestionTask"),
    source.indexOf("function gatewayClassicActionsFromTransactionXml"),
  );
  const detailBranchSource = paypalTaskSource.slice(paypalTaskSource.indexOf("const pageResult = parsePaypalDisputeListPage"));
  assert.ok(detailBranchSource.indexOf("PayPal dispute detail failed") < detailBranchSource.indexOf("await updateConnectorRuntimeJobProgress(env, job, nextProgress)"));
  assert.ok(paypalTaskSource.indexOf("paypal_dispute_window_empty_after_clamp") < paypalTaskSource.indexOf("fetchPaypalAccessToken"));
  assert.match(source, /executeChargebackIngestionRuntimeTask\(env, job, task\)/);
  assert.match(source, /path === "\/v1\/chargebacks\/backfill"/);
  assert.match(source, /mapping_status: "diagnostic_only_pending_representative_payload_review"/);
  const gatewayTaskSource = source.slice(
    source.indexOf("async function executeGatewayChargebackDiagnosticsTask"),
    source.indexOf("async function executeChargebackIngestionRuntimeTask"),
  );
  assert.doesNotMatch(gatewayTaskSource, /insertChargebackLedgerEvents/);
  assert.match(source, /runGatewayClassicImportPage\(env, \{ platform, from, to, page, pageSize \}\)/);
});

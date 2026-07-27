import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPaypalLedgerEventsFromDispute,
  buildPaypalLedgerEventsFromRecord,
  chunkPaypalRecords,
  classifyPaypalError,
  collectPaypalChunkLookupKeys,
  dedupePaypalPlatformOrderRows,
  extractPaypalCommerceReference,
  extractPaypalEventCode,
  fetchAllPaypalTransactions,
  filterPaypalDuplicateCommerceSaleEvents,
  isPaypalTransientDatabaseError,
  normalizePaypalPaymentTransactionRow,
  normalizePaypalPlatformOrderRow,
  paypalCommerceReferenceEvidence,
  paypalFinancialEventTimestamp,
  paypalBaseUrlForEnvironment,
  paypalBulkLookupQueryPlan,
  paypalReconciliationLookupWarning,
  reconcilePaypalRecordToCommerceOrder,
  reconcilePaypalPaymentTransactionByCommerceReference,
  splitPaypalDateRange,
  stablePaypalConnectorId,
  stablePaypalRecordId,
  summarizeDeferredPaypalPhoneMatching,
} from "./paypal.ts";

const accountId = "MERCHANT-123";
const connectorId = "paypal:merchant-123";

function transactionFixture(overrides: any = {}) {
  const { transaction_info: transactionInfoOverrides, payer_info: payerInfoOverrides, ...rest } = overrides;
  return {
    transaction_info: {
      paypal_account_id: accountId,
      transaction_id: "TXN-1",
      transaction_event_code: "T0006",
      transaction_initiation_date: "2026-07-01T12:00:00Z",
      transaction_updated_date: "2026-07-01T12:05:00Z",
      transaction_status: "S",
      transaction_subject: "PayPal Checkout payment received",
      invoice_id: "INV-1001",
      transaction_amount: { value: "100.00", currency_code: "USD" },
      fee_amount: { value: "-3.20", currency_code: "USD" },
      ...transactionInfoOverrides,
    },
    payer_info: {
      email_address: "buyer@example.com",
      account_id: "PAYER-1",
      ...payerInfoOverrides,
    },
    ...rest,
  };
}

function orderCandidate(overrides: any = {}) {
  return {
    platform: "shopify",
    platform_order_id: "gid://shopify/Order/1001",
    order_id: "INV-1001",
    transaction_id: "SHOPIFY-TXN-1",
    customer_email: "buyer@example.com",
    customer_email_normalized: "buyer@example.com",
    email: "buyer@example.com",
    phone: "+15555550101",
    gross_amount: 100,
    currency: "USD",
    order_ts: "2026-07-01T12:30:00Z",
    ...overrides,
  };
}

test("selects PayPal base URLs by environment", () => {
  assert.equal(paypalBaseUrlForEnvironment("sandbox"), "https://api-m.sandbox.paypal.com");
  assert.equal(paypalBaseUrlForEnvironment("live"), "https://api-m.paypal.com");
  assert.throws(() => paypalBaseUrlForEnvironment("production"), /sandbox or live/);
});

test("classifies OAuth and permission errors", () => {
  assert.deepEqual(
    classifyPaypalError(401, JSON.stringify({ error: "invalid_client" }), { error: "invalid_client" }, "oauth"),
    {
      code: "invalid_paypal_credentials",
      message: "PayPal rejected the client ID, client secret, or environment.",
      capability: "oauth",
    },
  );

  assert.equal(
    classifyPaypalError(403, "scope missing", { message: "scope missing" }, "transaction_reporting").code,
    "missing_reporting_permissions",
  );

  assert.equal(classifyPaypalError(429, "rate", {}, "upstream").code, "paypal_rate_limited");
});

test("splits transaction-search imports into PayPal-compliant windows", () => {
  const windows = splitPaypalDateRange("2026-01-01", "2026-03-15");

  assert.equal(windows.length, 3);
  for (const window of windows) {
    const spanMs = new Date(window.endIso).getTime() - new Date(window.startIso).getTime();
    assert.ok(spanMs <= 31 * 86400000);
  }

  assert.equal(windows[0].startIso, "2026-01-01T00:00:00.000Z");
  assert.equal(windows.at(-1)?.endIso, "2026-03-16T00:00:00.000Z");
});

test("parses transaction pagination deterministically", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const page = new URL(url).searchParams.get("page");
    return new Response(
      JSON.stringify({
        total_pages: 2,
        transaction_details: [
          transactionFixture({
            transaction_info: {
              transaction_id: `TXN-${page}`,
              invoice_id: `INV-${page}`,
            },
          }),
        ],
      }),
      { status: 200 },
    );
  };

  const result = await fetchAllPaypalTransactions({
    baseUrl: "https://api-m.sandbox.paypal.com",
    accessToken: "token",
    windows: splitPaypalDateRange("2026-07-01", "2026-07-01"),
    fetchImpl: fetchImpl as any,
  });

  assert.equal(result.pages, 2);
  assert.equal(result.records.length, 2);
  assert.ok(calls[0].includes("fields=all"));
  assert.ok(calls[0].includes("balance_affecting_records_only=Y"));
  assert.ok(calls[0].includes("page_size=500"));
});

test("builds stable connector IDs without exposing raw client IDs", () => {
  assert.equal(stablePaypalConnectorId({ merchantAccountId: "Merchant 123" }), "paypal:merchant_123");

  const first = stablePaypalConnectorId({ clientId: "RAW-CLIENT-ID-SECRETISH" });
  const second = stablePaypalConnectorId({ clientId: "raw-client-id-secretish" });

  assert.equal(first, second);
  assert.ok(first.startsWith("paypal:client_"));
  assert.ok(!first.includes("raw-client"));
});

test("classifies sales, refunds, explicit processor fees, chargebacks, and reversals", () => {
  const saleEvents = buildPaypalLedgerEventsFromRecord(transactionFixture(), { accountId, connectorId });
  assert.equal(saleEvents.find((event) => event.ledgerType === "sale")?.amount, 100);
  assert.equal(saleEvents.find((event) => event.ledgerType === "processor_fee")?.amount, -3.2);

  const refundEvents = buildPaypalLedgerEventsFromRecord(
    transactionFixture({
      transaction_info: {
        transaction_id: "TXN-R",
        transaction_subject: "Refund issued",
        transaction_amount: { value: "-25.00", currency_code: "USD" },
        fee_amount: undefined,
      },
    }),
    { accountId, connectorId },
  );
  assert.equal(refundEvents[0].ledgerType, "refund");
  assert.equal(refundEvents[0].amount, -25);

  const chargebackEvents = buildPaypalLedgerEventsFromRecord(
    transactionFixture({
      transaction_info: {
        transaction_id: "TXN-CB",
        transaction_subject: "Chargeback dispute lost",
        transaction_amount: { value: "-100.00", currency_code: "USD" },
        fee_amount: { value: "-15.00", currency_code: "USD" },
      },
    }),
    { accountId, connectorId },
  );
  assert.equal(chargebackEvents.find((event) => event.ledgerType === "chargeback")?.amount, -100);
  assert.equal(chargebackEvents.find((event) => event.ledgerType === "chargeback_fee")?.amount, -15);

  const reversalEvents = buildPaypalLedgerEventsFromRecord(
    transactionFixture({
      transaction_info: {
        transaction_id: "TXN-REV",
        transaction_subject: "Reversal recovered funds",
        transaction_amount: { value: "50.00", currency_code: "USD" },
        fee_amount: undefined,
      },
    }),
    { accountId, connectorId },
  );
  assert.equal(reversalEvents[0].ledgerType, "reversal");
  assert.equal(reversalEvents[0].amount, 50);
});

test("uses stable dedupe IDs when PayPal transaction IDs repeat", () => {
  const first = buildPaypalLedgerEventsFromRecord(transactionFixture(), { accountId, connectorId })[0];
  const second = buildPaypalLedgerEventsFromRecord(
    transactionFixture({
      transaction_info: {
        transaction_id: "TXN-1",
        transaction_initiation_date: "2026-07-02T12:00:00Z",
      },
    }),
    { accountId, connectorId },
  )[0];

  assert.notEqual(first.transactionId, second.transactionId);
  assert.ok(first.transactionId.includes("TXN-1".toLowerCase()));
});

test("retains unmatched financial transactions without manufacturing orders", async () => {
  const unmatched = transactionFixture({
    transaction_info: {
      invoice_id: undefined,
      custom_field: undefined,
    },
  });

  const payment = await normalizePaypalPaymentTransactionRow(unmatched, { accountId });
  const platformOrder = await normalizePaypalPlatformOrderRow(unmatched, { accountId });

  assert.equal(payment.order_id, null);
  assert.equal(payment.transaction_id, "TXN-1");
  assert.equal(payment.amount, 100);
  assert.equal(payment.processor_fee, -3.2);
  assert.equal(platformOrder, null);
});

test("normalizes matched records into platform_orders shape", async () => {
  const row = await normalizePaypalPlatformOrderRow(transactionFixture(), { accountId });

  assert.ok(row);
  assert.equal(row.platform, "paypal");
  assert.equal(row.platform_store_id, accountId);
  assert.equal(row.order_id, "INV-1001");
  assert.equal(row.transaction_id, "TXN-1");
  assert.equal(row.customer_email, "buyer@example.com");
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.gross_amount, 100);
  assert.equal(row.currency, "USD");
});

test("deduplicates PayPal capture and fee records sharing one invoice into one platform order", async () => {
  const capture = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-CAPTURE",
      invoice_id: "INV-SHARED",
      transaction_initiation_date: "2026-07-01T12:00:00Z",
      transaction_amount: { value: "100.00", currency_code: "USD" },
      fee_amount: undefined,
    },
  });
  const fee = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-FEE",
      transaction_event_code: "T0000",
      invoice_id: "INV-SHARED",
      transaction_subject: "Processor fee",
      transaction_initiation_date: "2026-07-01T12:05:00Z",
      transaction_amount: { value: "0.00", currency_code: "USD" },
      fee_amount: { value: "-3.20", currency_code: "USD" },
    },
  });

  const result = dedupePaypalPlatformOrderRows(
    await Promise.all([capture, fee].map((record) => normalizePaypalPlatformOrderRow(record, { accountId }))),
    { sourceRecordCount: 2 },
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.generated, 2);
  assert.equal(result.deduplicated, 1);
  assert.equal(result.rows[0].order_id, "INV-SHARED");
  assert.equal(result.rows[0].gross_amount, 100);
  assert.deepEqual(result.rows[0].raw_json.tracekit_paypal_transaction_ids.sort(), ["TXN-CAPTURE", "TXN-FEE"].sort());
});

test("deduplicates PayPal capture and refund sharing one invoice without overwriting sale gross", async () => {
  const capture = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-CAPTURE-REFUND",
      invoice_id: "INV-REFUND",
      transaction_initiation_date: "2026-07-01T12:00:00Z",
      transaction_amount: { value: "100.00", currency_code: "USD" },
      fee_amount: undefined,
    },
  });
  const refund = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-REFUND-SAME-INVOICE",
      transaction_event_code: "T1107",
      invoice_id: "INV-REFUND",
      transaction_subject: "Refund issued",
      transaction_initiation_date: "2026-07-01T13:00:00Z",
      transaction_amount: { value: "-25.00", currency_code: "USD" },
      fee_amount: undefined,
    },
  });

  const result = dedupePaypalPlatformOrderRows(
    await Promise.all([refund, capture].map((record) => normalizePaypalPlatformOrderRow(record, { accountId }))),
    { sourceRecordCount: 2 },
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].gross_amount, 100);
  assert.equal(result.rows[0].order_ts, "2026-07-01T12:00:00Z");
  assert.equal(result.rows[0].status, "REFUNDED");
});

test("duplicate PayPal batch rows produce one canonical platform order key", async () => {
  const first = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-DUP-1",
      invoice_id: "INV-DUP",
    },
  });
  const second = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-DUP-2",
      invoice_id: "INV-DUP",
    },
  });

  const result = dedupePaypalPlatformOrderRows(
    await Promise.all([first, second].map((record) => normalizePaypalPlatformOrderRow(record, { accountId }))),
    { sourceRecordCount: 2 },
  );

  assert.equal(new Set(result.rows.map((row) => row.platform_order_id)).size, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.deduplicated, 1);
});

test("PayPal records without reliable references skip platform_orders but keep payment and ledger rows", async () => {
  const record = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-NO-REFERENCE",
      invoice_id: undefined,
      custom_field: undefined,
    },
  });

  const platformRow = await normalizePaypalPlatformOrderRow(record, { accountId });
  const result = dedupePaypalPlatformOrderRows([platformRow], { sourceRecordCount: 1 });
  const payment = await normalizePaypalPaymentTransactionRow(record, { accountId });
  const events = buildPaypalLedgerEventsFromRecord(record, { accountId, connectorId });

  assert.equal(platformRow, null);
  assert.equal(result.rows.length, 0);
  assert.equal(result.skippedNoReference, 1);
  assert.equal(payment.transaction_id, "TXN-NO-REFERENCE");
  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
});

test("maps PayPal custom_field to canonical commerce_reference", async () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const record = transactionFixture({
    transaction_info: {
      invoice_id: undefined,
      custom_field: commerceReference,
    },
  });

  const payment = await normalizePaypalPaymentTransactionRow(record, { accountId });
  const platformOrder = await normalizePaypalPlatformOrderRow(record, { accountId });
  const evidence = paypalCommerceReferenceEvidence(record);

  assert.equal(extractPaypalCommerceReference(record), commerceReference);
  assert.equal(payment.commerce_reference, commerceReference);
  assert.equal(platformOrder?.commerce_reference, commerceReference);
  assert.equal(evidence.source_type, "transaction_info.custom_field");
  assert.equal(payment.raw_json.tracekit_commerce_reference_evidence.source_type, "transaction_info.custom_field");
});

test("separate PayPal merchant invoices remain separate platform orders", async () => {
  const first = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-INV-A",
      invoice_id: "INV-A",
    },
  });
  const second = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-INV-B",
      invoice_id: "INV-B",
    },
  });

  const result = dedupePaypalPlatformOrderRows(
    await Promise.all([first, second].map((record) => normalizePaypalPlatformOrderRow(record, { accountId }))),
    { sourceRecordCount: 2 },
  );

  assert.equal(result.rows.length, 2);
  assert.equal(result.deduplicated, 0);
  assert.deepEqual(result.rows.map((row) => row.order_id).sort(), ["INV-A", "INV-B"]);
});

test("normalizes explicit dispute fixtures into ledger events", () => {
  const events = buildPaypalLedgerEventsFromDispute(
    {
      dispute_id: "DSP-1",
      status: "RESOLVED_BUYER_FAVOUR",
      disputed_transaction_id: "TXN-1",
      dispute_amount: { value: "-100.00", currency_code: "USD" },
      chargeback_fee: { value: "-15.00", currency_code: "USD" },
      update_time: "2026-07-03T00:00:00Z",
    },
    { accountId, connectorId },
  );

  assert.equal(events.find((event) => event.ledgerType === "chargeback")?.amount, -100);
  assert.equal(events.find((event) => event.ledgerType === "chargeback_fee")?.amount, -15);
});

test("reconciles exact invoice/order references", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture(),
    candidates: [orderCandidate()],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "exact_reference");
  assert.equal(result.match_confidence, 100);
  assert.equal(result.matched_order_id, "INV-1001");
});

test("reconciles exact commerce references before merchant references", () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: "INV-OTHER",
        custom_field: commerceReference,
      },
    }),
    candidates: [
      orderCandidate({
        platform: "wowboost",
        platform_order_id: "wowboost:1001",
        order_id: "WB-1001",
        commerce_reference: commerceReference,
      }),
    ],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "commerce_reference_exact");
  assert.equal(result.match_confidence, 100);
  assert.equal(result.matched_order_id, "WB-1001");
});

test("keeps ambiguous commerce reference matches unmatched", () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
        custom_field: commerceReference,
      },
    }),
    candidates: [
      orderCandidate({ platform_order_id: "wowboost:a", order_id: "A", commerce_reference: commerceReference }),
      orderCandidate({ platform_order_id: "wowboost:b", order_id: "B", commerce_reference: commerceReference }),
    ],
  });

  assert.equal(result.matched, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.match_method, "commerce_reference_exact");
  assert.equal(result.match_candidate_count, 2);
});

test("reconciles unmatched PayPal payment transaction by exact commerce_reference", () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const result = reconcilePaypalPaymentTransactionByCommerceReference({
    payment: {
      id: "payment-1",
      transaction_id: "TXN-REFERENCE",
      commerce_reference: commerceReference.toLowerCase(),
    },
    candidates: [
      orderCandidate({
        platform: "wowboost",
        platform_order_id: "wowboost:2001",
        order_id: "2001",
        commerce_reference: commerceReference,
      }),
    ],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "commerce_reference_exact");
  assert.equal(result.match_confidence, 100);
  assert.equal(result.matched_platform_order_id, "wowboost:2001");
  assert.equal(result.matched_order_id, "2001");
  assert.equal(result.match_candidate_count, 1);
});

test("keeps duplicate WowBoost commerce-reference candidates ambiguous", () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const result = reconcilePaypalPaymentTransactionByCommerceReference({
    payment: {
      id: "payment-ambiguous",
      transaction_id: "TXN-AMBIGUOUS",
      commerce_reference: commerceReference,
    },
    candidates: [
      orderCandidate({ platform_order_id: "wowboost:a", order_id: "A", commerce_reference: commerceReference }),
      orderCandidate({ platform_order_id: "wowboost:b", order_id: "B", commerce_reference: commerceReference }),
    ],
  });

  assert.equal(result.matched, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.match_method, "commerce_reference_exact");
  assert.equal(result.match_confidence, 100);
  assert.equal(result.match_candidate_count, 2);
});

test("reconciles exact PayPal transaction IDs already stored on commerce orders", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
      },
    }),
    candidates: [orderCandidate({ order_id: "ORDER-2", transaction_id: "TXN-1" })],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "paypal_transaction_id");
  assert.equal(result.match_confidence, 95);
  assert.equal(result.matched_order_id, "ORDER-2");
});

test("reconciles normalized email, amount, currency, and time within two hours", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
      },
      payer_info: {
        email_address: " BUYER@EXAMPLE.COM ",
      },
    }),
    candidates: [orderCandidate({ order_id: "ORDER-EMAIL", platform_order_id: "po-email", transaction_id: null })],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "email_amount_currency_2h");
  assert.equal(result.match_confidence, 85);
});

test("does not reconcile email and amount outside twenty four hours", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
      },
    }),
    candidates: [orderCandidate({ order_id: "ORDER-LATE", platform_order_id: "po-late", order_ts: "2026-07-03T13:00:00Z" })],
  });

  assert.equal(result.matched, false);
  assert.equal(result.match_confidence, null);
  assert.equal(result.match_candidate_count, 0);
});

test("keeps repeat-customer candidate matches ambiguous", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
      },
    }),
    candidates: [
      orderCandidate({ order_id: "ORDER-A", platform_order_id: "po-a", transaction_id: null }),
      orderCandidate({ order_id: "ORDER-B", platform_order_id: "po-b", transaction_id: null, order_ts: "2026-07-01T13:00:00Z" }),
    ],
  });

  assert.equal(result.matched, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.match_method, "email_amount_currency_2h");
  assert.equal(result.match_candidate_count, 2);
});

test("leaves ambiguous exact matches unmatched", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture(),
    candidates: [
      orderCandidate({ platform_order_id: "po-a" }),
      orderCandidate({ platform_order_id: "po-b" }),
    ],
  });

  assert.equal(result.matched, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.match_confidence, 100);
  assert.equal(result.match_candidate_count, 2);
});

test("rejects email-only matches", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        invoice_id: undefined,
      },
    }),
    candidates: [orderCandidate({ order_id: "ORDER-WRONG-AMOUNT", platform_order_id: "po-wrong", gross_amount: 999 })],
  });

  assert.equal(result.matched, false);
  assert.equal(result.match_method, null);
  assert.match(result.match_reason, /email or phone alone is insufficient/);
});

test("filters PayPal captures that would duplicate an existing commerce sale", () => {
  const events = buildPaypalLedgerEventsFromRecord(transactionFixture(), {
    accountId,
    connectorId,
    orderId: "INV-1001",
  });
  const filtered = filterPaypalDuplicateCommerceSaleEvents(events, new Set(["INV-1001"]));

  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
  assert.equal(filtered.some((event) => event.ledgerType === "sale"), false);
  assert.equal(filtered.some((event) => event.ledgerType === "processor_fee"), true);
});

test("commerce-reference reconciliation does not create duplicate commerce sales", () => {
  const commerceReference = "66FE31EE-C521-432E-9822-0A07FF85230F";
  const match = reconcilePaypalPaymentTransactionByCommerceReference({
    payment: {
      id: "payment-sale",
      transaction_id: "TXN-SALE-REFERENCE",
      commerce_reference: commerceReference,
    },
    candidates: [
      orderCandidate({
        platform_order_id: "wowboost:3001",
        order_id: "3001",
        commerce_reference: commerceReference,
      }),
    ],
  });
  const events = buildPaypalLedgerEventsFromRecord(transactionFixture(), {
    accountId,
    connectorId,
    orderId: match.matched_order_id,
  });
  const filtered = filterPaypalDuplicateCommerceSaleEvents(events, new Set(["3001"]));

  assert.equal(match.matched, true);
  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
  assert.equal(filtered.some((event) => event.ledgerType === "sale"), false);
});

test("attaches refunds through a parent PayPal transaction", () => {
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture({
      transaction_info: {
        transaction_id: "TXN-REFUND",
        paypal_reference_id: "TXN-1",
        invoice_id: undefined,
        transaction_subject: "Refund issued",
        transaction_amount: { value: "-25.00", currency_code: "USD" },
        fee_amount: undefined,
      },
    }),
    candidates: [],
    linkedPaypalTransactions: [
      {
        transaction_id: "TXN-1",
        matched_platform_order_id: "gid://shopify/Order/1001",
        matched_order_id: "INV-1001",
        match_confidence: 100,
      },
    ],
  });

  assert.equal(result.matched, true);
  assert.equal(result.match_method, "parent_paypal_transaction");
  assert.equal(result.matched_order_id, "INV-1001");
});

test("attaches processor fees to the matched commerce order", () => {
  const events = buildPaypalLedgerEventsFromRecord(transactionFixture(), {
    accountId,
    connectorId,
    orderId: "INV-1001",
  });
  const processorFee = events.find((event) => event.ledgerType === "processor_fee");

  assert.ok(processorFee);
  assert.equal(processorFee.orderId, "INV-1001");
  assert.equal(processorFee.amount, -3.2);
});

test("preserves PayPal initiation/update timestamps and official event code", async () => {
  const payment = await normalizePaypalPaymentTransactionRow(transactionFixture(), { accountId });

  assert.equal(payment.transaction_initiated_at, "2026-07-01T12:00:00Z");
  assert.equal(payment.transaction_updated_at, "2026-07-01T12:05:00Z");
  assert.equal(payment.transaction_event_code, "T0006");
  assert.equal(payment.event_type, "sale");
  assert.equal(extractPaypalEventCode(transactionFixture()), "T0006");
  assert.equal(typeof payment.external_record_id, "string");
  assert.notEqual(payment.external_record_id, payment.event_type);
});

test("uses update timestamp for refund lifecycle ledger chronology", () => {
  const refund = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-TIMESTAMP-REFUND",
      transaction_event_code: "T1107",
      transaction_subject: "Refund issued",
      transaction_initiation_date: "2026-07-01T12:00:00Z",
      transaction_updated_date: "2026-07-03T15:30:00Z",
      transaction_amount: { value: "-25.00", currency_code: "USD" },
      fee_amount: undefined,
    },
  });
  const events = buildPaypalLedgerEventsFromRecord(refund, { accountId, connectorId });
  const refundEvent = events.find((event) => event.ledgerType === "refund");

  assert.equal(paypalFinancialEventTimestamp(refund, "refund"), "2026-07-03T15:30:00Z");
  assert.equal(refundEvent?.occurredAt, "2026-07-03T15:30:00Z");
});

test("plans bulk lookups for 50 PayPal transactions without per-record query growth", () => {
  const records = Array.from({ length: 50 }, (_, i) =>
    transactionFixture({
      transaction_info: {
        transaction_id: `TXN-${i}`,
        invoice_id: `INV-${i}`,
        transaction_initiation_date: `2026-07-01T12:${String(i % 60).padStart(2, "0")}:00Z`,
      },
      payer_info: {
        email_address: `buyer-${i % 5}@example.com`,
        phone_number: { national_number: `555555${String(1000 + i).slice(-4)}` },
      },
    }),
  );

  const keys = collectPaypalChunkLookupKeys(records);
  const plan = paypalBulkLookupQueryPlan(keys, { matchedOrderIds: records.map((_, i) => `INV-${i}`) });

  assert.equal(keys.transactionIds.length, 50);
  assert.equal(keys.commerceReferences.length, 50);
  assert.equal(keys.referenceIds.length, 50);
  assert.equal(keys.emails.length, 5);
  assert.equal(plan.platformOrderReferenceQueries, 3);
  assert.equal(plan.platformOrderTransactionQueries, 1);
  assert.equal(plan.platformOrderEmailQueries, 1);
  assert.equal(plan.platformOrderPhoneQueries, 0);
  assert.equal(plan.phoneMatchingDeferred, 50);
  assert.equal(plan.duplicateSaleQueries, 1);
});

test("phone lookup timeout cannot fail import because phone lookup is not planned", () => {
  const records = Array.from({ length: 12 }, (_, i) =>
    transactionFixture({
      transaction_info: {
        transaction_id: `TXN-PHONE-${i}`,
        invoice_id: undefined,
      },
      payer_info: {
        email_address: undefined,
        phone_number: { national_number: `555555${String(2000 + i).slice(-4)}` },
      },
    }),
  );

  const plan = paypalBulkLookupQueryPlan(collectPaypalChunkLookupKeys(records));

  assert.equal(plan.platformOrderPhoneQueries, 0);
  assert.equal(plan.phoneMatchingDeferred, 12);
});

test("order reference lookup timeout does not fail ingestion primitives", async () => {
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
  const warning = paypalReconciliationLookupWarning("commerce_reference_lookup_deferred", 1);
  const result = reconcilePaypalRecordToCommerceOrder({
    record: transactionFixture(),
    candidates: [],
  });
  const payment = await normalizePaypalPaymentTransactionRow(transactionFixture(), { accountId, match: result });
  const events = buildPaypalLedgerEventsFromRecord(transactionFixture(), { accountId, connectorId });

  assert.equal(isPaypalTransientDatabaseError(timeout), true);
  assert.equal(warning, "commerce_reference_lookup_deferred: 1 records");
  assert.equal(result.matched, false);
  assert.equal(payment.transaction_id, "TXN-1");
  assert.equal(payment.match_status, "unmatched");
  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
});

test("transaction lookup timeout does not fail ingestion primitives", async () => {
  const timeout = new Error("connection terminated during transaction candidate lookup");
  const record = transactionFixture({
    transaction_info: {
      invoice_id: undefined,
    },
  });
  const warning = paypalReconciliationLookupWarning("commerce_transaction_lookup_deferred", 1);
  const result = reconcilePaypalRecordToCommerceOrder({
    record,
    candidates: [],
  });
  const payment = await normalizePaypalPaymentTransactionRow(record, { accountId, match: result });
  const events = buildPaypalLedgerEventsFromRecord(record, { accountId, connectorId });

  assert.equal(isPaypalTransientDatabaseError(timeout), true);
  assert.equal(warning, "commerce_transaction_lookup_deferred: 1 records");
  assert.equal(result.matched, false);
  assert.equal(payment.transaction_id, "TXN-1");
  assert.equal(payment.match_status, "unmatched");
  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
});

test("phone-only records remain unmatched and return deferred warning", async () => {
  const record = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-PHONE-ONLY",
      invoice_id: undefined,
      custom_field: undefined,
    },
    payer_info: {
      email_address: undefined,
      phone_number: { national_number: "5555550101" },
    },
  });

  const result = reconcilePaypalRecordToCommerceOrder({
    record,
    candidates: [],
  });
  const reconciliations = new Map([[stablePaypalRecordId(record, accountId), result]]);
  const summary = summarizeDeferredPaypalPhoneMatching([record], reconciliations, accountId);
  const payment = await normalizePaypalPaymentTransactionRow(record, { accountId, match: result });
  const events = buildPaypalLedgerEventsFromRecord(record, { accountId, connectorId });

  assert.equal(result.matched, false);
  assert.equal(result.match_method, null);
  assert.equal(summary.phone_matching_attempted, 0);
  assert.equal(summary.phone_matching_skipped, 1);
  assert.equal(summary.phone_matching_deferred, 1);
  assert.match(summary.phone_match_warnings[0], /phone_matching_deferred/);
  assert.equal(payment.transaction_id, "TXN-PHONE-ONLY");
  assert.equal(payment.match_status, "unmatched");
  assert.equal(events.some((event) => event.ledgerType === "sale"), true);
});

test("plans parent PayPal transaction matching as one bulk lookup", () => {
  const refunds = Array.from({ length: 50 }, (_, i) =>
    transactionFixture({
      transaction_info: {
        transaction_id: `TXN-REF-${i}`,
        paypal_reference_id: `TXN-SALE-${i}`,
        invoice_id: undefined,
        transaction_subject: "Refund issued",
        transaction_amount: { value: "-10.00", currency_code: "USD" },
        fee_amount: undefined,
      },
    }),
  );

  const keys = collectPaypalChunkLookupKeys(refunds);
  const plan = paypalBulkLookupQueryPlan(keys);

  assert.equal(keys.parentTransactionIds.length, 50);
  assert.equal(plan.paymentTransactionParentQueries, 1);
});

test("chunk boundaries preserve parent refund reconciliation", () => {
  const sale = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-SALE-CHUNK",
      invoice_id: "INV-CHUNK",
    },
  });
  const refund = transactionFixture({
    transaction_info: {
      transaction_id: "TXN-REF-CHUNK",
      paypal_reference_id: "TXN-SALE-CHUNK",
      invoice_id: undefined,
      transaction_subject: "Refund issued",
      transaction_amount: { value: "-10.00", currency_code: "USD" },
      fee_amount: undefined,
    },
  });

  const chunks = chunkPaypalRecords([sale, refund], 1);
  assert.equal(chunks.length, 2);

  const saleMatch = reconcilePaypalRecordToCommerceOrder({
    record: chunks[0][0],
    candidates: [orderCandidate({ order_id: "INV-CHUNK", platform_order_id: "po-chunk" })],
  });
  assert.equal(saleMatch.matched, true);

  const refundMatch = reconcilePaypalRecordToCommerceOrder({
    record: chunks[1][0],
    candidates: [],
    linkedPaypalTransactions: [
      {
        transaction_id: "TXN-SALE-CHUNK",
        matched_platform_order_id: saleMatch.matched_platform_order_id,
        matched_order_id: saleMatch.matched_order_id,
        match_confidence: saleMatch.match_confidence,
      },
    ],
  });

  assert.equal(refundMatch.matched, true);
  assert.equal(refundMatch.match_method, "parent_paypal_transaction");
  assert.equal(refundMatch.matched_order_id, "INV-CHUNK");
});

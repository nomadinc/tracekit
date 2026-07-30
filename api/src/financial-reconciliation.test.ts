import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyFinancialReconciliationDecision,
  FINANCIAL_RECONCILIATION_MATCHES_PATH,
  FINANCIAL_RECONCILIATION_PATH,
  buildFinancialReconciliationReport,
  normalizeFinancialReconciliationDecision,
  normalizeFinancialReconciliationParams,
  redactFinancialReconciliationMessage,
} from "./financial-reconciliation.ts";
import {
  buildFinancialIssueCards,
  buildFinancialWorkQueue,
  deriveFinancialHealth,
  financialImpactRows,
  netFinancialImpact,
  recentFinancialActivity,
} from "../../ui/lib/financial-reconciliation.ts";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const params = normalizeFinancialReconciliationParams({
  workspace_id: "default",
  from: "2026-07-01",
  to: "2026-07-31",
  limit: 100,
}, NOW);

function ledger(overrides: Record<string, any>) {
  return {
    id: overrides.id || `event-${Math.random()}`,
    workspace_id: "default",
    ledger_type: "chargeback",
    platform: "paypal",
    connector_id: "chargeback-ingestion",
    processor_account_id: "paypal:merchant-1",
    transaction_id: "txn-default",
    parent_transaction_id: null,
    order_id: null,
    amount: -25,
    currency: "USD",
    occurred_at: "2026-07-15T12:00:00.000Z",
    source_event_id: overrides.source_event_id || overrides.id || "source-default",
    dispute_id: overrides.dispute_id || "dispute-default",
    diagnostic_flags: [],
    meta: {},
    ...overrides,
  };
}

function order(overrides: Record<string, any>) {
  return {
    workspace_id: "default",
    platform: "wowboost",
    platform_order_id: overrides.platform_order_id || "wowboost:1001",
    order_id: overrides.order_id || "1001",
    transaction_id: overrides.transaction_id || "seller-txn",
    commerce_reference: overrides.commerce_reference || "commerce-ref",
    order_ts: "2026-07-15T10:00:00.000Z",
    gross_amount: 100,
    receipt_total: 100,
    currency: "USD",
    affiliate_id: "affiliate-1",
    source_id: "source-1",
    sub1: null,
    ...overrides,
  };
}

function report(overrides: Partial<Parameters<typeof buildFinancialReconciliationReport>[0]> = {}) {
  return buildFinancialReconciliationReport({
    params,
    ledgerRows: [],
    orderCandidates: [],
    decisions: [],
    decisionsAvailable: true,
    now: NOW,
    ...overrides,
  });
}

test("financial reconciliation route constants are canonical", () => {
  assert.equal(FINANCIAL_RECONCILIATION_PATH, "/v1/financial-reconciliation");
  assert.equal(FINANCIAL_RECONCILIATION_MATCHES_PATH, "/v1/financial-reconciliation/matches");
});

test("deterministic matching prefers seller transaction id and never uses amount/date only", () => {
  const row = ledger({
    id: "event-1",
    transaction_id: "buyer-txn",
    amount: -100,
    occurred_at: "2026-07-20T00:00:00.000Z",
    meta: {
      seller_transaction_id: "seller-txn",
      buyer_transaction_id: "buyer-txn",
    },
  });
  const result = report({
    ledgerRows: [row],
    orderCandidates: [
      order({ platform_order_id: "wowboost:buyer", order_id: "buyer", transaction_id: "buyer-txn" }),
      order({ platform_order_id: "wowboost:seller", order_id: "seller", transaction_id: "seller-txn" }),
      order({ platform_order_id: "wowboost:amount-date", order_id: "amount-date", transaction_id: "unrelated", gross_amount: 100, order_ts: "2026-07-20T00:00:00.000Z" }),
    ],
  });

  assert.equal(result.items[0].suggested_order.method, "seller_transaction_id");
  assert.equal(result.items[0].suggested_order.public_order_label, "wowboost:seller");
  assert.equal(result.items[0].match_status, "unmatched");
});

test("generic ledger transaction_id is not treated as buyer or seller evidence", () => {
  const result = report({
    ledgerRows: [ledger({ id: "event-generic-txn", transaction_id: "generic-processor-ref", meta: {} })],
    orderCandidates: [
      order({ platform_order_id: "wowboost:generic", order_id: "generic", transaction_id: "generic-processor-ref" }),
    ],
  });

  assert.equal(result.items[0].suggested_order.method, null);
  assert.equal(result.items[0].suggested_order.public_order_label, null);
  assert.equal(result.items[0].match_status, "unmatched");
});

test("matching priority supports parent transaction, platform order, commerce reference, and explicit custom order reference", () => {
  const rows = [
    ledger({ id: "parent", transaction_id: "", parent_transaction_id: "parent-txn" }),
    ledger({ id: "payment", transaction_id: "", meta: { payment_transaction_id: "payment-txn" } }),
    ledger({ id: "platform", transaction_id: "", meta: { platform_order_id: "wowboost:2002" } }),
    ledger({ id: "commerce", transaction_id: "", meta: { commerce_reference: "ref-3003" } }),
    ledger({ id: "custom", transaction_id: "", meta: { custom: "ref-4004" } }),
  ];
  const result = report({
    ledgerRows: rows,
    orderCandidates: [
      order({ platform_order_id: "wowboost:parent", order_id: "parent", transaction_id: "parent-txn" }),
      order({ platform_order_id: "wowboost:payment", order_id: "payment", transaction_id: "payment-txn" }),
      order({ platform_order_id: "wowboost:2002", order_id: "2002", transaction_id: "txn-2002" }),
      order({ platform_order_id: "wowboost:3003", order_id: "3003", transaction_id: "txn-3003", commerce_reference: "ref-3003" }),
      order({ platform_order_id: "wowboost:4004", order_id: "4004", transaction_id: "txn-4004", commerce_reference: "ref-4004" }),
    ],
  });

  assert.deepEqual(result.items.map((item) => item.suggested_order.public_order_label), [
    "wowboost:parent",
    "wowboost:payment",
    "wowboost:2002",
    "wowboost:3003",
    "wowboost:4004",
  ]);
  assert.deepEqual(result.items.map((item) => item.suggested_order.method), [
    "parent_transaction_id",
    "payment_transaction_id",
    "platform_order_id",
    "commerce_reference",
    "commerce_reference",
  ]);
});

test("multiple same-workspace deterministic candidates produce conflict without arbitrary suggestion", () => {
  const result = report({
    ledgerRows: [ledger({ id: "event-conflict", meta: { seller_transaction_id: "same-txn" } })],
    orderCandidates: [
      order({ platform_order_id: "wowboost:a", order_id: "a", transaction_id: "same-txn" }),
      order({ platform_order_id: "wowboost:b", order_id: "b", transaction_id: "same-txn" }),
    ],
  });

  assert.equal(result.items[0].match_status, "ambiguous");
  assert.equal(result.items[0].confidence, "conflict");
  assert.equal(result.items[0].suggested_order.candidate_order_id, null);
  assert.equal(result.items[0].suggested_order.conflicts.length, 2);
});

test("reconciliation state precedence honors ignored, manual, removed, automatic, ambiguous, and unmatched", () => {
  const rows = [
    ledger({ id: "ignored", order_id: "auto-order" }),
    ledger({ id: "manual" }),
    ledger({ id: "removed", order_id: "auto-order" }),
    ledger({ id: "automatic", order_id: "auto-order" }),
    ledger({ id: "ambiguous", meta: { seller_transaction_id: "conflict-txn" } }),
    ledger({ id: "unmatched", transaction_id: "" }),
  ];
  const result = report({
    ledgerRows: rows,
    orderCandidates: [
      order({ platform_order_id: "wowboost:manual", order_id: "manual-order", transaction_id: "manual-txn" }),
      order({ platform_order_id: "wowboost:a", order_id: "a", transaction_id: "conflict-txn" }),
      order({ platform_order_id: "wowboost:b", order_id: "b", transaction_id: "conflict-txn" }),
    ],
    decisions: [
      { id: "d1", workspace_id: "default", financial_event_id: "ignored", resulting_state: "ignored", decision_type: "ignore", is_active: true, reason: "duplicate" },
      { id: "d2", workspace_id: "default", financial_event_id: "manual", resulting_state: "manual", decision_type: "confirm_match", matched_platform_order_id: "wowboost:manual", is_active: true },
      { id: "d3", workspace_id: "default", financial_event_id: "removed", resulting_state: "removed", decision_type: "remove_match", is_active: true, reason: "undo" },
    ],
  });

  assert.deepEqual(result.items.map((item) => item.match_status), ["ignored", "manual", "removed", "automatic", "ambiguous", "unmatched"]);
  assert.equal(result.items[2].automatic_match_present, true);
});

test("migration-disabled reads keep diagnostics available and disable manual controls", () => {
  const result = report({
    ledgerRows: [ledger({ id: "event-read-only" })],
    decisionsAvailable: false,
    migrationUnavailableReason: "Migration 036 has not been applied",
  });

  assert.equal(result.capabilities.manual_reconciliation, false);
  assert.equal(result.capabilities.reason, "Migration 036 has not been applied");
  assert.equal(result.items.length, 1);
});

test("double debit diagnostics use same deterministic order, same currency, and seven-day window", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "refund", ledger_type: "refund", amount: -50, order_id: "order-1", occurred_at: "2026-07-10T00:00:00.000Z" }),
      ledger({ id: "chargeback", ledger_type: "chargeback", amount: -50, order_id: "order-1", occurred_at: "2026-07-14T00:00:00.000Z" }),
      ledger({ id: "reversal", ledger_type: "chargeback_reversal", amount: 20, order_id: "order-1", occurred_at: "2026-07-15T00:00:00.000Z" }),
      ledger({ id: "outside", ledger_type: "chargeback", amount: -50, order_id: "order-1", occurred_at: "2026-07-25T00:00:00.000Z" }),
      ledger({ id: "different-currency", ledger_type: "chargeback", amount: -50, order_id: "order-1", currency: "EUR", occurred_at: "2026-07-11T00:00:00.000Z" }),
    ],
  });

  assert.equal(result.diagnostics.double_debit.length, 1);
  assert.equal(result.diagnostics.double_debit[0].status, "partially_recovered");
  assert.deepEqual(result.diagnostics.broken_chains.flatMap((item: any) => item.reasons).filter((reason: string) => reason === "chargeback_reversal_exceeds_original"), []);
  assert.equal(result.summary.double_debit_candidates, 1);
});

test("duplicate diagnostics distinguish stored duplicate evidence and conflicting ledger duplicates", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "stored", source_event_id: "stored-source", diagnostic_flags: ["duplicate_rejected_before_insert"] }),
      ledger({ id: "dup-a", source_event_id: "same-source", amount: -10 }),
      ledger({ id: "dup-b", source_event_id: "same-source", amount: -20 }),
    ],
  });

  assert.equal(result.diagnostics.duplicates.some((item: any) => item.category === "duplicate_rejected_before_ledger_insertion"), true);
  assert.equal(result.diagnostics.duplicates.some((item: any) => item.category === "conflicting_duplicate_evidence"), true);
});

test("broken chains detect fee, reversal, mixed currency, and unmatched refund or chargeback issues", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "fee-only", ledger_type: "chargeback_fee", amount: -15, dispute_id: "chain-1", transaction_id: "" }),
      ledger({ id: "reversal-only", ledger_type: "chargeback_reversal", amount: 20, dispute_id: "chain-2", transaction_id: "" }),
      ledger({ id: "fee-reversal-only", ledger_type: "chargeback_fee_reversal", amount: 5, dispute_id: "chain-3", transaction_id: "" }),
      ledger({ id: "mixed-a", ledger_type: "chargeback", amount: -20, order_id: "order-2", dispute_id: "chain-4", currency: "USD" }),
      ledger({ id: "mixed-b", ledger_type: "chargeback_reversal", amount: 30, order_id: "order-2", dispute_id: "chain-4", currency: "EUR" }),
      ledger({ id: "refund-unmatched", ledger_type: "refund", amount: -5, dispute_id: "chain-5", transaction_id: "" }),
      ledger({ id: "chargeback-unmatched", ledger_type: "chargeback", amount: -5, dispute_id: "chain-6", transaction_id: "" }),
    ],
  });
  const reasons = result.diagnostics.broken_chains.flatMap((item: any) => item.reasons);

  for (const reason of [
    "chargeback_fee_without_chargeback",
    "chargeback_reversal_without_original",
    "chargeback_fee_reversal_without_original_fee",
    "mixed_currency_chain",
    "chargeback_reversal_exceeds_original",
    "refund_without_matching_sale",
    "chargeback_without_matching_sale",
  ]) {
    assert.equal(reasons.includes(reason), true, reason);
  }
});

test("broken chains do not join chargebacks and fees across processor accounts", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "chargeback-account-a", ledger_type: "chargeback", amount: -20, dispute_id: "same-dispute", processor_account_id: "paypal:a", order_id: "order-1" }),
      ledger({ id: "fee-account-b", ledger_type: "chargeback_fee", amount: -5, dispute_id: "same-dispute", processor_account_id: "paypal:b", transaction_id: "" }),
    ],
  });

  const feeOnly = result.diagnostics.broken_chains.find((item: any) => item.chain_key.includes("paypal:b"));
  assert.ok(feeOnly);
  assert.equal(feeOnly.reasons.includes("chargeback_fee_without_chargeback"), true);
});

test("summary marks capped result sets as partial instead of silently capping totals", () => {
  const result = report({
    ledgerRows: [ledger({ id: "event-partial" })],
    partialReason: "Ledger result exceeded 1000 rows; item and summary sections are partial.",
  });

  assert.equal(result.partial, true);
  assert.match(result.partial_reason || "", /summary sections are partial/);
  assert.deepEqual(result.partial_sections, ["summary", "items", "diagnostics", "history", "filters", "pagination"]);
  assert.equal(result.summary.match_rate, null);
  assert.equal(result.summary.match_rate_exact, false);
});

test("decision normalization requires safe target/reason/idempotency fields and allowlists metadata", () => {
  assert.throws(() => normalizeFinancialReconciliationDecision({ financial_event_id: "event-1", decision_type: "ignore" }), /reason is required/);
  assert.throws(() => normalizeFinancialReconciliationDecision({ financial_event_id: "event-1", decision_type: "confirm_match", idempotency_key: "key-target" }), /matched_platform_order_id/);
  assert.throws(() => normalizeFinancialReconciliationDecision({ financial_event_id: "event-1", decision_type: "ignore", reason: "duplicate" }), /idempotency_key is required/);
  assert.throws(() => normalizeFinancialReconciliationDecision({ financial_event_id: "event-1", decision_type: "ignore", reason: "duplicate", idempotency_key: "x".repeat(201) }), /idempotency_key is too long/);
  assert.throws(() => normalizeFinancialReconciliationDecision({ financial_event_id: "event-1", decision_type: "ignore", reason: "bad\nreason", idempotency_key: "key-1" }), /control characters/);

  const decision = normalizeFinancialReconciliationDecision({
    workspace_id: "default",
    financial_event_id: "event-1",
    decision_type: "confirm_match",
    matched_platform_order_id: "wowboost:1001",
    match_method: "seller_transaction_id",
    confidence: "medium",
    idempotency_key: "decision-key-1",
    metadata: {
      ui: "financial_reconciliation_center",
      source: "operator",
      email: "person@example.com",
      access_token: "secret",
      reference: "Bearer abc123",
    },
  });

  assert.equal(decision.resulting_state, undefined);
  assert.equal(decision.match_method, "operator_confirmed");
  assert.equal(decision.confidence, "exact");
  assert.equal(decision.idempotency_key, "decision-key-1");
  assert.equal(decision.metadata.ui, "financial_reconciliation_center");
  assert.equal(decision.metadata.source, "operator");
  assert.equal(decision.metadata.email, undefined);
  assert.equal(decision.metadata.access_token, undefined);
  assert.equal(decision.metadata.reference, undefined);
});

test("apply decision distinguishes missing migration, missing RPC, idempotency conflict, and transient database errors", async () => {
  const baseBody = {
    workspace_id: "default",
    financial_event_id: "event-1",
    decision_type: "ignore",
    reason: "not actionable",
    idempotency_key: "decision-key-2",
  };
  const withError = (error: any) => ({
    rpc: async () => ({ data: null, error }),
  });

  const missingTable = await applyFinancialReconciliationDecision(withError({ code: "42P01", message: 'relation "financial_event_matches" does not exist' }), baseBody);
  assert.equal(missingTable.ok, false);
  assert.equal(missingTable.capabilities.reason_code, "migration_036_missing");

  const missingRpc = await applyFinancialReconciliationDecision(withError({ code: "PGRST202", message: "Could not find the function apply_financial_event_match_decision" }), baseBody);
  assert.equal(missingRpc.ok, false);
  assert.equal(missingRpc.capabilities.reason_code, "reconciliation_rpc_unavailable");

  const conflict = await applyFinancialReconciliationDecision(withError({ code: "P0001", message: "idempotency_key_conflict" }), baseBody);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error, "idempotency_key_conflict");

  await assert.rejects(
    () => applyFinancialReconciliationDecision(withError({ code: "57014", message: "canceling statement due to statement timeout" }), baseBody),
    /canceling statement/
  );
});

test("migration source enforces idempotency, concurrency, immutable history, and metadata safety", () => {
  const migration = readFileSync(`${REPO_ROOT}/supabase/migrations/036_financial_event_matches.sql`, "utf8");

  assert.match(migration, /financial_event_id_type text/);
  assert.match(migration, /join pg_namespace n on n\.oid = c\.relnamespace/);
  assert.match(migration, /where n\.nspname = 'public'/);
  assert.match(migration, /financial_event_id %s not null references public\.conversions\(id\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /for update/);
  assert.match(migration, /request_fingerprint text not null/);
  assert.match(migration, /idempotency_key_conflict/);
  assert.match(migration, /financial_event_matches_immutable_guard/);
  assert.match(migration, /new\.is_active = false/);
  assert.match(migration, /raise exception 'financial_event_matches rows are immutable/);
  assert.match(migration, /workspace_id, idempotency_key/);
  assert.match(migration, /po\.workspace_id = v_workspace_id[\s\S]*v_platform_order_id is null or po\.platform_order_id = v_platform_order_id[\s\S]*v_order_id is null or po\.order_id = v_order_id/);
  assert.match(migration, /revoke all on table public\.financial_event_matches from anon/);
  assert.match(migration, /grant execute on function public\.apply_financial_event_match_decision\(jsonb\) to service_role/);
  assert.match(migration, /jsonb_array_elements/);
  assert.match(migration, /'%authorization%'/);
  assert.match(migration, /'%credential%'/);
  assert.match(migration, /A-Z0-9\._%/);
  assert.doesNotMatch(migration.toLowerCase(), /drop\s+table|truncate|delete\s+from|update\s+public\.conversions/);
});

test("route error redaction suppresses credentials and PII", () => {
  const message = redactFinancialReconciliationMessage("failed https://client:secret@example.com?access_token=abc for person@example.com");
  assert.doesNotMatch(message, /secret|access_token=abc|person@example.com/);
  assert.match(message, /\[redacted\]/);
});

test("financial health derivation handles healthy, no-events, review, critical, and partial states", () => {
  const noEvents = report();
  assert.equal(deriveFinancialHealth(noEvents as any).state, "no_events");

  const noEventsWithDiagnostics = {
    ...noEvents,
    summary: {
      ...noEvents.summary,
      broken_chains: 1,
      needs_review: 1,
    },
    diagnostics: {
      ...noEvents.diagnostics,
      broken_chains: [{ chain_key: "paypal:missing-chain", reasons: ["chargeback_fee_without_chargeback"], events: [] }],
    },
  };
  assert.equal(deriveFinancialHealth(noEventsWithDiagnostics as any).state, "critical");

  const healthy = report({
    ledgerRows: [ledger({ id: "healthy", order_id: "order-1" })],
    orderCandidates: [order({ order_id: "order-1", platform_order_id: "wowboost:order-1", affiliate_id: "affiliate-1", source_id: "source-1" })],
  });
  assert.equal(deriveFinancialHealth(healthy as any).state, "healthy");

  const reviewNeeded = report({
    ledgerRows: [ledger({ id: "missing-attribution", order_id: "order-1" })],
  });
  assert.equal(deriveFinancialHealth(reviewNeeded as any).state, "review_needed");
  assert.equal(reviewNeeded.summary.match_rate, 1);

  const unmatchedOnly = {
    ...noEvents,
    summary: {
      ...noEvents.summary,
      financial_events_reviewed: 1,
      unmatched_events: 1,
      needs_review: 1,
      match_rate: 0,
    },
  };
  assert.equal(deriveFinancialHealth(unmatchedOnly as any).state, "review_needed");

  const critical = report({
    ledgerRows: [ledger({ id: "fee-only", ledger_type: "chargeback_fee", transaction_id: "", dispute_id: "chain-1", amount: -15 })],
  });
  assert.equal(deriveFinancialHealth(critical as any).state, "critical");

  const perfectMatchBrokenChain = {
    ...healthy,
    summary: {
      ...healthy.summary,
      broken_chains: 1,
      needs_review: 1,
    },
    diagnostics: {
      ...healthy.diagnostics,
      broken_chains: [{ chain_key: "paypal:chain", reasons: ["mixed_currency_chain"], events: [{ event_id: "healthy" }] }],
    },
  };
  assert.equal(perfectMatchBrokenChain.summary.match_rate, 1);
  assert.equal(deriveFinancialHealth(perfectMatchBrokenChain as any).state, "critical");

  const partial = report({
    ledgerRows: [ledger({ id: "partial", ledger_type: "chargeback_fee", transaction_id: "", dispute_id: "partial-chain", amount: -15 })],
    partialReason: "Ledger result exceeded 1000 rows.",
  });
  const partialHealth = deriveFinancialHealth(partial as any);
  assert.equal(partialHealth.state, "partial");
  assert.equal(partialHealth.match_health, null);
  assert.equal(partial.summary.match_rate, null);
});

test("financial issue cards and work queue expose narrative review counts and priority", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "fee-only", ledger_type: "chargeback_fee", transaction_id: "", dispute_id: "chain-1", amount: -15 }),
      ledger({ id: "unmatched", transaction_id: "" }),
      ledger({ id: "missing-attribution", order_id: "order-1" }),
    ],
  });

  const cards = buildFinancialIssueCards(result as any);
  assert.equal(cards.some((card) => card.title === "Broken financial chains" && card.count >= 1), true);
  assert.equal(cards.some((card) => card.title === "Missing attribution" && card.count >= 1), true);

  const queue = buildFinancialWorkQueue(result as any);
  assert.equal(queue[0].severity, "Critical");
  assert.equal(queue.some((item) => item.category === "unmatched"), true);
  assert.equal(queue.some((item) => item.category === "missing_attribution"), true);

  const informationalDuplicate = report({
    ledgerRows: [ledger({ id: "stored-duplicate", order_id: "order-1", diagnostic_flags: ["duplicate_rejected_before_insert"] })],
    orderCandidates: [order({ order_id: "order-1", platform_order_id: "wowboost:order-1", affiliate_id: "affiliate-1", source_id: "source-1" })],
  });
  const duplicateCard = buildFinancialIssueCards(informationalDuplicate as any).find((card) => card.category === "duplicate_evidence");
  assert.equal(deriveFinancialHealth(informationalDuplicate as any).state, "review_needed");
  assert.equal(duplicateCard?.severity, "Informational");
  assert.equal(duplicateCard?.count, 1);
  assert.equal(buildFinancialWorkQueue(informationalDuplicate as any, "duplicate_evidence")[0].severity, "Informational");
});

test("financial impact keeps ledger types separate and calculates signed net totals", () => {
  const diagnosticFlagged = report({
    ledgerRows: [
      ledger({ id: "refund", ledger_type: "refund", amount: -20, currency: "USD", diagnostic_flags: ["duplicate_rejected_before_insert"] }),
      ledger({ id: "chargeback", ledger_type: "chargeback", amount: -30, currency: "USD" }),
      ledger({ id: "fee", ledger_type: "chargeback_fee", amount: -5, currency: "USD" }),
      ledger({ id: "reversal", ledger_type: "chargeback_reversal", amount: 4, currency: "USD" }),
      ledger({ id: "fee-reversal", ledger_type: "chargeback_fee_reversal", amount: 1, currency: "USD" }),
    ],
  });
  const rows = financialImpactRows(diagnosticFlagged as any);
  assert.equal(rows.find((row) => row.type === "refund")?.amount, -20);
  assert.deepEqual(rows.map((row) => row.type), ["refund", "chargeback", "chargeback_fee", "chargeback_reversal", "chargeback_fee_reversal"]);
  assert.equal(netFinancialImpact(diagnosticFlagged as any).amount, -50);

  const onlyReversals = report({
    ledgerRows: [
      ledger({ id: "principal-recovery", ledger_type: "chargeback_reversal", amount: 25, currency: "USD" }),
      ledger({ id: "fee-recovery", ledger_type: "chargeback_fee_reversal", amount: 5, currency: "USD" }),
    ],
  });
  assert.equal(netFinancialImpact(onlyReversals as any).amount, 30);

  const debitAndReversal = report({
    ledgerRows: [
      ledger({ id: "chargeback-debit", ledger_type: "chargeback", amount: -100, currency: "USD" }),
      ledger({ id: "chargeback-recovered", ledger_type: "chargeback_reversal", amount: 25, currency: "USD" }),
    ],
  });
  assert.equal(netFinancialImpact(debitAndReversal as any).amount, -75);

  const zeroValue = report({
    ledgerRows: [ledger({ id: "zero", ledger_type: "chargeback_fee", amount: 0, currency: "USD" })],
  });
  assert.equal(financialImpactRows(zeroValue as any).find((row) => row.type === "chargeback_fee")?.count, 1);
  assert.equal(netFinancialImpact(zeroValue as any).amount, 0);

  const missingCurrency = report({
    ledgerRows: [ledger({ id: "missing-currency", ledger_type: "refund", amount: -10, currency: null })],
  });
  assert.equal(netFinancialImpact(missingCurrency as any).amount, -10);
  assert.equal(netFinancialImpact(missingCurrency as any).currency, null);

  const mixed = report({
    ledgerRows: [
      ledger({ id: "usd", ledger_type: "refund", amount: -20, currency: "USD" }),
      ledger({ id: "eur", ledger_type: "chargeback", amount: -30, currency: "EUR" }),
    ],
  });
  assert.equal(netFinancialImpact(mixed as any).mixed_currency, true);
  assert.equal(netFinancialImpact(mixed as any).label, "Multiple currencies");
});

test("recent financial activity uses honest lifecycle labels without inventing state", () => {
  const result = report({
    ledgerRows: [
      ledger({ id: "auto", order_id: "order-1", occurred_at: "2026-07-15T12:00:00.000Z" }),
      ledger({ id: "manual", occurred_at: "2026-07-16T12:00:00.000Z" }),
      ledger({ id: "ignored", occurred_at: "2026-07-17T12:00:00.000Z" }),
      ledger({ id: "removed", order_id: "order-2", occurred_at: "2026-07-18T12:00:00.000Z" }),
    ],
    orderCandidates: [
      order({ order_id: "order-1", platform_order_id: "wowboost:order-1", affiliate_id: "affiliate-1", source_id: "source-1" }),
      order({ order_id: "order-2", platform_order_id: "wowboost:order-2", affiliate_id: "affiliate-1", source_id: "source-1" }),
    ],
    decisions: [
      { id: "d-manual", workspace_id: "default", financial_event_id: "manual", resulting_state: "manual", decision_type: "confirm_match", matched_platform_order_id: "wowboost:order-1", is_active: true },
      { id: "d-ignored", workspace_id: "default", financial_event_id: "ignored", resulting_state: "ignored", decision_type: "ignore", is_active: true, reason: "operator chose to ignore" },
      { id: "d-removed", workspace_id: "default", financial_event_id: "removed", resulting_state: "removed", decision_type: "remove_match", is_active: true, reason: "undo" },
    ],
  });

  const activity = recentFinancialActivity(result as any, 4);
  assert.deepEqual(activity.map((item) => item.event_id), ["removed", "ignored", "manual", "auto"]);
  assert.match(activity.find((item) => item.event_id === "manual")?.detail || "", /Manually reconciled/);
  assert.match(activity.find((item) => item.event_id === "ignored")?.detail || "", /Ignored by an operator/);
  assert.match(activity.find((item) => item.event_id === "removed")?.detail || "", /Manual match removed/);
  assert.match(activity.find((item) => item.event_id === "auto")?.detail || "", /Automatically reconciled/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  FINANCIAL_IMPORT_MONITOR_PATH,
  FINANCIAL_IMPORT_MONITOR_MAX_RANGE_DAYS,
  buildFinancialImportMonitorReport,
  normalizeFinancialImportMonitorParams,
  redactFinancialImportMonitorMessage,
} from "./financial-import-monitor.ts";
import {
  buildFinancialImportIssueCards,
  deriveFinancialImportHealth,
  recentFinancialImportActivity,
} from "../../ui/lib/financial-import-monitor.ts";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const params = normalizeFinancialImportMonitorParams({
  workspace_id: "default",
  from: "2026-07-01",
  to: "2026-07-31",
}, NOW);

function job(overrides: Record<string, any>) {
  return {
    id: overrides.id || crypto.randomUUID(),
    workspace_id: "default",
    platform: overrides.platform || "paypal",
    connector_id: overrides.connector_id || "chargeback-ingestion",
    job_type: overrides.job_type || "chargeback_backfill",
    phase: overrides.phase || "ingest_account_page",
    status: overrides.status || "completed",
    updated_at: overrides.updated_at || "2026-07-29T10:00:00.000Z",
    completed_at: overrides.completed_at ?? (overrides.status === "completed" ? "2026-07-29T10:00:00.000Z" : null),
    last_error: overrides.last_error || null,
    progress: overrides.progress || {
      workspace_id: "default",
      connector_id: "chargeback-ingestion",
      status: overrides.status || "completed",
      accounts: {
        "paypal:merchant-1": {
          account_key: "paypal:merchant-1",
          platform: "paypal",
          processor_account_id: "merchant-1",
          records_fetched: 3,
          events_inserted: 2,
          duplicates_skipped: 1,
          matched: 2,
        },
      },
      metadata: {
        accounts: [{ account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" }],
      },
    },
    ...overrides,
  };
}

function task(overrides: Record<string, any>) {
  return {
    id: overrides.id || crypto.randomUUID(),
    job_id: overrides.job_id,
    workspace_id: "default",
    connector_id: "chargeback-ingestion",
    task_type: "chargeback_ingest_account_page",
    phase: "ingest_account_page",
    status: "running",
    cursor: "paypal:merchant-1:1",
    page: 1,
    attempt_count: 1,
    max_attempts: 5,
    locked_at: "2026-07-29T11:59:30.000Z",
    updated_at: "2026-07-29T11:59:30.000Z",
    payload: { account: { account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" } },
    ...overrides,
  };
}

function report(overrides: Partial<Parameters<typeof buildFinancialImportMonitorReport>[0]> = {}) {
  return buildFinancialImportMonitorReport({
    params,
    credentials: [],
    jobs: [],
    tasks: [],
    ledgerRows: [],
    errors: [],
    now: NOW,
    ...overrides,
  });
}

test("financial import monitor route constant is the canonical API path", () => {
  assert.equal(FINANCIAL_IMPORT_MONITOR_PATH, "/v1/financial-import-monitor");
});

test("configured account with no history shows Never run without exposing credential secrets", () => {
  const result = report({
    credentials: [{
      platform: "paypal",
      username: "client-id-should-not-appear",
      password_encrypted: "secret-should-not-appear",
      metadata: { workspace_id: "default", merchant_account_id: "merchant-1" },
    }],
  });

  assert.equal(result.accounts[0].status, "Never run");
  assert.equal(JSON.stringify(result), JSON.stringify(result).replace(/secret-should-not-appear|client-id-should-not-appear/g, ""));
});

test("financial import health presentation derives no-connectors healthy running review critical and partial states", () => {
  const none = report();
  assert.equal(deriveFinancialImportHealth(none as any).state, "No imports configured");

  const healthy = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-healthy", updated_at: "2026-07-29T11:00:00.000Z", completed_at: "2026-07-29T11:00:00.000Z" })],
  });
  assert.equal(deriveFinancialImportHealth(healthy as any).state, "Healthy");
  assert.equal(deriveFinancialImportHealth(healthy as any).last_successful_import, "2026-07-29T11:00:00.000Z");

  const oldSuccess = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-old", updated_at: "2026-07-20T00:00:00.000Z", completed_at: "2026-07-20T00:00:00.000Z" })],
  });
  assert.equal(oldSuccess.accounts[0].status, "Waiting");
  assert.equal(deriveFinancialImportHealth(oldSuccess as any).state, "Review needed");

  const running = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-running", status: "running", completed_at: null, updated_at: "2026-07-29T11:00:00.000Z" })],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:59:30.000Z" })],
  });
  assert.equal(deriveFinancialImportHealth(running as any).state, "Imports running");

  const neverRun = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
  });
  assert.equal(deriveFinancialImportHealth(neverRun as any).state, "Review needed");

  const failed = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-failed", status: "failed", completed_at: null, last_error: "Queue send failed: Too Many Requests" })],
  });
  assert.equal(deriveFinancialImportHealth(failed as any).state, "Critical");

  const partial = { ...failed, partial: true };
  assert.equal(deriveFinancialImportHealth(partial as any).state, "Partial data");
});

test("diagnostic-only NMI account remains diagnostic and inserts no financial events", () => {
  const result = report({
    credentials: [{ platform: "nmi:lifeheater14090", metadata: { workspace_id: "default" } }],
    jobs: [job({
      id: "job-nmi",
      progress: {
        accounts: {
          "nmi:lifeheater14090": {
            account_key: "nmi:lifeheater14090",
            platform: "nmi:lifeheater14090",
            family: "gateway_classic",
            processor_account_id: "nmi:lifeheater14090",
            records_fetched: 10,
            events_inserted: 0,
          },
        },
        metadata: { accounts: [{ account_key: "nmi:lifeheater14090", platform: "nmi:lifeheater14090", family: "gateway_classic" }] },
      },
    })],
  });

  assert.equal(result.accounts[0].status, "Diagnostic only");
  assert.equal(result.accounts[0].ingestion_mode, "diagnostic_only");
  assert.equal(result.accounts[0].inserted_events, 0);
  assert.equal(result.accounts[0].diagnostics[0].type, "diagnostic_only");
  assert.equal(deriveFinancialImportHealth(result as any).state, "Healthy");
  const cards = buildFinancialImportIssueCards(result as any);
  assert.equal(cards.find((card) => card.category === "diagnostic_only")?.severity, "Info");
  assert.equal(cards.some((card) => card.category === "failed_imports"), false);
});

test("diagnostic-only import errors are separate from intentional diagnostic-only mode", () => {
  const result = report({
    credentials: [{ platform: "nmi:tpaul9204", metadata: { workspace_id: "default" } }],
    jobs: [job({
      id: "job-failed-nmi",
      status: "failed",
      platform: "nmi:tpaul9204",
      connector_id: "chargeback-ingestion",
      last_error: "processor failed",
      progress: {
        accounts: {
          "nmi:tpaul9204": { account_key: "nmi:tpaul9204", platform: "nmi:tpaul9204", family: "gateway_classic" },
        },
        metadata: { accounts: [{ account_key: "nmi:tpaul9204", platform: "nmi:tpaul9204", family: "gateway_classic" }] },
      },
    })],
  });

  assert.equal(result.accounts[0].status, "Diagnostic only");
  assert.equal(deriveFinancialImportHealth(result as any).state, "Critical");
  const cards = Object.fromEntries(buildFinancialImportIssueCards(result as any).map((card) => [card.category, card]));
  assert.equal(cards.diagnostic_only.severity, "Info");
  assert.equal(cards.failed_imports.severity, "Critical");
  assert.equal(cards.failed_imports.account_keys[0], "nmi:tpaul9204");
});

test("active task shows Running and stale task shows Attention", () => {
  const runningJob = job({ id: "job-running", status: "running", completed_at: null });
  const active = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:59:30.000Z", locked_at: "2026-07-29T11:59:30.000Z" })],
  });
  assert.equal(active.accounts[0].status, "Running");

  const stale = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:50:00.000Z", locked_at: "2026-07-29T11:50:00.000Z" })],
  });
  assert.equal(stale.accounts[0].status, "Attention");
  assert.equal(stale.accounts[0].current_task?.stale, true);
});

test("most recent failed job shows Failed while later successful job supersedes failure", () => {
  const failed = job({ id: "job-failed", status: "failed", updated_at: "2026-07-29T10:00:00.000Z", completed_at: null, last_error: "Queue send failed: Too Many Requests" });
  const first = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [failed],
  });
  assert.equal(first.accounts[0].status, "Failed");

  const laterSuccess = job({ id: "job-success", status: "completed", updated_at: "2026-07-29T11:00:00.000Z", completed_at: "2026-07-29T11:00:00.000Z" });
  const second = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [failed, laterSuccess],
  });
  assert.equal(second.accounts[0].status, "Healthy");
});

test("unmatched events and missing affiliate attribution show Attention without dropping totals", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-1" })],
    ledgerRows: [
      {
        workspace_id: "default",
        platform: "paypal",
        connector_id: "chargeback-ingestion",
        processor_account_id: "merchant-1",
        ledger_type: "chargeback",
        amount: "-25.00",
        occurred_at: "2026-07-21T12:00:00.000Z",
        order_id: null,
        diagnostic_flags: ["chargeback_without_matching_sale"],
        meta: {},
      },
    ],
  });

  assert.equal(result.accounts[0].status, "Attention");
  assert.equal(result.accounts[0].unmatched, 1);
  assert.equal(result.accounts[0].missing_affiliate_attribution, 1);
  assert.equal(result.accounts[0].financial_event_totals.chargeback.event_count, 1);
  assert.equal(result.summary.unmatched_financial_events, 1);
});

test("disabled connector shows Disabled", () => {
  const result = report({
    credentials: [{ platform: "shopify", metadata: { workspace_id: "default", shop_domain: "store.myshopify.com", enabled: false } }],
  });
  assert.equal(result.accounts[0].status, "Disabled");
});

test("refund and chargeback event amounts remain separate from fees and reversals", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-1" })],
    ledgerRows: [
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "refund", amount: "-10.00", order_id: "o-1", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback", amount: "-20.00", order_id: "o-2", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback_fee", amount: "-5.00", order_id: "o-2", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback_reversal", amount: "20.00", order_id: "o-2", occurred_at: "2026-07-11T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback_fee_reversal", amount: "5.00", order_id: "o-2", occurred_at: "2026-07-11T00:00:00.000Z", meta: { affiliate_id: "a1" } },
    ],
  });
  const totals = result.accounts[0].financial_event_totals;
  assert.equal(totals.refund.amount, -10);
  assert.equal(totals.chargeback.amount, -20);
  assert.equal(totals.chargeback_fee.amount, -5);
  assert.equal(totals.chargeback_reversal.amount, 20);
  assert.equal(totals.chargeback_fee_reversal.amount, 5);
});

test("workspace isolation excludes credentials from other workspaces", () => {
  const result = report({
    credentials: [
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } },
      { platform: "paypal:other", metadata: { workspace_id: "other", merchant_account_id: "merchant-2" } },
    ],
  });
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].account, "merchant-1");
});

test("filters can limit status, connector, mode, and attention-only views", () => {
  const base = {
    credentials: [
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } },
      { platform: "nmi:tpaul9204", metadata: { workspace_id: "default" } },
    ],
    jobs: [job({ id: "job-1" })],
  };
  assert.equal(buildFinancialImportMonitorReport({ ...base, params: { ...params, platform: "paypal", status: null, ingestion_mode: null, processor_account: null, attention_only: false }, now: NOW }).accounts.length, 1);
  assert.equal(buildFinancialImportMonitorReport({ ...base, params: { ...params, platform: null, status: null, ingestion_mode: "diagnostic_only", processor_account: null, attention_only: false }, now: NOW }).accounts.length, 1);
  assert.equal(buildFinancialImportMonitorReport({ ...base, params: { ...params, platform: null, status: null, ingestion_mode: null, processor_account: null, attention_only: true }, now: NOW }).accounts.length, 0);
});

test("financial import issue cards summarize actionable and intentional import states", () => {
  const failedJob = job({ id: "job-failed", status: "failed", completed_at: null, last_error: "processor auth failed" });
  const runningJob = job({ id: "job-running", status: "running", completed_at: null });
  const result = report({
    credentials: [
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "never-run" } },
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "failed" } },
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "stale" } },
      { platform: "nmi:tpaul9204", metadata: { workspace_id: "default" } },
    ],
    jobs: [
      job({
        ...failedJob,
        progress: {
          accounts: {
            "paypal:failed": { account_key: "paypal:failed", platform: "paypal", processor_account_id: "failed" },
          },
          metadata: { accounts: [{ account_key: "paypal:failed", platform: "paypal", processor_account_id: "failed" }] },
        },
      }),
      job({
        ...runningJob,
        id: "job-stale",
        progress: {
          accounts: {
            "paypal:stale": { account_key: "paypal:stale", platform: "paypal", processor_account_id: "stale" },
          },
          metadata: { accounts: [{ account_key: "paypal:stale", platform: "paypal", processor_account_id: "stale" }] },
        },
      }),
    ],
    tasks: [task({ job_id: "job-stale", payload: { account: { account_key: "paypal:stale", platform: "paypal", processor_account_id: "stale" } }, updated_at: "2026-07-29T11:58:00.000Z", locked_at: "2026-07-29T11:58:00.000Z", attempt_count: 3 })],
    ledgerRows: [{
      workspace_id: "default",
      platform: "paypal",
      processor_account_id: "failed",
      ledger_type: "chargeback",
      amount: "-25",
      occurred_at: "2026-07-21T12:00:00.000Z",
      order_id: null,
      diagnostic_flags: ["invalid_source_record"],
      meta: {},
    }],
  });

  const cards = buildFinancialImportIssueCards(result as any);
  const byCategory = Object.fromEntries(cards.map((card) => [card.category, card]));
  assert.equal(byCategory.failed_imports.count, 1);
  assert.equal(byCategory.stale_tasks.count, 1);
  assert.equal(byCategory.never_run.count, 1);
  assert.equal(byCategory.diagnostic_only.severity, "Info");
  assert.equal(byCategory.invalid_records.count >= 1, true);
  assert.equal(byCategory.repeated_failures.count, 1);
  assert.equal(byCategory.diagnostic_only.account_keys.includes("nmi:tpaul9204"), true);
});

test("account detail includes bounded recent job history", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: Array.from({ length: 25 }, (_, index) => job({
      id: `job-${index}`,
      updated_at: `2026-07-29T10:${String(index).padStart(2, "0")}:00.000Z`,
    })),
  });
  assert.equal(result.accounts[0].recent_jobs.length, 20);
});

test("recent financial import activity is bounded and uses not-reported metrics when counters are unavailable", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({
      id: "job-running",
      status: "running",
      completed_at: null,
      progress: {
        accounts: {
          "paypal:merchant-1": { account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" },
        },
        metadata: { accounts: [{ account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" }] },
      },
    })],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:59:30.000Z" })],
  });

  const activity = recentFinancialImportActivity(result as any, 5);
  assert.equal(activity.length >= 1, true);
  assert.equal(activity[0].account_key, "paypal:merchant-1");
  assert.equal(activity.some((row) => row.metrics.some((metric) => metric.value === "Not reported")), true);
  assert.equal(recentFinancialImportActivity(result as any, 1).length, 1);
});

test("workspace scoping excludes other workspace jobs tasks ledger and filtered accounts", () => {
  const scopedParams = { ...params, processor_account: "merchant-shared" };
  const result = buildFinancialImportMonitorReport({
    params: scopedParams,
    now: NOW,
    credentials: [
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-shared" } },
      { platform: "paypal", metadata: { workspace_id: "other", merchant_account_id: "merchant-shared" } },
    ],
    jobs: [job({
      id: "job-other",
      workspace_id: "other",
      progress: {
        workspace_id: "other",
        accounts: {
          "paypal:merchant-shared": { account_key: "paypal:merchant-shared", platform: "paypal", processor_account_id: "merchant-shared", events_inserted: 99 },
        },
        metadata: { accounts: [{ account_key: "paypal:merchant-shared", platform: "paypal", processor_account_id: "merchant-shared" }] },
      },
    })],
    tasks: [task({ id: "task-other", job_id: "job-other", workspace_id: "other" })],
    ledgerRows: [{
      workspace_id: "other",
      platform: "paypal",
      processor_account_id: "merchant-shared",
      ledger_type: "chargeback",
      amount: "-99",
      currency: "USD",
      order_id: "other-order",
      source_event_id: "other-event",
      occurred_at: "2026-07-10T00:00:00.000Z",
      meta: { affiliate_id: "other" },
    }],
    errors: [{ job_id: "job-other", connector_id: "paypal:merchant-shared", created_at: "2026-07-29T10:00:00.000Z" }],
  });

  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].account_key, "paypal:merchant-shared");
  assert.equal(result.accounts[0].status, "Never run");
  assert.equal(result.accounts[0].inserted_events, null);
  assert.equal(result.accounts[0].current_task, null);
  assert.equal(result.accounts[0].financial_event_totals.chargeback.event_count, 0);
  assert.equal(result.accounts[0].errors, 0);
});

test("one account represented by credentials jobs tasks and ledger produces one row", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-one" })],
    tasks: [task({ job_id: "job-one" })],
    ledgerRows: [{
      workspace_id: "default",
      platform: "paypal",
      processor_account_id: "merchant-1",
      ledger_type: "chargeback",
      amount: "-25",
      currency: "USD",
      order_id: "order-1",
      source_event_id: "dispute-1",
      occurred_at: "2026-07-10T00:00:00.000Z",
      meta: { affiliate_id: "affiliate-1" },
    }],
  });

  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].account_key, "paypal:merchant-1");
  assert.equal(result.accounts[0].financial_event_totals.chargeback.event_count, 1);
});

test("two PayPal merchant accounts remain separate even when platform matches", () => {
  const result = report({
    credentials: [
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } },
      { platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-2" } },
    ],
    jobs: [
      job({ id: "job-1" }),
      job({
        id: "job-2",
        progress: {
          accounts: {
            "paypal:merchant-2": { account_key: "paypal:merchant-2", platform: "paypal", processor_account_id: "merchant-2", events_inserted: 1 },
          },
          metadata: { accounts: [{ account_key: "paypal:merchant-2", platform: "paypal", processor_account_id: "merchant-2" }] },
        },
      }),
    ],
    ledgerRows: [
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback", amount: "-10", currency: "USD", order_id: "o1", source_event_id: "e1", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-2", ledger_type: "chargeback", amount: "-20", currency: "USD", order_id: "o2", source_event_id: "e2", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a2" } },
    ],
  });

  const byKey = Object.fromEntries(result.accounts.map((account) => [account.account_key, account]));
  assert.equal(result.accounts.length, 2);
  assert.equal(byKey["paypal:merchant-1"].financial_event_totals.chargeback.amount, -10);
  assert.equal(byKey["paypal:merchant-2"].financial_event_totals.chargeback.amount, -20);
});

test("legacy ledger rows without processor account stay separate from saved merchant accounts", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    ledgerRows: [{
      workspace_id: "default",
      platform: "paypal",
      ledger_type: "chargeback",
      amount: "-30",
      currency: "USD",
      order_id: "legacy-order",
      transaction_id: "legacy-transaction",
      occurred_at: "2026-07-10T00:00:00.000Z",
      meta: { affiliate_id: "legacy" },
    }],
  });

  const merchant = result.accounts.find((account) => account.account_key === "paypal:merchant-1");
  const legacy = result.accounts.find((account) => account.account_key === "paypal:paypal");
  assert.ok(merchant);
  assert.ok(legacy);
  assert.equal(merchant.financial_event_totals.chargeback.event_count, 0);
  assert.equal(legacy.financial_event_totals.chargeback.event_count, 1);
});

test("status precedence keeps disabled and diagnostic-only states explicit", () => {
  const disabled = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1", enabled: false } }],
    jobs: [job({ id: "job-running", status: "running", completed_at: null })],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:59:00.000Z" })],
  });
  assert.equal(disabled.accounts[0].status, "Disabled");

  const diagnostic = report({
    credentials: [{ platform: "nmi:tpaul9204", metadata: { workspace_id: "default" } }],
    jobs: [job({
      id: "job-failed-nmi",
      status: "failed",
      platform: "nmi:tpaul9204",
      connector_id: "chargeback-ingestion",
      last_error: "processor failed",
      progress: {
        accounts: {
          "nmi:tpaul9204": { account_key: "nmi:tpaul9204", platform: "nmi:tpaul9204", family: "gateway_classic" },
        },
        metadata: { accounts: [{ account_key: "nmi:tpaul9204", platform: "nmi:tpaul9204", family: "gateway_classic" }] },
      },
    })],
  });
  assert.equal(diagnostic.accounts[0].status, "Diagnostic only");
  assert.equal(diagnostic.accounts[0].diagnostics.some((item) => item.type === "import_errors"), true);
});

test("running task takes precedence over prior failure while retaining diagnostics", () => {
  const failed = job({ id: "job-failed", status: "failed", updated_at: "2026-07-29T10:00:00.000Z", completed_at: null, last_error: "Queue send failed: Too Many Requests" });
  const running = job({ id: "job-running", status: "running", updated_at: "2026-07-29T11:00:00.000Z", completed_at: null });
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [failed, running],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:59:30.000Z" })],
  });
  assert.equal(result.accounts[0].status, "Running");
  assert.equal(result.accounts[0].diagnostics.some((item) => item.type === "import_errors"), true);
  assert.equal(deriveFinancialImportHealth(result as any).state, "Imports running");
  assert.equal(deriveFinancialImportHealth(result as any).running_imports, 1);
});

test("old success and generic non-financial jobs do not remain Healthy indefinitely", () => {
  const oldSuccess = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({ id: "job-old", updated_at: "2026-07-20T00:00:00.000Z", completed_at: "2026-07-20T00:00:00.000Z" })],
  });
  assert.equal(oldSuccess.accounts[0].status, "Waiting");
  assert.equal(deriveFinancialImportHealth(oldSuccess as any).state, "Review needed");
  assert.equal(buildFinancialImportIssueCards(oldSuccess as any).find((card) => card.category === "stale_import_evidence")?.count, 1);

  const generic = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({
      id: "job-orders",
      connector_id: "order-importer",
      job_type: "order_import",
      phase: "orders",
      progress: {
        accounts: {
          "paypal:merchant-1": { account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" },
        },
        metadata: { accounts: [{ account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" }] },
      },
    })],
  });
  assert.equal(generic.accounts[0].status, "Never run");
  assert.equal(generic.accounts[0].imported_events, null);
});

test("stale task detection respects heartbeat and ignores queued completed or barely active tasks", () => {
  const runningJob = job({ id: "job-running", status: "running", completed_at: null });
  const barelyActive = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:58:01.000Z", locked_at: "2026-07-29T11:58:01.000Z" })],
  });
  assert.equal(barelyActive.accounts[0].current_task?.stale, false);

  const heartbeatActive = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:50:00.000Z", locked_at: "2026-07-29T11:50:00.000Z", result_summary: { heartbeat_at: "2026-07-29T11:59:00.000Z" } })],
  });
  assert.equal(heartbeatActive.accounts[0].current_task?.stale, false);

  const stale = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", updated_at: "2026-07-29T11:58:00.000Z", locked_at: "2026-07-29T11:58:00.000Z" })],
  });
  assert.equal(stale.accounts[0].current_task?.stale, true);

  const queued = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [runningJob],
    tasks: [task({ job_id: "job-running", status: "queued", updated_at: "2026-07-29T11:00:00.000Z", locked_at: null })],
  });
  assert.equal(queued.accounts[0].current_task?.stale, false);
});

test("unavailable metrics remain null while reported zero remains zero", () => {
  const unavailable = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
  });
  assert.equal(unavailable.accounts[0].inserted_events, null);

  const reportedZero = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    jobs: [job({
      id: "job-zero",
      progress: {
        accounts: {
          "paypal:merchant-1": { account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1", events_inserted: 0 },
        },
        metadata: { accounts: [{ account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" }] },
      },
    })],
  });
  assert.equal(reportedZero.accounts[0].inserted_events, 0);
});

test("mixed currencies are marked instead of being labeled as USD", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    ledgerRows: [
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "refund", amount: "-10", currency: "USD", order_id: "o1", source_event_id: "e1", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "refund", amount: "-20", currency: "EUR", order_id: "o2", source_event_id: "e2", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a2" } },
    ],
  });
  assert.equal(result.accounts[0].financial_event_totals.refund.amount, -30);
  assert.equal(result.accounts[0].financial_event_totals.refund.currency, null);
  assert.equal(result.accounts[0].financial_event_totals.refund.mixed_currency, true);
});

test("duplicate source events are not double-counted in financial totals", () => {
  const result = report({
    credentials: [{ platform: "paypal", metadata: { workspace_id: "default", merchant_account_id: "merchant-1" } }],
    ledgerRows: [
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback", amount: "-10", currency: "USD", order_id: "o1", source_event_id: "dup", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
      { workspace_id: "default", platform: "paypal", processor_account_id: "merchant-1", ledger_type: "chargeback", amount: "-10", currency: "USD", order_id: "o1", source_event_id: "dup", occurred_at: "2026-07-10T00:00:00.000Z", meta: { affiliate_id: "a1" } },
    ],
  });
  assert.equal(result.accounts[0].financial_event_totals.chargeback.event_count, 1);
  assert.equal(result.accounts[0].diagnostics.some((item) => item.type === "duplicate_source_event"), true);
});

test("recursive response redaction removes secrets PII cards and tokenized cursors", () => {
  const result = report({
    credentials: [{
      platform: "paypal",
      metadata: {
        workspace_id: "default",
        merchant_account_id: "merchant-1",
        access_token: "credential-token-should-not-appear",
      },
    }],
    jobs: [job({
      id: "job-secret",
      last_error: "Bearer secret-bearer-token for buyer@example.com card 4111111111111111 https://user:pass@example.test/path?access_token=secret-query",
      progress: {
        current_cursor: "https://api-m.paypal.com/v1/customer/disputes?access_token=cursor-secret",
        accounts: {
          "paypal:merchant-1": { account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1", events_inserted: 1 },
        },
        metadata: { accounts: [{ account_key: "paypal:merchant-1", platform: "paypal", processor_account_id: "merchant-1" }] },
      },
    })],
    tasks: [task({ job_id: "job-secret", last_error: "{\"api_key\":\"task-secret\"} customer phone +1 555 222 3333" })],
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-bearer-token|buyer@example\.com|4111111111111111|secret-query|cursor-secret|task-secret|credential-token-should-not-appear|555 222 3333/);
  assert.match(serialized, /\[redacted/);
  assert.doesNotMatch(redactFinancialImportMonitorMessage("client_secret=secret-value buyer@example.com"), /secret-value|buyer@example\.com/);
});

test("date ranges are normalized and clamped to a bounded window", () => {
  const normalized = normalizeFinancialImportMonitorParams({
    workspace_id: "default",
    from: "2024-01-01",
    to: "2026-07-31",
  }, NOW);
  const days = Math.floor((Date.parse(`${normalized.to}T00:00:00.000Z`) - Date.parse(`${normalized.from}T00:00:00.000Z`)) / 86400000) + 1;
  assert.equal(days, FINANCIAL_IMPORT_MONITOR_MAX_RANGE_DAYS);

  const swapped = normalizeFinancialImportMonitorParams({ from: "2026-07-31", to: "2026-07-01" }, NOW);
  assert.equal(swapped.from, "2026-07-01");
  assert.equal(swapped.to, "2026-07-31");
});

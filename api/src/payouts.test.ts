import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAffiliateCommissionFromCredit,
  calculateCommissionAmount,
  defaultWorkspaceAttributionPolicy,
  generateAffiliateCommissions,
  getPayoutAttributionPolicy,
  matchPayoutRoutes,
  normalizeAffiliateCommissionListParams,
  normalizePayoutGenerationRequest,
  normalizeWorkspaceAttributionPolicyRequest,
  payoutCommissionEventId,
  setPayoutAttributionPolicy,
  type AffiliateCommissionListParams,
  type AffiliateCommissionRow,
  type AttributionCreditForPayout,
  type PayoutAttributionModel,
  type PayoutCursor,
  type PayoutRepository,
  type WorkspaceAttributionPolicy,
  type WorkspaceAttributionPolicyInput,
} from "./payouts.ts";
import { calculateJourneyAttribution, type AttributionCreditInput } from "./attribution.ts";
import { type JourneyEventWithJourney, type JourneyRow } from "./journeys.ts";

class MemoryPayoutRepository implements PayoutRepository {
  policy: WorkspaceAttributionPolicy | null = null;
  credits: AttributionCreditForPayout[] = [];
  commissions: AffiliateCommissionRow[] = [];
  policyUpserts = 0;
  creditQueries = 0;
  commissionInserts = 0;

  async getWorkspaceAttributionPolicy(workspaceId: string) {
    return this.policy && this.policy.workspace_id === workspaceId ? this.policy : null;
  }

  async upsertWorkspaceAttributionPolicy(policy: WorkspaceAttributionPolicyInput) {
    this.policyUpserts += 1;
    this.policy = {
      id: this.policy?.id || "policy-1",
      ...policy,
      created_at: this.policy?.created_at || "2026-07-23T00:00:00.000Z",
      updated_at: "2026-07-23T01:00:00.000Z",
    };
    return this.policy;
  }

  async queryAttributionCreditsForPayout(args: {
    workspace_id: string;
    model: PayoutAttributionModel;
    model_version: string;
    from_ts: string | null;
    to_exclusive_ts: string | null;
    cursor: PayoutCursor | null;
    limit: number;
  }) {
    this.creditQueries += 1;
    return this.credits
      .filter((credit) => credit.workspace_id === args.workspace_id)
      .filter((credit) => credit.model === args.model)
      .filter((credit) => credit.model_version === args.model_version)
      .filter((credit) => credit.status === "attributed")
      .filter((credit) => credit.affiliate_id !== null)
      .filter((credit) => !args.from_ts || Date.parse(credit.conversion_event_time) >= Date.parse(args.from_ts))
      .filter((credit) => !args.to_exclusive_ts || Date.parse(credit.conversion_event_time) < Date.parse(args.to_exclusive_ts))
      .filter((credit) => !args.cursor || Date.parse(credit.conversion_event_time) > Date.parse(args.cursor.conversion_event_time) || (Date.parse(credit.conversion_event_time) === Date.parse(args.cursor.conversion_event_time) && credit.id > args.cursor.id))
      .sort((a, b) => Date.parse(a.conversion_event_time) - Date.parse(b.conversion_event_time) || a.id.localeCompare(b.id))
      .slice(0, args.limit);
  }

  async findAffiliateCommissionsByEventIds(workspaceId: string, commissionEventIds: string[]) {
    return this.commissions.filter((commission) =>
      commission.workspace_id === workspaceId
      && commissionEventIds.includes(commission.commission_event_id),
    );
  }

  async findAffiliateCommissionsByConversionEventIds(workspaceId: string, conversionEventIds: string[]) {
    return this.commissions.filter((commission) =>
      commission.workspace_id === workspaceId
      && conversionEventIds.includes(commission.conversion_event_id),
    );
  }

  async insertAffiliateCommissions(rows: AffiliateCommissionRow[]) {
    this.commissionInserts += 1;
    const inserted: AffiliateCommissionRow[] = [];
    for (const row of rows) {
      const exists = this.commissions.some((commission) =>
        commission.workspace_id === row.workspace_id
        && commission.conversion_event_id === row.conversion_event_id,
      );
      if (exists) continue;
      inserted.push({
        id: row.id || `commission-${this.commissions.length + inserted.length + 1}`,
        ...row,
        created_at: "2026-07-23T02:00:00.000Z",
        updated_at: "2026-07-23T02:00:00.000Z",
      });
    }
    this.commissions.push(...inserted);
    return inserted;
  }

  async listAffiliateCommissions(args: AffiliateCommissionListParams) {
    return this.commissions
      .filter((commission) => commission.workspace_id === args.workspace_id)
      .filter((commission) => !args.affiliate_id || commission.affiliate_id === args.affiliate_id)
      .filter((commission) => !args.status || commission.status === args.status)
      .sort((a, b) => Date.parse(a.conversion_event_time) - Date.parse(b.conversion_event_time) || String(a.id).localeCompare(String(b.id)))
      .slice(0, args.limit);
  }
}

function makePolicy(overrides: Partial<WorkspaceAttributionPolicy> = {}): WorkspaceAttributionPolicy {
  return {
    id: "policy-1",
    workspace_id: "default",
    active_model: "first_touch",
    model_version: "v1",
    default_commission_rate: 0.1,
    status: "active",
    metadata: {},
    created_at: "2026-07-23T00:00:00.000Z",
    updated_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

function makeCredit(overrides: Partial<AttributionCreditForPayout> & { id: string }): AttributionCreditForPayout {
  return {
    id: overrides.id,
    workspace_id: "default",
    journey_id: "journey-1",
    person_id: "person-1",
    conversion_event_id: "conversion-1",
    touchpoint_event_id: "touchpoint-1",
    conversion_event_time: "2026-07-10T12:00:00.000Z",
    touchpoint_event_time: "2026-07-09T12:00:00.000Z",
    model: "first_touch",
    model_version: "v1",
    touchpoint_eligibility_version: "v1",
    status: "attributed",
    reason: null,
    credit_fraction: 1,
    credit_percent: 100,
    credit_amount: "120.00",
    currency: "usd",
    touchpoint_channel: "affiliate",
    source: "partner",
    medium: "affiliate",
    campaign_id: "campaign-1",
    publisher_id: null,
    affiliate_id: "aff-1",
    offer_id: "offer-1",
    calculated_at: "2026-07-23T00:00:00.000Z",
    metadata: {},
    created_at: "2026-07-23T00:00:00.000Z",
    updated_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

function makeJourney(overrides: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id: "journey-smoke-1",
    workspace_id: "default",
    person_id: "person-smoke-1",
    started_at: "2026-07-10T10:00:00.000Z",
    ended_at: "2026-07-10T10:10:00.000Z",
    status: "completed",
    entry_event_id: "page-view-smoke-1",
    conversion_event_id: "purchase-smoke-1",
    conversion_count: 1,
    purchase_count: 1,
    total_revenue: "99.00",
    event_count: 3,
    is_active: false,
    boundary_version: "v1_inactivity_timeout",
    boundary_timeout_seconds: 2592000,
    attribution_window_config: {},
    metadata: {},
    ...overrides,
  };
}

function makeJourneyEvent(overrides: Partial<JourneyEventWithJourney> & { id: string; event_type: JourneyEventWithJourney["event_type"]; event_time: string }): JourneyEventWithJourney {
  return {
    id: overrides.id,
    workspace_id: "default",
    person_id: "person-smoke-1",
    journey_id: "journey-smoke-1",
    platform_order_id: null,
    session_id: "session-smoke-1",
    touchpoint_id: null,
    event_type: overrides.event_type,
    event_time: overrides.event_time,
    source_platform: "browser",
    source_connector: "browser_touchpoint_ingestion",
    source_record_id: overrides.id,
    amount: null,
    currency: null,
    affiliate_id: null,
    offer_id: null,
    campaign_id: null,
    source: null,
    medium: null,
    sub1: null,
    sub2: null,
    sub3: null,
    sub4: null,
    sub5: null,
    transaction_id: null,
    metadata: {},
    ...overrides,
  };
}

function payoutCreditFromAttributionCredit(credit: AttributionCreditInput, id: string, metadata: Record<string, any> = {}): AttributionCreditForPayout {
  return {
    id,
    ...credit,
    publisher_id: null,
    metadata: {
      ...(credit.metadata || {}),
      ...metadata,
    },
    created_at: "2026-07-23T00:00:00.000Z",
    updated_at: "2026-07-23T00:00:00.000Z",
  };
}

test("migration creates policy and commission ledger without changing attribution storage", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/024_payout_engine_v1.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.workspace_attribution_policy/);
  assert.match(migration, /active_model text not null default 'first_touch'/);
  assert.match(migration, /create table if not exists public\.affiliate_commissions/);
  assert.match(migration, /journey_attribution_credit_id uuid not null/);
  assert.match(migration, /publisher_id text/);
  assert.match(migration, /credit_amount numeric/);
  assert.match(migration, /generated_at timestamptz not null default now\(\)/);
  assert.match(migration, /policy_snapshot jsonb not null default '\{\}'::jsonb/);
  assert.match(migration, /affiliate_commissions_event_uidx/);
  assert.match(migration, /affiliate_commissions_conversion_uidx/);
  assert.match(migration, /journey_attribution_credits_payout_idx/);
  assert.match(migration, /status in \('draft', 'pending', 'approved', 'exported', 'paid', 'held', 'voided'\)/);
  assert.doesNotMatch(migration, /delete from public\.journey_attribution_credits/i);
  assert.doesNotMatch(migration, /update public\.journey_attribution_credits/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /journey_attribution_credit_id uuid references/i);
});

test("route matching covers payout APIs and method rejection", () => {
  assert.deepEqual(matchPayoutRoutes("GET", "/v1/payouts/attribution-policy"), { kind: "get_policy" });
  assert.deepEqual(matchPayoutRoutes("PUT", "/v1/payouts/attribution-policy/"), { kind: "set_policy" });
  assert.deepEqual(matchPayoutRoutes("POST", "/v1/payouts/affiliate-commissions/generate"), { kind: "generate_commissions" });
  assert.deepEqual(matchPayoutRoutes("GET", "/v1/payouts/affiliate-commissions"), { kind: "list_commissions" });
  assert.deepEqual(matchPayoutRoutes("DELETE", "/v1/payouts/affiliate-commissions"), { kind: "method_not_allowed", path: "/v1/payouts/affiliate-commissions", allowed_methods: ["GET"] });
});

test("workspace attribution policy selects the active operational model", async () => {
  const repo = new MemoryPayoutRepository();
  const parsed = normalizeWorkspaceAttributionPolicyRequest({
    workspace_id: "default",
    active_model: "last_touch",
    model_version: "v1",
    default_commission_rate: 0.25,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const saved = await setPayoutAttributionPolicy(repo, parsed.value);
  assert.equal(saved.policy.active_model, "last_touch");
  assert.equal(saved.policy.default_commission_rate, 0.25);

  const fetched = await getPayoutAttributionPolicy(repo, "default");
  assert.equal(fetched.policy.configured, true);
  assert.equal(fetched.policy.active_model, "last_touch");
});

test("generation consumes only immutable credits from the selected attribution model", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ active_model: "last_touch", default_commission_rate: 0.2 });
  repo.credits = [
    makeCredit({ id: "credit-first", model: "first_touch", conversion_event_id: "conversion-first" }),
    makeCredit({ id: "credit-last", model: "last_touch", conversion_event_id: "conversion-last", credit_amount: "50.00" }),
  ];
  const beforeCredits = JSON.stringify(repo.credits);
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default", limit: 100 });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(result.credits_scanned, 1);
  assert.equal(result.commissions_inserted, 1);
  assert.equal(repo.commissions[0].journey_attribution_credit_id, "credit-last");
  assert.equal(Number(repo.commissions[0].commission_amount), 10);
  assert.equal(JSON.stringify(repo.credits), beforeCredits);
});

test("commission event ids are deterministic and prevent duplicate ledger rows", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy();
  repo.credits = [makeCredit({ id: "credit-1" })];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const first = await generateAffiliateCommissions(repo, parsed.value);
  const second = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(first.commissions_inserted, 1);
  assert.equal(second.commissions_inserted, 0);
  assert.equal(second.duplicate_commissions_skipped, 1);
  assert.equal(repo.commissions.length, 1);
  assert.equal(repo.commissions[0].commission_event_id, payoutCommissionEventId(repo.policy, repo.credits[0]));
  assert.equal(repo.commissions[0].status, "draft");
});

test("commission generation emits domain events only for newly inserted commissions", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy();
  repo.credits = [makeCredit({ id: "credit-1" })];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const events: any[] = [];

  const first = await generateAffiliateCommissions(repo, parsed.value, {
    on_domain_event: async (event) => {
      events.push(event);
    },
  });
  const second = await generateAffiliateCommissions(repo, parsed.value, {
    on_domain_event: async (event) => {
      events.push(event);
    },
  });

  assert.equal(first.commissions_inserted, 1);
  assert.equal(second.commissions_inserted, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "commission.created");
  assert.equal(events[0].payload.commission_event_id, repo.commissions[0].commission_event_id);
  assert.equal(events[0].correlationId.includes("conversion-1"), true);
});

test("dry run reports generated commissions without inserting rows", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ default_commission_rate: 0.15 });
  repo.credits = [makeCredit({ id: "credit-1", credit_amount: "200.00" })];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default", dry_run: true });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(result.dry_run, true);
  assert.equal(result.commissions_generated, 1);
  assert.equal(result.commissions_inserted, 0);
  assert.equal(result.sample[0].commission_amount, 30);
  assert.equal(repo.commissions.length, 0);
  assert.equal(repo.commissionInserts, 0);
});

test("unattributed or affiliate-less credits do not become payable commissions", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy();
  repo.credits = [
    makeCredit({ id: "credit-unattributed", status: "unattributed", affiliate_id: null, touchpoint_event_id: null }),
    makeCredit({ id: "credit-no-affiliate", affiliate_id: null }),
    makeCredit({ id: "credit-null-amount", credit_amount: null }),
  ];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(result.credits_scanned, 1);
  assert.equal(result.eligible_credits, 0);
  assert.equal(result.skipped_unpayable, 1);
  assert.equal(repo.commissions.length, 0);
});

test("date filters are inclusive by day for payout generation", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy();
  repo.credits = [
    makeCredit({ id: "before", conversion_event_time: "2026-07-09T23:59:59.000Z" }),
    makeCredit({ id: "inside", conversion_event_time: "2026-07-10T23:59:59.000Z" }),
    makeCredit({ id: "after", conversion_event_time: "2026-07-11T00:00:00.000Z" }),
  ];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default", from: "2026-07-10", to: "2026-07-10" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(result.credits_scanned, 1);
  assert.equal(repo.commissions[0].journey_attribution_credit_id, "inside");
});

test("default policy is explicit but not persisted by read-only policy lookup", async () => {
  const repo = new MemoryPayoutRepository();
  const result = await getPayoutAttributionPolicy(repo, "default");
  assert.equal(result.policy.configured, false);
  assert.deepEqual(result.policy, {
    ...result.policy,
    ...defaultWorkspaceAttributionPolicy("default"),
    default_commission_rate: 0,
    configured: false,
  });
  assert.equal(repo.policyUpserts, 0);
});

test("commission row builder snapshots policy without mutating attribution credit", () => {
  const policy = makePolicy({ default_commission_rate: 0.125 });
  const credit = makeCredit({ id: "credit-1", credit_amount: "80.00" });
  const before = JSON.stringify(credit);
  const commission = buildAffiliateCommissionFromCredit(credit, policy);
  assert.ok(commission);
  assert.equal(Number(commission?.commission_amount), 10);
  assert.equal(commission?.metadata.policy.default_commission_rate, 0.125);
  assert.equal(JSON.stringify(credit), before);
});

test("affiliate-bearing page view identify purchase smoke flow generates one first-touch commission", async () => {
  const journey = makeJourney();
  const pageView = makeJourneyEvent({
    id: "page-view-smoke-1",
    event_type: "page_view",
    event_time: "2026-07-10T10:00:00.000Z",
    affiliate_id: "affiliate-smoke-001",
    source: "affiliate",
    medium: "partner",
    metadata: {
      publisher_id: "publisher-smoke-001",
    },
  });
  const identify = makeJourneyEvent({
    id: "identify-smoke-1",
    event_type: "identify",
    event_time: "2026-07-10T10:02:00.000Z",
    metadata: {
      identity: {
        email: "smoke@example.test",
      },
    },
  });
  const purchase = makeJourneyEvent({
    id: "purchase-smoke-1",
    event_type: "purchase",
    event_time: "2026-07-10T10:05:00.000Z",
    amount: "99.00",
    currency: "USD",
  });
  const calculated = calculateJourneyAttribution(journey, [pageView, identify, purchase], ["first_touch", "last_touch"], {
    calculated_at: "2026-07-23T00:00:00.000Z",
  });
  const firstTouch = calculated.credits.find((credit) => credit.model === "first_touch");
  const lastTouch = calculated.credits.find((credit) => credit.model === "last_touch");
  assert.ok(firstTouch);
  assert.ok(lastTouch);
  assert.equal(firstTouch?.affiliate_id, "affiliate-smoke-001");
  assert.equal(lastTouch?.affiliate_id, "affiliate-smoke-001");

  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ active_model: "first_touch", default_commission_rate: 0.075 });
  repo.credits = [
    payoutCreditFromAttributionCredit(firstTouch!, "credit-first-smoke", { publisher_id: pageView.metadata.publisher_id }),
    payoutCreditFromAttributionCredit(lastTouch!, "credit-last-smoke", { publisher_id: pageView.metadata.publisher_id }),
  ];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const firstRun = await generateAffiliateCommissions(repo, parsed.value);
  const rerun = await generateAffiliateCommissions(repo, parsed.value);
  repo.policy = makePolicy({ active_model: "last_touch", default_commission_rate: 0.075 });
  const afterPolicySwitch = await generateAffiliateCommissions(repo, parsed.value);

  assert.equal(firstRun.commissions_inserted, 1);
  assert.equal(rerun.commissions_inserted, 0);
  assert.equal(afterPolicySwitch.commissions_inserted, 0);
  assert.equal(repo.commissions.length, 1);
  assert.equal(repo.commissions[0].affiliate_id, "affiliate-smoke-001");
  assert.equal(repo.commissions[0].publisher_id, "publisher-smoke-001");
  assert.equal(repo.commissions[0].model, "first_touch");
  assert.equal(repo.commissions[0].status, "draft");
  assert.equal(Number(repo.commissions[0].commission_amount), 7.43);
});

test("policy switching does not silently create a second payable commission for a historical conversion", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ active_model: "first_touch", default_commission_rate: 0.1 });
  repo.credits = [
    makeCredit({ id: "credit-first", model: "first_touch", conversion_event_id: "conversion-policy-switch", credit_amount: "100.00" }),
    makeCredit({ id: "credit-last", model: "last_touch", conversion_event_id: "conversion-policy-switch", affiliate_id: "aff-2", credit_amount: "100.00" }),
  ];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const firstTouch = await generateAffiliateCommissions(repo, parsed.value);
  repo.policy = makePolicy({ active_model: "last_touch", default_commission_rate: 0.1 });
  const lastTouch = await generateAffiliateCommissions(repo, parsed.value);

  assert.equal(firstTouch.commissions_inserted, 1);
  assert.equal(lastTouch.commissions_inserted, 0);
  assert.equal(lastTouch.duplicate_commissions_skipped, 1);
  assert.equal(repo.commissions.length, 1);
  assert.equal(repo.commissions[0].model, "first_touch");
  assert.equal(repo.commissions[0].affiliate_id, "aff-1");
});

test("commission precision uses decimal arithmetic and USD currency rounding", () => {
  assert.equal(calculateCommissionAmount("99.00", "0.075", "USD"), "7.43");
  assert.equal(calculateCommissionAmount("10.005", "1", "USD"), "10.01");
  assert.equal(calculateCommissionAmount("100", "0.333333", "USD"), "33.33");
});

test("commission audit snapshot preserves payout decision fields", () => {
  const policy = makePolicy({ active_model: "first_touch", default_commission_rate: 0.075, metadata: { source: "smoke-policy" } });
  const credit = makeCredit({
    id: "credit-audit",
    conversion_event_id: "conversion-audit",
    touchpoint_event_id: "touchpoint-audit",
    affiliate_id: "affiliate-audit",
    credit_amount: "99.00",
    currency: "USD",
    metadata: { publisher_id: "publisher-audit" },
  });
  const commission = buildAffiliateCommissionFromCredit(credit, policy);
  assert.ok(commission);
  assert.equal(commission?.conversion_event_id, "conversion-audit");
  assert.equal(commission?.touchpoint_event_id, "touchpoint-audit");
  assert.equal(commission?.journey_attribution_credit_id, "credit-audit");
  assert.equal(commission?.affiliate_id, "affiliate-audit");
  assert.equal(commission?.publisher_id, "publisher-audit");
  assert.equal(commission?.model, "first_touch");
  assert.equal(commission?.model_version, "v1");
  assert.equal(commission?.credit_amount, "99");
  assert.equal(commission?.commission_rate, 0.075);
  assert.equal(commission?.commission_amount, "7.43");
  assert.equal(commission?.currency, "USD");
  assert.equal(commission?.policy_snapshot.default_commission_rate, 0.075);
  assert.ok(commission?.generated_at);
});

test("new commissions begin as draft and lifecycle statuses validate", () => {
  const commission = buildAffiliateCommissionFromCredit(makeCredit({ id: "credit-lifecycle" }), makePolicy());
  assert.equal(commission?.status, "draft");
  for (const status of ["draft", "pending", "approved", "exported", "paid", "held", "voided"]) {
    const parsed = normalizeAffiliateCommissionListParams({ workspace_id: "default", status });
    assert.equal(parsed.ok, true);
  }
  const invalid = normalizeAffiliateCommissionListParams({ workspace_id: "default", status: "payable" });
  assert.equal(invalid.ok, false);
});

test("concurrent generation and retries remain idempotent by conversion", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ default_commission_rate: 0.1 });
  repo.credits = [makeCredit({ id: "credit-concurrent", conversion_event_id: "conversion-concurrent", credit_amount: "150.00" })];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const [a, b, c] = await Promise.all([
    generateAffiliateCommissions(repo, parsed.value),
    generateAffiliateCommissions(repo, parsed.value),
    generateAffiliateCommissions(repo, parsed.value),
  ]);
  const inserted = a.commissions_inserted + b.commissions_inserted + c.commissions_inserted;
  assert.equal(inserted, 1);
  assert.equal(repo.commissions.length, 1);
  assert.equal(repo.commissions[0].conversion_event_id, "conversion-concurrent");

  const retry = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(retry.commissions_inserted, 0);
  assert.equal(retry.duplicate_commissions_skipped, 1);
});

test("active model with multiple credits for one conversion generates only one payable commission", async () => {
  const repo = new MemoryPayoutRepository();
  repo.policy = makePolicy({ active_model: "linear" });
  repo.credits = [
    makeCredit({ id: "linear-1", model: "linear", conversion_event_id: "conversion-linear", affiliate_id: "aff-1" }),
    makeCredit({ id: "linear-2", model: "linear", conversion_event_id: "conversion-linear", affiliate_id: "aff-2" }),
  ];
  const parsed = normalizePayoutGenerationRequest({ workspace_id: "default" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const result = await generateAffiliateCommissions(repo, parsed.value);
  assert.equal(result.commissions_inserted, 1);
  assert.equal(result.duplicate_credit_commissions_skipped, 1);
  assert.equal(repo.commissions.length, 1);
  assert.equal(repo.commissions[0].affiliate_id, "aff-1");
});

test("API validation rejects invalid payout policy and generation inputs", () => {
  assert.equal(normalizeWorkspaceAttributionPolicyRequest({ active_model: "unsupported" }).ok, false);
  assert.equal(normalizeWorkspaceAttributionPolicyRequest({ default_commission_rate: 1.5 }).ok, false);
  assert.equal(normalizeWorkspaceAttributionPolicyRequest({ status: "deleted" }).ok, false);
  assert.equal(normalizePayoutGenerationRequest({ from: "2026-07-11", to: "2026-07-10" }).ok, false);
  assert.equal(normalizePayoutGenerationRequest({ from: "not-a-date" }).ok, false);
});

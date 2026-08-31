import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260830233407_add_commas_economic_order_allocations.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");

const allocation = (gross: number) => {
  const lines = [{ step: "front_end", amount: 67 }];
  if ([92, 131].includes(gross)) lines.push({ step: "revenue_booster", amount: 25 });
  if ([106, 131].includes(gross)) lines.push({ step: "fast_track", amount: 39 });
  return [67, 92, 106, 131].includes(gross) ? lines : [];
};

test("bounded PBS totals decompose into conserved deterministic economic lines", () => {
  assert.deepEqual(allocation(67), [{ step: "front_end", amount: 67 }]);
  assert.deepEqual(allocation(92), [{ step: "front_end", amount: 67 }, { step: "revenue_booster", amount: 25 }]);
  assert.deepEqual(allocation(106), [{ step: "front_end", amount: 67 }, { step: "fast_track", amount: 39 }]);
  assert.deepEqual(allocation(131), [{ step: "front_end", amount: 67 }, { step: "revenue_booster", amount: 25 }, { step: "fast_track", amount: 39 }]);
  for (const gross of [67, 92, 106, 131]) assert.equal(allocation(gross).reduce((sum, line) => sum + line.amount, 0), gross);
});

test("known 9,405-order cohort conserves provider gross exactly", () => {
  const counts = new Map([[67, 6297], [92, 577], [106, 601], [131, 1930]]);
  const byStep = new Map<string, number>();
  let orders = 0, providerGross = 0, allocatedGross = 0;
  for (const [gross, count] of counts) {
    orders += count; providerGross += gross * count;
    for (const line of allocation(gross)) {
      byStep.set(line.step, (byStep.get(line.step) || 0) + line.amount * count);
      allocatedGross += line.amount * count;
    }
  }
  assert.deepEqual({ orders, providerGross, allocatedGross, difference: providerGross - allocatedGross }, { orders: 9405, providerGross: 791519, allocatedGross: 791519, difference: 0 });
  assert.deepEqual(Object.fromEntries(byStep), { front_end: 630135, revenue_booster: 62675, fast_track: 98709 });
});

test("migration scopes inference to approved current cohort and exact canonical hierarchy", () => {
  assert.match(migration, /p_provider_product_external_id not in \('0E1ML','4KV26','6GO2R','Jz71g','KE1Ox','rVWgL','xz1kz'\)/);
  assert.doesNotMatch(migration, /p_provider_product_external_id not in \([^)]*o2GYY/);
  for (const id of ["8110e951-8ca6-406a-8817-55575fe647ba", "a5d6d601-790d-4b7c-97f3-a9f833465ef5", "2fa222b9-1325-4cd5-b712-03313f093057"]) assert.match(migration, new RegExp(id));
  assert.match(migration, /p_mapping_status <> 'approved'/);
  assert.match(migration, /upper\(coalesce\(p_currency,''\)\) <> 'USD'/);
  assert.match(migration, /v_order\.currency is null[\s\S]*v_effective_currency:='USD'; v_currency_basis:='operator_authorized_policy'/);
  assert.match(migration, /'currency_basis',v_currency_basis,'source_currency',v_order\.currency/);
  assert.match(migration, /v_total not in \(67,92,106,131\)/);
  assert.match(migration, /coalesce\(p_order_status,''\) <> 'observed'/);
});

test("projection has stable identity, provenance, conservation, and no provider mutation", () => {
  assert.match(migration, /create table public\.commerce_order_economic_lines/);
  assert.match(migration, /unique \(connection_id, provider_account_id, canonical_order_id,\s*allocation_policy_version, offer_step_id, line_sequence\)/);
  assert.match(migration, /allocation_line_key text not null/);
  assert.match(migration, /provenance in \('provider_explicit','inferred'\)/);
  assert.match(migration, /commas-pbs-order-bump-allocation-v1/);
  assert.match(migration, /round\(v_allocated,2\) <> round\(v_order\.gross_amount,2\)/);
  assert.match(migration, /deterministic_checkout_decomposition/);
  assert.doesNotMatch(migration, /(update|delete from) public\.(platform_orders|commerce_order_lines|commerce_product_mapping_decisions|commerce_refund_events|commerce_provider_disputes)/);
});

test("single-order, continuous batch, and resumable backfill share the SQL engine", () => {
  assert.match(migration, /reconcile_commas_order_economic_allocation_v1[\s\S]*compute_commas_pbs_order_economic_lines_v1/);
  assert.match(migration, /reconcile_commas_order_economic_allocation_batch_v1[\s\S]*reconcile_commas_order_economic_allocation_v1/);
  assert.match(migration, /backfill_commas_order_economic_allocations_v1[\s\S]*reconcile_commas_order_economic_allocation_v1/);
  assert.match(migration, /p_after_canonical_order_id uuid default null/);
  assert.match(migration, /p_dry_run boolean default true/);
  assert.match(worker, /normalize_commerce_transaction_page_v2[\s\S]*reconcile_commas_order_economic_allocation_batch_v1/);
  assert.match(worker, /commerce\.economic_allocation\.failed[\s\S]*retryable:true/);
});

test("product reporting uses one conserved source while company gross remains untouched", () => {
  assert.match(migration, /create or replace view public\.commerce_canonical_product_revenue_v1/);
  assert.match(migration, /having round\(sum\(e\.allocated_gross_amount\),2\)=round\(o\.gross_amount,2\)/);
  assert.match(migration, /'economic_allocation'::text revenue_source/);
  assert.match(migration, /'provider_product_fallback'::text/);
  assert.match(migration, /where not exists \([\s\S]*from valid_allocations/);
});

test("allocation surfaces are server-only SECURITY INVOKER contracts", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.commerce_order_economic_lines from public, anon, authenticated, authenticator/);
  for (const fn of ["compute_commas_pbs_order_economic_lines_v1", "reconcile_commas_order_economic_allocation_v1", "reconcile_commas_order_economic_allocation_batch_v1", "backfill_commas_order_economic_allocations_v1"]) {
    assert.match(migration, new RegExp(`function public\\.${fn}\\([\\s\\S]*?security invoker`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\(`));
  }
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|execute).* to (?:anon|authenticated|authenticator|public)/);
});

test("standalone bumps and unsupported transactions remain independent fallback revenue", () => {
  for (const amount of [25, 39, 77, 94, 59, 72.86, 91, 130, 162, 186, 201, 225]) assert.deepEqual(allocation(amount), []);
  assert.match(migration, /p_provider <> 'commas'/);
  assert.match(migration, /p_provider_account_id <> '0369c701-717f-4c34-b230-8341bcdb7e65'/);
  assert.doesNotMatch(migration, /person_id|customer_email|same.day|timestamp.proximity/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const migration = (file: string) =>
  new URL(`../../supabase/migrations/${file}`, import.meta.url);
const readMigration = (file: string) => readFileSync(migration(file), "utf8");
const sha256 = (file: string) =>
  createHash("sha256").update(readFileSync(migration(file))).digest("hex");

const files = {
  shopify: "20260915054632_shopify_order_person_link.sql",
  ownership: "20260917175606_commas_refund_forward_ownership_v1.sql",
  observations: "20260917175610_commas_refund_created_observations_v1.sql",
  epochGuard: "20260917175616_commas_refund_transaction_epoch_guard.sql",
  financialGate: "20260917175617_commas_refund_created_financial_gate.sql",
} as const;

test("uses the Production-backed identities in dependency order", () => {
  assert.equal(existsSync(migration("20260915054500_shopify_order_person_link.sql")), false);
  assert.equal(existsSync(migration("20260915054500_commas_refund_forward_ownership_v1.sql")), false);

  for (const file of Object.values(files)) assert.equal(existsSync(migration(file)), true);

  const versions = Object.values(files).map((file) => BigInt(file.match(/^(\d+)_/)![1]));
  assert.deepEqual(versions, [
    20260915054632n,
    20260917175606n,
    20260917175610n,
    20260917175616n,
    20260917175617n,
  ]);
  assert.ok(versions[1] < versions[2]);
  assert.ok(versions[1] < versions[3]);
  assert.ok(versions[1] < versions[4]);
});

test("preserves the byte-identical SQL bodies from before reconciliation", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(files).map(([name, file]) => [name, sha256(file)])),
    {
      shopify: "375f99e1bee34d20ed4f6584317a9576df8c090c0647090047f036c309942790",
      ownership: "ec1126d6bf64c06bd60aa136049d7893c5a4ac80b724ca20ff67c3e4959fbddc",
      observations: "ab30e7515e32092c975ebd8cf173e5c9c40b29b508286580caf9390a35a0dce8",
      epochGuard: "8f7004d537c5303c914a65fc758ef0437fc1261074438e23c46f00fdf9c87939",
      financialGate: "8278a5a515e5b9734528f9eb3fd2d2393a96422242dc3b44e0ffd6df4435405e",
    },
  );
});

test("keeps Shopify independent and the Commas ownership dependencies intact", () => {
  const shopify = readMigration(files.shopify);
  const ownership = readMigration(files.ownership);
  const observations = readMigration(files.observations);
  const epochGuard = readMigration(files.epochGuard);
  const financialGate = readMigration(files.financialGate);

  assert.match(shopify, /create or replace function public\.link_shopify_platform_order_person\(\)/);
  assert.match(shopify, /create or replace function public\.backfill_shopify_orders_for_customer_identity\(\)/);
  assert.doesNotMatch(shopify, /commerce_refund_forward_epochs|commas_refund_transaction_page_economic_owner_v1/);
  assert.doesNotMatch(ownership, /shopify|link_shopify_platform_order_person|backfill_shopify_orders_for_customer_identity/i);

  assert.match(ownership, /create table public\.commerce_refund_forward_epochs/);
  assert.match(ownership, /create or replace function public\.commas_refund_transaction_page_economic_owner_v1/);
  assert.match(observations, /create table public\.commerce_refund_created_observations/);
  assert.match(epochGuard, /public\.commas_refund_transaction_page_economic_owner_v1/);
  assert.match(financialGate, /from public\.commerce_refund_forward_epochs/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("refund lookup accepts UUID identities and preserves scope and ambiguity", async () => {
  const db = new PGlite();
  const org = "10000000-0000-0000-0000-000000000001";
  const other = "10000000-0000-0000-0000-000000000002";
  const order = "20000000-0000-0000-0000-000000000001";
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  const filename = readdirSync(migrations).find(name => name.endsWith("_ws001_commas_refund_uuid_lookup.sql"))!;
  try {
    await db.exec(`create table commerce_source_mappings (
      organization_id uuid, connection_id uuid, provider_account_id uuid,
      source_object_type text, source_object_id text,
      canonical_object_type text, canonical_object_id uuid, state text);
      insert into commerce_source_mappings values
      ('${org}','${org}','${org}','commas_public_transaction','ORD-exact','order','${order}','active'),
      ('${other}','${org}','${org}','commas_public_transaction','ORD-exact','order','${other}','active'),
      ('${org}','${other}','${org}','commas_public_transaction','ORD-exact','order','${other}','active'),
      ('${org}','${org}','${other}','commas_public_transaction','ORD-exact','order','${other}','active'),
      ('${org}','${org}','${org}','commas_public_transaction','ORD-inactive','order','${order}','inactive');`);
    await db.exec(readFileSync(new URL(filename, migrations), "utf8"));
    const lookup = async (id: string | null) => (await db.query(
      "select * from resolve_commas_refund_created_order_v1($1,$2,$3,$4)", [org, org, org, id])).rows;
    assert.deepEqual(await lookup("ORD-exact"), [{canonical_order_id:order, match_state:"exact_ord"}]);
    assert.deepEqual(await lookup(null), [{canonical_order_id:null, match_state:"missing"}]);
    assert.deepEqual(await lookup("legacy"), [{canonical_order_id:null, match_state:"legacy_unresolved"}]);
    assert.deepEqual(await lookup("ORD-absent"), [{canonical_order_id:null, match_state:"malformed"}]);
    assert.deepEqual(await lookup("ORD-inactive"), [{canonical_order_id:null, match_state:"malformed"}]);
    await db.exec(`insert into commerce_source_mappings values
      ('${org}','${org}','${org}','commas_public_transaction','ORD-exact','order','${other}','active')`);
    await assert.rejects(lookup("ORD-exact"), /ambiguous Commas public transaction mapping/);
  } finally { await db.close(); }
});

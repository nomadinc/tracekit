import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const migrationName = readdirSync(migrations).find(name => name.endsWith("_ws001_everflow_provider_order_lookup_index.sql"))!;
const migration = readFileSync(new URL(migrationName, migrations), "utf8");
const lookup = `select count(distinct m.canonical_object_id)::integer candidate_count,
  case when count(distinct m.canonical_object_id)=1 then (array_agg(distinct m.canonical_object_id))[1] end canonical_order_id
  from public.commerce_source_mappings m
  where m.organization_id=$1::uuid and m.source_object_id=$2
    and m.canonical_object_type='order' and m.state='active'`;

test("v5 exact order lookup uses a selective tenant index without changing identity decisions", async () => {
  const db = new PGlite();
  const org = "10000000-0000-0000-0000-000000000001";
  const otherOrg = "10000000-0000-0000-0000-000000000002";
  const first = "20000000-0000-0000-0000-000000000001";
  const second = "20000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create table public.commerce_source_mappings (
      organization_id uuid not null, source_object_id text not null,
      canonical_object_id uuid not null, canonical_object_type text not null,
      state text not null, connection_id uuid not null, provider_account_id uuid not null,
      source_object_type text not null,
      unique(connection_id,provider_account_id,source_object_type,source_object_id)
    );
    insert into public.commerce_source_mappings
      select '${org}', 'noise-'||n, '${first}', 'order', 'active',
        '${org}', '${org}', 'order'
      from generate_series(1,50000) n;`);
    const add = async (scope: string, source: string, target: string, type = "order", state = "active", account = org) => {
      await db.query(`insert into public.commerce_source_mappings values ($1,$2,$3,$4,$5,$1,$6,'order')`, [scope,source,target,type,state,account]);
    };
    await add(org, "exact", first);
    await add(otherOrg, "exact", second);
    await add(org, "exact", second, "customer", "active", otherOrg);
    await add(org, "inactive", first, "order", "inactive");
    await add(org, "ambiguous", first);
    await add(org, "ambiguous", second, "order", "active", otherOrg);
    await add(org, "same-order", first);
    await add(org, "same-order", first, "order", "active", otherOrg);
    await db.exec("analyze public.commerce_source_mappings");
    const before = await db.query(lookup, [org, "exact"]);
    const beforePlan = await db.query(`explain (format json) ${lookup}`, [org, "exact"]);
    await db.exec(migration);
    await db.exec("analyze public.commerce_source_mappings");
    const afterPlan = await db.query(`explain (format json) ${lookup}`, [org, "exact"]);
    assert.match(JSON.stringify(afterPlan.rows), /commerce_source_mappings_active_order_lookup_idx/);
    const cost = (result: any) => result.rows[0]["QUERY PLAN"][0].Plan["Total Cost"];
    assert.ok(cost(afterPlan) < cost(beforePlan) / 10, "lookup must eliminate the broad source-identity scan");
    assert.deepEqual((await db.query(lookup, [org, "exact"])).rows, before.rows);
    assert.deepEqual(before.rows, [{candidate_count:1, canonical_order_id:first}]);
    assert.deepEqual((await db.query(lookup, [otherOrg, "exact"])).rows, [{candidate_count:1, canonical_order_id:second}]);
    assert.deepEqual((await db.query(lookup, [org, "ambiguous"])).rows, [{candidate_count:2, canonical_order_id:null}]);
    assert.deepEqual((await db.query(lookup, [org, "same-order"])).rows, [{candidate_count:1, canonical_order_id:first}]);
    assert.deepEqual((await db.query(lookup, [org, "inactive"])).rows, [{candidate_count:0, canonical_order_id:null}]);
    assert.deepEqual((await db.query(lookup, [org, "missing"])).rows, [{candidate_count:0, canonical_order_id:null}]);
    await db.exec(migration);
    assert.equal((await db.query<{n:number}>(`select count(*)::integer n from public.commerce_source_mappings`)).rows[0].n, 50008);
  } finally { await db.close(); }
});

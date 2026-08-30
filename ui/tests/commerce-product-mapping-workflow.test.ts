import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/commerce/product-mappings/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/offers/commerce-product-mapping-review.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260830053413_commerce_product_mapping_review_workflow.sql", import.meta.url), "utf8");
const ingestion = readFileSync(new URL("../../supabase/migrations/043_commerce_shadow_ingestion_v1.sql", import.meta.url), "utf8");
const alerts = readFileSync(new URL("../../api/src/commerce-operational-alerts.ts", import.meta.url), "utf8");

test("mapping review route is WorkOS authenticated, offers.manage protected, same-origin, and fixed scope", () => {
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /requirePermission\(r\.session,"offers\.manage"\)/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /ORGANIZATION_ID="5f1de64a-1b37-40bb-81c8-32197eda0b41"/);
  assert.match(route, /CONNECTION_ID="ea1c2313-6120-4692-84c5-ec3562e7dcf6"/);
  assert.match(route, /PROVIDER_ACCOUNT_ID="0369c701-717f-4c34-b230-8341bcdb7e65"/);
  assert.doesNotMatch(route, /body\.(organizationId|connectionId|providerAccountId|actorUserId|mappingVersion)/);
  assert.doesNotMatch(route, /error\.message|String\(e\)/);
});

test("ten authorized products receive bounded presets while arbitrary products receive none", () => {
  for (const id of ["o2GYY", "Jz71g", "4KV26", "xz1kz", "v2Pg8", "yPV86", "ADvn9", "BBwgQ", "ERzlW", "G6BZK"]) assert.match(route, new RegExp(`${id}:?\"`));
  assert.equal((route.match(/8110e951-8ca6-406a-8817-55575fe647ba/g) || []).length, 4);
  assert.match(route, /authorizedPreset:presets\[String\(row\.provider_product_id\)\]\?/);
  assert.match(component, /Explicit confirmation is still required/);
  assert.doesNotMatch(component, /bulk approve|approve all/i);
});

test("server validates the complete tenant-scoped hierarchy and rejection carries no target", () => {
  assert.match(route, /tracekit_business_contexts\?organization_id=eq\.\$\{ORGANIZATION_ID\}/);
  assert.match(route, /canonical_offers\?organization_id=eq\.\$\{ORGANIZATION_ID\}&business_context_id/);
  assert.match(route, /offer_steps\?organization_id=eq\.\$\{ORGANIZATION_ID\}&canonical_offer_id/);
  assert.match(route, /offer_variants\?organization_id=eq\.\$\{ORGANIZATION_ID\}&offer_step_id/);
  assert.match(route, /mapping_target_incomplete/);
  assert.match(route, /rejected_mapping_has_target/);
  assert.match(migration, /approved product mapping target incomplete/);
  assert.match(migration, /rejected product mapping cannot retain a target/);
});

test("mapping decisions are version guarded, append-only, audited, and sanitized", () => {
  assert.match(route, /expectedMappingVersion/);
  assert.match(route, /mappingVersion=`operator:\$\{new Date\(\)\.toISOString\(\)\}:\$\{randomUUID\(\)\}`/);
  assert.match(route, /databaseCode==="40001"/);
  assert.match(route, /stale_mapping_version/);
  assert.match(migration, /for update/);
  assert.match(migration, /mapping_version is not distinct from p_expected_mapping_version/);
  assert.match(migration, /insert into public\.commerce_product_mapping_decisions/);
  assert.match(migration, /insert into public\.tracekit_audit_events/);
  assert.match(migration, /p_correlation_id/);
  assert.match(migration, /permission_evaluated[\s\S]*'offers\.manage'/);
  assert.match(migration, /errcode='40001'/);
});

test("review projection supplies ranked impact, refund, alert, and work-item state without PII", () => {
  for (const field of ["order_count", "gross_revenue", "refund_count", "refund_amount", "first_seen_at", "last_seen_at", "alert_open", "work_item_open"]) assert.match(migration, new RegExp(field));
  assert.match(route, /order=gross_revenue\.desc,order_count\.desc/);
  assert.match(migration, /security_invoker=true/);
  assert.match(migration, /grant select on public\.commerce_product_mapping_review_v1 to service_role/);
  assert.doesNotMatch(route, /customer|email|phone|raw_payload/i);
});

test("UI requires reason and confirmation, handles stale state, and displays append-only history", () => {
  assert.match(component, /Operator reason/);
  assert.match(component, /confirm-product-mapping-decision/);
  assert.match(component, /Confirm decision/);
  assert.match(component, /stale_mapping_version/);
  assert.match(component, /changed while it was under review/);
  assert.match(component, /Decision history/);
  assert.match(component, /alert and Operations work-item resolution is pending/i);
});

test("four checkout identities remain distinct, may share Front End, and import preserves approval", () => {
  const ids = ["o2GYY", "Jz71g", "4KV26", "xz1kz"];
  assert.equal(new Set(ids).size, 4);
  assert.equal((route.match(/8110e951-8ca6-406a-8817-55575fe647ba/g) || []).length, 4);
  assert.doesNotMatch(route, /insert into public\.platform_orders|update public\.platform_orders|offer_variants.*insert/i);
  const productUpsert = ingestion.match(/insert into public\.commerce_provider_products[\s\S]*?;\n/)?.[0] || "";
  assert.doesNotMatch(productUpsert, /mapping_status\s*=/);
  assert.doesNotMatch(productUpsert, /mapping_version\s*=/);
  assert.doesNotMatch(productUpsert, /canonical_offer_id\s*=/);
});

test("product-health evaluator remains the sole owner of alert and work-item resolution", () => {
  assert.doesNotMatch(route, /(insert into|update|delete from).*tracekit_operational_alerts/i);
  assert.doesNotMatch(route, /(insert into|update|delete from).*work_items/i);
  assert.match(route, /alertReconciliation:"pending_evaluator"/);
  assert.match(alerts, /product_unmapped/);
  assert.match(alerts, /resolve/);
});

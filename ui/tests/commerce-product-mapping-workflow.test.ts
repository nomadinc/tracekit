import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/commerce/product-mappings/route.ts", import.meta.url), "utf8");
const bulkRoute = readFileSync(new URL("../app/api/commerce/product-mappings/bulk/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/offers/commerce-product-mapping-review.tsx", import.meta.url), "utf8");
const shellDrawer = readFileSync(new URL("../components/layout/shell-drawer.tsx", import.meta.url), "utf8");
const intelligence = readFileSync(new URL("../lib/commerce/product-mapping-intelligence.ts", import.meta.url), "utf8");
const intelligenceRepository = readFileSync(new URL("../lib/commerce/product-mapping-intelligence-repository.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260830053413_commerce_product_mapping_review_workflow.sql", import.meta.url), "utf8");
const bulkMigration = readFileSync(new URL("../../supabase/migrations/20260830193000_atomic_bulk_product_mapping_decisions.sql", import.meta.url), "utf8");
const priceSafetyMigration = readFileSync(new URL("../../supabase/migrations/20260830215136_add_product_mapping_price_evidence_and_correct_growth_partner.sql", import.meta.url), "utf8");
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

test("review recommendations come from persisted intelligence rather than hard-coded product presets", () => {
  assert.match(route, /loadProductMappingRecommendations/);
  assert.match(route, /recommendations\(productRows\)/);
  assert.match(route, /recommendationTarget\(recommendation\)/);
  assert.match(intelligenceRepository, /commerce_product_mapping_rules/);
  assert.match(intelligenceRepository, /commerce_product_mapping_rule_prices/);
  assert.match(intelligenceRepository, /commerce_product_mapping_policies/);
  assert.doesNotMatch(route, /const\s+presets\s*:/);
  assert.doesNotMatch(route, /presets\[String\(row\.provider_product_id\)\]/);
  assert.match(component, /TraceKit recommendation/);
  assert.match(component, /confirm-product-mapping-decision/);
  assert.match(component, /Review decision/);
});

test("recommendation reads are advisory only and never append mapping decisions or auto-map from GET", () => {
  const getBody = route.match(/export async function GET[\s\S]*?export async function POST/)?.[0] || "";
  assert.match(getBody, /loadProductMappingRecommendations|recommendations\(productRows\)/);
  assert.doesNotMatch(getBody, /decideProductMapping\(/);
  assert.doesNotMatch(getBody, /commerce_product_mapping_decisions/);
  assert.doesNotMatch(getBody, /rpc\/decide_commerce_product_mapping/);
  assert.doesNotMatch(getBody, /auto_map_enabled|execution_mode\s*=\s*["']auto_map["']/);
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

test("single-product approval remains explicit, version guarded, append-only, audited, and sanitized", () => {
  assert.match(route, /body\.confirmation!=="confirm-product-mapping-decision"/);
  assert.match(route, /reason=String\(body\.reason\|\|""\)\.trim\(\)/);
  assert.match(route, /expectedMappingVersion/);
  assert.match(route, /current\.mapping_version!==expected/);
  assert.match(route, /mappingVersion=`operator:\$\{new Date\(\)\.toISOString\(\)\}:\$\{randomUUID\(\)\}`/);
  assert.match(route, /repo\.decideProductMapping/);
  assert.match(route, /databaseCode==="40001"/);
  assert.match(route, /stale_mapping_version/);
  assert.match(migration, /for update/);
  assert.match(migration, /mapping_version is not distinct from p_expected_mapping_version/);
  assert.match(migration, /insert into public\.commerce_product_mapping_decisions/);
  assert.match(migration, /insert into public\.tracekit_audit_events/);
  assert.match(migration, /p_correlation_id/);
  assert.match(migration, /permission_evaluated[\s\S]*'offers\.manage'/);
  assert.match(migration, /errcode='40001'/);
  assert.match(route, /repo\.decideProductMapping\([\s\S]*expectedMappingVersion:expected/);
  const postHandler = route.match(/export async function POST[\s\S]*/)?.[0] || "";
  assert.ok(postHandler.indexOf("current.mapping_version!==expected") < postHandler.indexOf("repo.decideProductMapping"));
});

test("recommendation confidence cannot bypass mapping-version concurrency", () => {
  const postBody = route.match(/export async function POST[\s\S]*/)?.[0] || "";
  assert.match(postBody, /current\.mapping_version!==expected/);
  assert.match(postBody, /stale_mapping_version/);
  assert.match(postBody, /decideProductMapping/);
  assert.doesNotMatch(postBody, /recommendation\.confidence[\s\S]*decideProductMapping/);
});

test("review projection supplies ranked impact, refund, alert, and work-item state without PII", () => {
  for (const field of ["order_count", "gross_revenue", "refund_count", "refund_amount", "first_seen_at", "last_seen_at", "alert_open", "work_item_open"]) assert.match(migration, new RegExp(field));
  assert.match(route, /order=gross_revenue\.desc,order_count\.desc/);
  assert.match(migration, /security_invoker=true/);
  assert.match(migration, /grant select on public\.commerce_product_mapping_review_v1 to service_role/);
  assert.doesNotMatch(route, /customer|email|phone|raw_payload/i);
});

test("UI preserves manual review fallback and explicit single-product reason/confirmation", () => {
  assert.match(component, /Manual review/);
  assert.match(component, /Operator reason/);
  assert.match(component, /confirm-product-mapping-decision/);
  assert.match(component, /Confirm decision/);
  assert.match(component, /stale_mapping_version/);
  assert.match(component, /changed while it was under review/);
  assert.match(component, /Decision history/);
  assert.match(component, /Evaluator reconciliation is pending/);
  assert.match(component, /Decision history/);
  assert.match(component, /fetch\("\/api\/commerce\/product-mappings"/);
});

test("bulk approval is server-guarded, recommendation-revalidated, and uses one atomic RPC", () => {
  assert.match(bulkRoute, /requirePermission\(resolved\.session, "offers\.manage"\)/);
  assert.match(bulkRoute, /sameOrigin\(request\)/);
  assert.match(bulkRoute, /confirm-bulk-product-mapping-decisions/);
  assert.match(bulkRoute, /const reason = String\(body\.reason \|\| ""\)\.trim\(\)/);
  assert.match(bulkRoute, /expectedMappingVersion/);
  assert.match(bulkRoute, /stale_mapping_version/);
  assert.match(bulkRoute, /loadProductMappingRecommendations/);
  assert.match(bulkRoute, /bulk_recommendation_changed/);
  assert.match(bulkRoute, /rpc\/decide_commerce_product_mapping_bulk/);
  assert.doesNotMatch(component, /Promise\.all\([^)]*\/api\/commerce\/product-mappings["']/s);
  assert.match(bulkMigration, /decide_commerce_product_mapping_bulk/);
  assert.match(bulkMigration, /decide_commerce_product_mapping\(/);
  assert.match(bulkMigration, /jsonb_array_length\(p_items\).*50/s);
  assert.match(bulkMigration, /p_expected_mapping_version|expected_mapping_version/);
});

test("bulk UI requires one operator reason and explicit confirmation for the selected group", () => {
  assert.match(component, /confirm-bulk-product-mapping-decisions/);
  assert.match(component, /Operator reason/);
  assert.match(component, /Confirm atomic bulk approval/);
  assert.match(component, /Confirm \$\{chosen\.length\} decisions/);
  assert.match(component, /stale_mapping_version|bulk_recommendation_changed/);
  assert.match(component, /selected/);
});

test("individual and bulk review actions open the established right-side shell drawer", () => {
  assert.match(component, /useShellDrawer/);
  assert.match(component, /drawer\.openDrawer\(<ProductDecisionDrawer/);
  assert.match(component, /drawer\.openDrawer\(<BulkDecisionPanel/);
  assert.match(component, /drawer\.closeDrawer/);
  assert.match(shellDrawer, /absolute inset-y-0 right-0/);
  assert.match(shellDrawer, /event\.key === "Escape"/);
  assert.match(shellDrawer, /aria-label="Close Drawer"/);
});

test("review content lives only in the drawer and is not appended below the product list", () => {
  const reviewContent = component.match(/function ReviewContent\(\)[\s\S]*?(?=function ProductDecisionDrawer)/)?.[0] || "";
  const mainPageMarkup = reviewContent.slice(reviewContent.indexOf("return <section"));
  assert.match(reviewContent, /<ProductList[\s\S]*onSelect=\{openProductReview\}/);
  assert.doesNotMatch(mainPageMarkup, /<DecisionPanel|<BulkDecisionPanel/);
  assert.doesNotMatch(mainPageMarkup, /selectedDetail|activeBulk|detailLoading/);
});

test("bulk drawer shows target, totals, evidence, mapping versions, and selectable products", () => {
  assert.match(component, /chosenOrders/);
  assert.match(component, /group\.label/);
  assert.match(component, /product\.recommendation\?\.evidence\.identityMatch/);
  assert.match(component, /product\.recommendation\?\.evidence\.scope/);
  assert.match(component, /Version \{product\.mappingVersion\}/);
  assert.match(component, /type="checkbox"/);
});

test("review projection returns distinct sorted source prices and both drawers render all price states", () => {
  assert.match(priceSafetyMigration, /array_agg\(distinct o\.gross_amount order by o\.gross_amount\)/);
  assert.match(priceSafetyMigration, /coalesce\(pr\.observed_prices, '\{\}'::numeric\[\]\) as observed_prices/);
  assert.match(route, /observed_prices/);
  assert.match(route, /observedPrices:Array\.isArray\(row\.observed_prices\)/);
  assert.match(component, /Observed prices:/);
  assert.match(component, /Product price:/);
  assert.match(component, /Product price: unavailable/);
  assert.equal((component.match(/priceEvidenceLabel\(product\.observedPrices\)/g) || []).length, 2);
  assert.doesNotMatch(component, /grossRevenue\s*\/\s*product\.orderCount|gross_revenue\s*\/\s*order_count/);
});

test("Growth Partner correction removes ambiguous exact IDs without changing decisions or approved projections", () => {
  assert.match(priceSafetyMigration, /match_value in \('ZvpxR', 'JEoZJ'\)/);
  assert.match(priceSafetyMigration, /status = 'inactive'/);
  assert.match(priceSafetyMigration, /discounted_price_does_not_establish_funnel_identity/);
  assert.doesNotMatch(priceSafetyMigration, /update public\.commerce_provider_products|insert into public\.commerce_product_mapping_decisions|update public\.commerce_product_mapping_decisions/);
  assert.doesNotMatch(priceSafetyMigration, /GwlZL|Kz0GM|q6zw2|pLWqN|1EJBm/);
  const seededAliases = readFileSync(new URL("../../supabase/migrations/20260830173500_expand_pbs_catalog_and_seed_mapping_intelligence.sql", import.meta.url), "utf8").match(/with aliases[\s\S]*?insert into public\.commerce_product_mapping_rules/)?.[0] || "";
  assert.doesNotMatch(seededAliases, /growth partner/i);
});

test("price evidence corroborates identity but cannot independently establish it", () => {
  assert.match(intelligence, /Price is corroboration only/);
  assert.match(intelligence, /identityMatches/);
  assert.match(intelligence, /priceEvidence/);
  const noIdentityPromotion = intelligence.match(/const matched = rules[\s\S]*?const best = matched\[0\]/)?.[0] || "";
  assert.match(noIdentityPromotion, /identityMatches\(row\.rule, candidate\)/);
  assert.doesNotMatch(noIdentityPromotion, /price\.weight[^\n]*filter/);
});

test("checkout identities remain distinct, may share Front End via registry, and import preserves approval", () => {
  const ids = ["o2GYY", "Jz71g", "4KV26", "xz1kz"];
  assert.equal(new Set(ids).size, 4);
  assert.doesNotMatch(route, /insert into public\.platform_orders|update public\.platform_orders|offer_variants.*insert/i);
  const productUpsert = ingestion.match(/insert into public\.commerce_provider_products[\s\S]*?;\n/)?.[0] || "";
  assert.doesNotMatch(productUpsert, /mapping_status\s*=/);
  assert.doesNotMatch(productUpsert, /mapping_version\s*=/);
  assert.doesNotMatch(productUpsert, /canonical_offer_id\s*=/);
});

test("bulk review revalidates current versions and recommendations before one atomic guarded RPC", () => {
  assert.match(bulkRoute, /requirePermission\(resolved\.session, "offers\.manage"\)/);
  assert.match(bulkRoute, /sameOrigin\(request\)/);
  assert.match(bulkRoute, /confirm-bulk-product-mapping-decisions/);
  assert.match(bulkRoute, /const reason = String\(body\.reason \|\| ""\)\.trim\(\)/);
  assert.match(bulkRoute, /commerce_product_mapping_review_v1\?/);
  assert.match(bulkRoute, /String\(row\.mapping_version\) !== versions\.get/);
  assert.match(bulkRoute, /loadProductMappingRecommendations/);
  assert.match(bulkRoute, /bulk_recommendation_changed/);
  assert.match(bulkRoute, /rpc\/decide_commerce_product_mapping_bulk/);
  assert.doesNotMatch(bulkRoute, /decideProductMapping\s*\(/);
  assert.equal((component.match(/fetch\("\/api\/commerce\/product-mappings\/bulk"/g) || []).length, 1);
  assert.equal((component.match(/fetch\("\/api\/commerce\/product-mappings",/g) || []).length, 1);
});

test("bulk decisions fail atomically on a stale item while manual single-product review remains available", () => {
  assert.match(bulkMigration, /p_expected_mapping_version\s*=>\s*v_expected_mapping_version/);
  assert.match(bulkMigration, /any stale item rolls back the full batch/);
  assert.match(bulkRoute, /stale_mapping_version/);
  assert.match(component, /Nothing was saved/);
  assert.match(component, /Manual review/);
  assert.match(component, /Review<\/button>/);
});

test("product-health evaluator remains the sole owner of alert and work-item resolution", () => {
  assert.doesNotMatch(route, /(insert into|update|delete from).*tracekit_operational_alerts/i);
  assert.doesNotMatch(route, /(insert into|update|delete from).*work_items/i);
  assert.doesNotMatch(bulkRoute, /(insert into|update|delete from).*tracekit_operational_alerts/i);
  assert.doesNotMatch(bulkRoute, /(insert into|update|delete from).*work_items/i);
  assert.match(route, /alertReconciliation:"pending_evaluator"/);
  assert.match(bulkRoute, /alertReconciliation: "pending_evaluator"/);
  assert.match(alerts, /product_unmapped/);
  assert.match(alerts, /resolve/);
});

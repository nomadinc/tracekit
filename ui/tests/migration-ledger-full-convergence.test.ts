import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const migration = (file: string) => new URL(`supabase/migrations/${file}`, root);
const archive = (file: string) => new URL(`supabase/history/non-deployable/migrations/${file}`, root);
const sha256 = (file: string) => createHash("sha256").update(readFileSync(migration(file))).digest("hex");

const reconciled = [
  [
    "085_typed_credential_active_uniqueness.sql",
    "20260917213752_typed_credential_active_uniqueness.sql"
  ],
  [
    "086_restore_commerce_webhook_receipts.sql",
    "20260917222939_restore_commerce_webhook_receipts.sql"
  ],
  [
    "087_restore_commerce_order_lines_id_default.sql",
    "20260918032437_restore_commerce_order_lines_id_default.sql"
  ],
  [
    "088_restore_next29_subscription_dispute_schema.sql",
    "20260918051637_restore_next29_subscription_dispute_schema.sql"
  ],
  [
    "097_commas_order_identity_projection.sql",
    "20260829070453_commas_order_identity_projection.sql"
  ],
  [
    "098_everflow_batched_order_backfill.sql",
    "20260830025716_everflow_batched_order_backfill.sql"
  ],
  [
    "099_everflow_order_linkage_v2.sql",
    "20260830032255_everflow_order_linkage_v2.sql"
  ],
  [
    "100_everflow_order_linkage_v2_metadata_fix.sql",
    "20260830032304_everflow_order_linkage_v2_metadata_fix.sql"
  ],
  [
    "101_everflow_cron_runtime_telemetry.sql",
    "20260830041705_everflow_cron_runtime_telemetry.sql"
  ],
  [
    "102_everflow_reconciliation_lookup_indexes.sql",
    "20260830053340_everflow_reconciliation_lookup_indexes.sql"
  ],
  [
    "103_everflow_reconciliation_pg_cron.sql",
    "20260830053927_everflow_reconciliation_pg_cron.sql"
  ],
  [
    "104_everflow_financial_projection_idempotency.sql",
    "20260830194215_everflow_financial_projection_idempotency.sql"
  ],
  [
    "105_everflow_checkout_bundle_linkage_v3.sql",
    "20260830222732_everflow_checkout_bundle_linkage_v3.sql"
  ],
  [
    "106_everflow_linkage_refinements_v4.sql",
    "20260831031559_everflow_linkage_refinements_v4.sql"
  ],
  [
    "107_everflow_duplicate_confidence_band.sql",
    "20260831031651_everflow_duplicate_confidence_band.sql"
  ],
  [
    "108_everflow_financial_reconciliation_v1.sql",
    "20260831040203_everflow_financial_reconciliation_v1.sql"
  ],
  [
    "109_everflow_financial_reconciliation_v2.sql",
    "20260831043314_everflow_financial_reconciliation_v2.sql"
  ],
  [
    "110_everflow_click_events.sql",
    "20260902024816_everflow_click_events.sql"
  ],
  [
    "111_everflow_cron_deployment_provenance.sql",
    "20260904052500_everflow_cron_deployment_provenance.sql"
  ],
  [
    "20260830193000_atomic_bulk_product_mapping_decisions.sql",
    "20260830193254_atomic_bulk_product_mapping_decisions.sql"
  ],
  [
    "20260831045228_commas_deep_reconciliation_cadence_lifecycle.sql",
    "20260831054841_commas_deep_reconciliation_cadence_lifecycle.sql"
  ],
  [
    "20260903002350_commas_provider_observed_attribution_foundation.sql",
    "20260903054329_commas_provider_observed_attribution_foundation.sql"
  ],
  [
    "20260910151937_everflow_firehose_v1.sql",
    "20260910161316_everflow_firehose_v1.sql"
  ],
  [
    "20260911210000_commas_dispute_overlap_idempotency.sql",
    "20260911211717_commas_dispute_overlap_idempotency.sql"
  ],
  [
    "20260913223346_reconcile_commas_provider_observations_v2.sql",
    "20260913224039_reconcile_commas_provider_observations_v2.sql"
  ],
  [
    "20260914034700_commas_attribution_measurement_epoch_v1.sql",
    "20260914043832_commas_attribution_measurement_epoch_v1.sql"
  ],
  [
    "20260914034800_commas_attribution_quality_read_v1.sql",
    "20260914043837_commas_attribution_quality_read_v1.sql"
  ],
  [
    "20260914044200_commas_attribution_conflicts_set_based_v2.sql",
    "20260914045641_commas_attribution_conflicts_set_based_v2.sql"
  ],
  [
    "20260914213000_commas_refund_seller_cost_correction_foundation.sql",
    "20260915051911_commas_refund_seller_cost_correction_foundation.sql"
  ],
  [
    "20260914213100_commas_refund_seller_cost_correction_execution.sql",
    "20260915051929_commas_refund_seller_cost_correction_execution.sql"
  ],
  [
    "20260914213200_commas_refund_seller_cost_correction_fingerprint.sql",
    "20260915051946_commas_refund_seller_cost_correction_fingerprint.sql"
  ],
  [
    "20260915151000_shopify_everflow_utm_normalization.sql",
    "20260915152942_shopify_everflow_utm_normalization.sql"
  ],
  [
    "20260919054000_core_commerce_relationships_explain_v1.sql",
    "20260919053748_core_commerce_relationships_explain_v1.sql"
  ],
  [
    "20260919055500_backfill_explain_provider_relationships.sql",
    "20260919060613_backfill_explain_provider_relationships.sql"
  ],
  [
    "20260919061500_explain_method_relationship_safety.sql",
    "20260919062742_explain_method_relationship_safety.sql"
  ],
  [
    "20260919064500_commerce_transaction_relationship_evidence.sql",
    "20260919214602_commerce_transaction_relationship_evidence.sql"
  ],
  [
    "20260919232000_checkoutchamp_transaction_attribution_evidence.sql",
    "20260919233921_checkoutchamp_transaction_attribution_evidence.sql"
  ],
  [
    "20260919235500_checkoutchamp_managed_evidence_payload.sql",
    "20260920000304_checkoutchamp_managed_evidence_payload.sql"
  ],
  [
    "20260921061000_commas_direct_attribution_hardening.sql",
    "20260921222059_commas_direct_attribution_hardening.sql"
  ],
  [
    "20260922025000_commas_journey_assignment_repair.sql",
    "20260922025056_commas_journey_assignment_repair.sql"
  ],
  [
    "20260922030000_fix_commas_journey_repair_status.sql",
    "20260922034620_fix_commas_journey_repair_status.sql"
  ],
  [
    "20260922041500_commas_everflow_backfill_batched.sql",
    "20260922043023_commas_everflow_backfill_batched.sql"
  ],
  [
    "20260922053000_commas_everflow_fast_batch_v2.sql",
    "20260922054757_commas_everflow_fast_batch_v2.sql"
  ],
  [
    "20260923053000_commas_provider_tkid_contract.sql",
    "20260923052449_commas_provider_tkid_contract.sql"
  ],
  [
    "20260923063000_push_button_tkid_source.sql",
    "20260923062629_push_button_tkid_source.sql"
  ],
  [
    "20260924021000_ecowatt_tkid_pilot_source.sql",
    "20260924024012_ecowatt_tkid_pilot_source.sql"
  ]
] as const;
const expectedHashes: Record<string,string> = {
  "20260917213752_typed_credential_active_uniqueness.sql": "0024f780ac1a474cffe78ad55adb9871c2b687dc81c3695ee070f6c757be0a89",
  "20260917222939_restore_commerce_webhook_receipts.sql": "3104b3b8042f36f388930cbd89795d09991008d62aca845d278985649df6005f",
  "20260918032437_restore_commerce_order_lines_id_default.sql": "0b362bdc314b25c8e1f0824d821f0a4a6ecd7f20876de3eaccc34c4bc67126aa",
  "20260918051637_restore_next29_subscription_dispute_schema.sql": "379167c881f10c75fdf4a5ee97a61ffb11c122f133445652adb0a138669ec068",
  "20260829070453_commas_order_identity_projection.sql": "97a6a8cf61eaa94c2d45768ec6d5e69ef0e6f59cd9ee8a3740ae5fc4171a62e0",
  "20260830025716_everflow_batched_order_backfill.sql": "57fc9b3c799bf4de4ba76695115ab9ae6d0b259350d880d31468940e2f193799",
  "20260830032255_everflow_order_linkage_v2.sql": "1b56af3c0d2abe6757508420d7aeb30903640ff687d1bea6d8cc510877da2c5e",
  "20260830032304_everflow_order_linkage_v2_metadata_fix.sql": "5986583224f80fefd30980bbaa9a9f9e235977ad74219ef99b8a5f58aef887fc",
  "20260830041705_everflow_cron_runtime_telemetry.sql": "be4728c610e94773882a10920aa0f3b9e617e6f7ca7b899d0f10ce8515b990d3",
  "20260830053340_everflow_reconciliation_lookup_indexes.sql": "9a437af46edb073673d8c258d1c2fae23fa7a53bf41aeab42d02de28097f245b",
  "20260830053927_everflow_reconciliation_pg_cron.sql": "2cccc10978ddbca32c18010f7dc91efdc6faa1d70091e1f3389af48ab44e4a4b",
  "20260830194215_everflow_financial_projection_idempotency.sql": "584b8760eccafea35e3927d4f21d75dbc899ec5c1219761e5a711cce7bc49cb0",
  "20260830222732_everflow_checkout_bundle_linkage_v3.sql": "35c27f2754330ca8fcc0207291ef56272abbceacb4f05f05bfd21d5e3341dbaa",
  "20260831031559_everflow_linkage_refinements_v4.sql": "b9d25e8eae0e70c88002808f5c5e683facb71c7fd6ed27c95c8bbf6a9e66e4bc",
  "20260831031651_everflow_duplicate_confidence_band.sql": "4e205b702de38f5ae14759fce061c026e7fa0ecbdd2f63ae4a697508ef737bca",
  "20260831040203_everflow_financial_reconciliation_v1.sql": "851272ea99b5f1af715d44eae421b0f885954436fab01c6b0407b5f88e41d332",
  "20260831043314_everflow_financial_reconciliation_v2.sql": "b6afddc5cc68ff6376d31a714e808ad8fa5a724d4593a361ac650dfdaf94ed00",
  "20260902024816_everflow_click_events.sql": "3cc37a778f7944ff51ee6ce746136a13b3419e2ef1c029df6f99afb112b3a08d",
  "20260904052500_everflow_cron_deployment_provenance.sql": "45967e1a9534aff69152e915470e09c79514d0610cb8e6f575aadb3d01dc27d0",
  "20260830193254_atomic_bulk_product_mapping_decisions.sql": "7b39bb60197369365b778f08ef4ad63be5dfc93d933f67531756118268a505a1",
  "20260831054841_commas_deep_reconciliation_cadence_lifecycle.sql": "b6397643a2330ff89039620a7c9545f93cb606e363f5e15c6f9fe14c1bc5fe6b",
  "20260903054329_commas_provider_observed_attribution_foundation.sql": "73c1d86c0c1542e6dc7bc106c9de7189a8099b35da3c4be87a27260d15df8071",
  "20260910161316_everflow_firehose_v1.sql": "5edfaac30a1c4297e8008b77fc4044473fa412707392c2d8f1cff9599bda9c1b",
  "20260911211717_commas_dispute_overlap_idempotency.sql": "a0453e866a0c7f71cc945fcb5b98706178cee38629ba8d116d561efbe3926c0d",
  "20260913224039_reconcile_commas_provider_observations_v2.sql": "891fedc6797eadb3b208d0f50adfe8e4024cbc712f85e0d5ff7150a990a531e0",
  "20260914043832_commas_attribution_measurement_epoch_v1.sql": "08d9a8be6b247451b799cdb882629f7f9e2f6628671314ff85b22f0a1add5da7",
  "20260914043837_commas_attribution_quality_read_v1.sql": "dfddd3dece4d6d70a6638d5818b0b2b13a47d0df3c9af92f1dd3faa12d35e98a",
  "20260914045641_commas_attribution_conflicts_set_based_v2.sql": "6c7983a18700ca7e368bfd8c502ee89e342d07f24a1829ebf78c8c265f689a48",
  "20260915051911_commas_refund_seller_cost_correction_foundation.sql": "160c53935a50c9df27b446c32a5c4732873b91ca840b6c3006560de2efc61b0d",
  "20260915051929_commas_refund_seller_cost_correction_execution.sql": "2c8026db23e405053993c4b3386f8ef0ce7568eb4a38d5ee7a4c7f8f3a76b9b5",
  "20260915051946_commas_refund_seller_cost_correction_fingerprint.sql": "b8dc4d622cbe2aedf9372009bd758d5edafa8a7a0c39ed3d6c7837c109848ce2",
  "20260915152942_shopify_everflow_utm_normalization.sql": "8bf6f9300f9d81c6f34d9ee165aa488238568b26ea050143bf1121ab303bc8c0",
  "20260919053748_core_commerce_relationships_explain_v1.sql": "91d4aed5aae65534f384c956e90c268d879aa5ac2c10e7367ce311c4edf0a85f",
  "20260919060613_backfill_explain_provider_relationships.sql": "2b5aa5ccc9c225b8fb7e859277b62d0d582aa698d324c2571be6562808fd9237",
  "20260919062742_explain_method_relationship_safety.sql": "8e09577f798f98fab5b93a753517dbf92365c31b329f5757f19c0c97e8ce2608",
  "20260919214602_commerce_transaction_relationship_evidence.sql": "ea21fdb718e87274398a2278e012851c241a5b8f3ebbf688009bf0227c18e650",
  "20260919233921_checkoutchamp_transaction_attribution_evidence.sql": "8036aa93e98f95882905f5aa0ab75f6e37cdf969a722177070620d484841b172",
  "20260920000304_checkoutchamp_managed_evidence_payload.sql": "a278eb1ed7c9282d0c19574d7c84dffa56e2548993f098217a23851bd2efdacc",
  "20260921222059_commas_direct_attribution_hardening.sql": "382bdf1884b17839fe42631b4da00653d9a3394b44ae41f99dbafaf3b1a49716",
  "20260922025056_commas_journey_assignment_repair.sql": "4b65086ad004032ee72cb4bb37dc6c24513c5823f83e285d275d1bb580ed771e",
  "20260922034620_fix_commas_journey_repair_status.sql": "fb5461bf6aa5bdcf853a7bbdb039123345a548bb3e80e86e931e51d0229896b3",
  "20260922043023_commas_everflow_backfill_batched.sql": "4ef0c0bfbbe709b20c9f674afc3c1fe2057fbecc85242ff4bb2ae877512c6395",
  "20260922054757_commas_everflow_fast_batch_v2.sql": "10b4859d9864fabdae9fdceb957afb6a1376c8d71f5f9f9ee5b63ce70eda8a84",
  "20260923052449_commas_provider_tkid_contract.sql": "731aedfa0542ac4bc2ebd939a52850379b3818d5c2dd0b603616da4b33966ab6",
};

test("all 46 Production-backed identities are exact and 44 ordinary rename bodies stay locked", () => {
  assert.equal(reconciled.length, 46);
  for (const [oldFile, productionFile] of reconciled) {
    assert.equal(existsSync(migration(oldFile)), false, oldFile);
    assert.equal(existsSync(migration(productionFile)), true, productionFile);
    if (productionFile in expectedHashes) assert.equal(sha256(productionFile), expectedHashes[productionFile], productionFile);
  }
  assert.equal(Object.keys(expectedHashes).length, 44);
});

test("archived and superseded histories are not deployable", () => {
  const archived = [
    "20260827195221_resume_ordering_evidence_only_reserved_recovery.sql",
    "20260828031038_extend_normal_continuous_acceptance_five_pages.sql",
    "20260828035438_fixed_five_page_acceptance_redelivery.sql",
    "20260828175904_automatic_scheduled_quota_bootstrap.sql",
    "20260829053120_commerce_connection_pause_contract.sql",
    "20260830042825_improve_commerce_product_health_statistics.sql",
    "20260830053413_commerce_product_mapping_review_workflow.sql",
    "20260830044726_guard_commerce_product_mapping_decisions.sql",
    "20260901040000_commerce_subscriptions_v1.sql",
    "20260901050000_commerce_webhook_receipts_v1.sql",
    "20260901060000_generalize_commerce_dispute_observations.sql",
    "20260902030000_next29_incremental_scheduler_foundation.sql",
    "20260902043000_next29_scheduler_dispatch_runtime.sql",
    "20260911053000_commerce_order_lines_id_default.sql",
  ];
  for (const file of archived) {
    assert.equal(existsSync(archive(file)), true, file);
    assert.equal(existsSync(migration(file)), false, file);
  }

  for (const file of [
    "20260827221607_normal_continuous_shadow_acceptance.sql",
    "20260830033844_commerce_product_mapping_health.sql",
    "20260830041026_optimize_commerce_product_mapping_health.sql",
    "20260910060000_commerce_source_mapping_subscription_type.sql",
    "20260916190000_commerce_credentials_by_type.sql",
  ]) assert.equal(existsSync(migration(file)), false, file);

  assert.equal(readdirSync(new URL("supabase/history/non-deployable/", root)).includes("migrations"), true);

  const archiveHashes: Record<string,string> = {
    "20260830044726_guard_commerce_product_mapping_decisions.sql": "1cba4263d4160c07a57736989fcc5e8e2cab0b2aa7e4a08121074753f76bd6f6",
    "20260901040000_commerce_subscriptions_v1.sql": "7be162177fe462c4cd8682dd210afe0d146e04a7ffddc9d0d44bd96be08217c1",
    "20260901050000_commerce_webhook_receipts_v1.sql": "9dfc5d42dfa66ed84d8443d0d2a4a609c0dd9f2437a6b8b9ca903bf08b56dc44",
    "20260901060000_generalize_commerce_dispute_observations.sql": "323cd8813ade190ac19403e43914ef5bd736105fa7e785cab3f413bbfc354e52",
    "20260902030000_next29_incremental_scheduler_foundation.sql": "082b480358fe0fa940e79d53ab2654a1d05ce245875f3305a438254e2972f6a6",
    "20260902043000_next29_scheduler_dispatch_runtime.sql": "16bb9c6c876477e97482556c49f16f0990c5b83d2e62394325c073690ee0ab8c",
    "20260911053000_commerce_order_lines_id_default.sql": "c5ace6608e63913e17142d9b59f1e4a554df028e5e268911cc3a9228387cbb26",
  };
  for (const [file, hash] of Object.entries(archiveHashes)) {
    assert.equal(createHash("sha256").update(readFileSync(archive(file))).digest("hex"), hash, file);
  }
});

test("applied recoveries are self-contained and the duplicate has a local compatibility identity", () => {
  const next29 = readFileSync(migration("20260918054652_restore_next29_scheduler_rpcs.sql"), "utf8");
  for (const name of ["ensure_next29_resource_schedules","claim_next29_resource_schedule","finish_next29_resource_schedule","list_due_next29_resource_schedules","heartbeat_next29_resource_schedule"]) assert.match(next29, new RegExp(`create or replace function public\\.${name}`));
  const webhook = readFileSync(migration("20260917222939_restore_commerce_webhook_receipts.sql"), "utf8");
  assert.match(webhook, /create table if not exists public\.commerce_webhook_receipts/);
  const subscription = readFileSync(migration("20260918051637_restore_next29_subscription_dispute_schema.sql"), "utf8");
  assert.match(subscription, /create table if not exists public\.commerce_subscriptions/);
  assert.match(subscription, /create table if not exists public\.commerce_provider_dispute_observations/);
  const lines = readFileSync(migration("20260918032437_restore_commerce_order_lines_id_default.sql"), "utf8");
  assert.match(lines, /alter table public\.commerce_order_lines[\s\S]*gen_random_uuid\(\)/);
  assert.equal(existsSync(migration("20260922034633_fix_commas_journey_repair_status.sql")), true);
});

test("three applied historical body exceptions are explicit and narrowly bounded", () => {
  const push = readFileSync(migration("20260923062629_push_button_tkid_source.sql"), "utf8");
  const eco = readFileSync(migration("20260924024012_ecowatt_tkid_pilot_source.sql"), "utf8");
  const review = readFileSync(migration("20260830220012_add_product_mapping_price_evidence_and_correct_growth_partner.sql"), "utf8");
  for (const sql of [push, eco]) {
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /not ae and not oe/);
    assert.doesNotMatch(sql, /on conflict/i);
    assert.doesNotMatch(sql, /tracekit_audit_events|dns_verification_challenges/i);
  }
  assert.match(push, /ae61827d-1503-4304-b187-9989390ab8d3/);
  assert.match(push, /66fe24db-452e-4da1-baa7-973709ab8089/);
  assert.match(eco, /b0d5abc3-0663-4586-bf8d-25f4b1b8362e/);
  assert.match(eco, /b784b15c-208d-4a6e-9424-3df9752b36e7/);
  assert.match(eco, /verification_state in \('unissued','issued','verified'\)/);
  const prerequisite = review.slice(review.indexOf("create or replace view public.commerce_product_mapping_health_v1"), review.indexOf("create or replace view public.commerce_product_mapping_review_v1"));
  assert.match(prerequisite, /security_invoker = true/);
  assert.match(prerequisite, /grant select[\s\S]*service_role/);
  assert.doesNotMatch(prerequisite, /create index|create statistics|alter statistics|analyze/i);
});

test("forward migrations precede and preserve the TKID migration", () => {
  const forward = [
    "20260924053000_converge_operational_product_health_state.sql",
    "20260924053100_enable_subscription_source_mapping_type.sql",
    "20260924053200_correct_typed_credential_rotation.sql",
    "20260924055441_provision_tkid_origin_registry_access_v1.sql",
  ];
  for (const file of forward) assert.equal(existsSync(migration(file)), true, file);
  assert.deepEqual(forward.map((file) => BigInt(file.slice(0, 14))), [
    20260924053000n, 20260924053100n, 20260924053200n, 20260924055441n,
  ]);
  assert.equal(readdirSync(new URL("supabase/migrations/", root)).filter((file) => file.includes("provision_tkid_origin_registry_access_v1")).length, 1);
});

test("operational convergence defines generic final state without executing historical actions", () => {
  const sql = readFileSync(migration("20260924053000_converge_operational_product_health_state.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.commerce_normal_acceptance_redelivery_markers/);
  assert.match(sql, /create table if not exists public\.commerce_scheduled_quota_bootstrap_claims/);
  assert.match(sql, /create or replace function public\.claim_scheduled_commerce_quota_bootstrap/);
  assert.match(sql, /create or replace function public\.set_commerce_connection_pause/);
  assert.match(sql, /create statistics if not exists platform_orders_commerce_scope_stats/);
  assert.match(sql, /alter statistics public\.platform_orders_commerce_scope_stats\s+set statistics 500/);
  assert.match(sql, /with \(security_invoker = true\)/);
  assert.match(sql, /platform_orders_commas_product_health_idx/);
  assert.match(sql, /add column if not exists correlation_id text/);
  assert.match(sql, /p_correlation_id text/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /grant execute[\s\S]*decide_commerce_product_mapping[\s\S]*service_role/);
  assert.match(sql, /to_regprocedure\(v_signature\)/);
  assert.match(sql, /uuid,text,uuid,text\)'/);
  assert.match(sql, /uuid,text,text,uuid,text\)'/);
  assert.doesNotMatch(sql, /analyze public\.platform_orders/i);
  assert.doesNotMatch(sql, /select\s+\*\s+from\s+public\.(?:resume_ordering|claim_normal_acceptance|set_commerce_connection_pause)/i);
});

test("subscription and credential forward contracts are narrowly scoped", () => {
  const subscription = readFileSync(migration("20260924053100_enable_subscription_source_mapping_type.sql"), "utf8");
  for (const value of ["person","order","provider_product","canonical_offer","refund","dispute","subscription","financial_event"]) {
    assert.match(subscription, new RegExp(`'${value}'::text`));
  }
  assert.match(subscription, /contains canonical_object_type values outside the forward contract/);

  const credential = readFileSync(migration("20260924053200_correct_typed_credential_rotation.sql"), "utf8");
  assert.match(credential, /commerce_provider_credentials_active_type_uidx/);
  assert.doesNotMatch(credential, /create unique index/i);
  assert.match(credential, /nullif\(btrim\(credential_type\), ''\) is not null/);
  assert.match(credential, /credential_type = p_credential_type/);
  assert.match(credential, /security invoker/i);
  assert.match(credential, /grant execute[\s\S]*service_role/i);
  assert.doesNotMatch(credential, /update public\.commerce_provider_credentials[\s\S]*secret_(?:iv|ciphertext)\s*=/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  IDENTITY_BACKFILL_CONNECTOR_ID,
  IDENTITY_BACKFILL_DISCOVERY_SELECT,
  IDENTITY_BACKFILL_JOB_TYPE,
  IDENTITY_BACKFILL_RESOLVE_SELECT,
  IDENTITY_BACKFILL_TASK_TYPES,
  dateRangeToTimestamps,
  extractIdentityEvidenceFromPlatformOrder,
  hasIdentityEvidence,
  identityBackfillFinalizeStatus,
  identityBackfillResolveDedupeKey,
  isSupportedIdentityBackfillPlatformOrder,
  normalizeIdentityBackfillPlatforms,
  normalizeIdentityBackfillRequest,
  parseIdentityBackfillCursor,
  serializeIdentityBackfillCursor,
} from "./identity-backfill-runtime.ts";
import {
  connectorRuntimeMetadata,
  createConnectorRuntimeProgress,
  isConnectorRuntimeV1Job,
  selectConnectorRuntimeJobForStart,
} from "./connector-runtime.ts";

test("normalizes identity backfill request with defaults and force-new aliases", () => {
  const result = normalizeIdentityBackfillRequest({
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    batchSize: 250,
    dryRun: true,
    forceNewJob: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.workspace_id, "default");
    assert.deepEqual(result.value.platforms, ["wowboost", "wowsuite:wowboost"]);
    assert.equal(result.value.batch_size, 100);
    assert.equal(result.value.dry_run, true);
    assert.equal(result.value.force_new_job, true);
  }
});

test("rejects invalid identity backfill date ranges", () => {
  assert.equal(normalizeIdentityBackfillRequest({ from: "2026-07-13", to: "2026-04-01" }).ok, false);
  assert.equal(normalizeIdentityBackfillRequest({ from: "bad", to: "2026-04-01" }).ok, false);
  assert.equal(normalizeIdentityBackfillRequest({ from: "2026-04-01" }).ok, false);
});

test("filters supported platforms and excludes WowPay", () => {
  assert.deepEqual(normalizeIdentityBackfillPlatforms(["wowboost", "wowsuite:wowboost", "wowpay", "wowsuite:wowpay", "wowsuite"]), [
    "wowboost",
    "wowsuite:wowboost",
    "wowsuite",
  ]);
});

test("date range uses inclusive from and next-day exclusive to", () => {
  assert.deepEqual(dateRangeToTimestamps("2026-04-01", "2026-07-13"), {
    from_ts: "2026-04-01T00:00:00.000Z",
    to_exclusive_ts: "2026-07-14T00:00:00.000Z",
  });
});

test("cursor serializes compound platform and platform order id", () => {
  const serialized = serializeIdentityBackfillCursor({
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:117445",
  });
  assert.equal(serialized, "{\"current_platform\":\"wowsuite:wowboost\",\"platform_order_id\":\"wowsuite:wowboost:117445\"}");
  assert.deepEqual(parseIdentityBackfillCursor(serialized, ["wowboost", "wowsuite:wowboost"]), {
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:117445",
  });
});

test("classifies only confident WowBoost platform orders for identity backfill", () => {
  assert.equal(isSupportedIdentityBackfillPlatformOrder({ platform: "wowboost", platform_order_id: "wowboost:1" }), true);
  assert.equal(isSupportedIdentityBackfillPlatformOrder({ platform: "wowsuite:wowboost", platform_order_id: "wowsuite:wowboost:1" }), true);
  assert.equal(isSupportedIdentityBackfillPlatformOrder({ platform: "wowpay", platform_order_id: "wowpay:1" }), false);
  assert.equal(isSupportedIdentityBackfillPlatformOrder({ platform: "wowsuite:wowpay", platform_order_id: "wowsuite:wowpay:1" }), false);
  assert.equal(isSupportedIdentityBackfillPlatformOrder({
    platform: "wowsuite",
    platform_order_id: "wowsuite:wowboost:105330",
  }), true);
  assert.equal(isSupportedIdentityBackfillPlatformOrder({
    platform: "wowsuite",
    platform_order_id: "wowsuite:unknown:105330",
    raw_json: { "Order ID": "105330", "Order Number": "25105330" },
  }), true);
});

test("runtime select lists use persisted platform_orders columns only", () => {
  assert.equal(IDENTITY_BACKFILL_DISCOVERY_SELECT, "workspace_id,platform,platform_order_id,order_ts,person_id,raw_json");
  assert.equal(IDENTITY_BACKFILL_DISCOVERY_SELECT.includes("customer_email"), false);
  assert.equal(IDENTITY_BACKFILL_DISCOVERY_SELECT.includes("customer_phone"), false);

  const resolveColumns = IDENTITY_BACKFILL_RESOLVE_SELECT.split(",");
  assert.ok(resolveColumns.includes("customer_email"));
  assert.ok(resolveColumns.includes("customer_email_normalized"));
  assert.ok(resolveColumns.includes("phone"));
  assert.ok(resolveColumns.includes("raw_json"));
  assert.equal(resolveColumns.includes("customer_phone"), false);
  assert.equal(resolveColumns.includes("customer_id"), false);
  assert.equal(resolveColumns.includes("platform_customer_id"), false);
  assert.equal(resolveColumns.includes("external_customer_id"), false);
  assert.equal(resolveColumns.includes("customer_name"), false);
});

test("extracts deterministic identity evidence from WowBoost platform orders", async () => {
  const evidence = await extractIdentityEvidenceFromPlatformOrder({
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_id: "105330",
    commerce_reference: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    order_ts: "2026-07-13T12:00:00.000Z",
    customer_email: " Customer@Example.COM ",
    phone: "+1 (555) 111-2222",
    raw_json: {
      "Customer ID": "CUST-123",
      "Customer Name": "Ada Example",
      "First Name": "Ada",
      "Last Name": "Example",
      "TransactionId": "ce1b46d8-e744-426d-8e34-b5db88d7a2e8",
    },
  });

  assert.equal(hasIdentityEvidence(evidence), true);
  assert.deepEqual(evidence.identifiers.map((identifier) => identifier.identifier_type).sort(), [
    "email",
    "order_customer_id",
    "phone",
  ]);
  assert.equal(evidence.source_record_id, "wowboost:105330");
  assert.equal(evidence.observed_at, "2026-07-13T12:00:00.000Z");
  assert.equal(evidence.attributes.display_name, "Ada Example");
  assert.ok(evidence.warnings.includes("commerce_reference_not_used_for_person_identity"));
  assert.ok(evidence.warnings.includes("attribution_or_payment_identifier_not_used_for_person_identity"));
});

test("customer identifiers and names are extracted from raw_json, not assumed typed columns", async () => {
  const evidence = await extractIdentityEvidenceFromPlatformOrder({
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_ts: "2026-07-13T12:00:00.000Z",
    customer_id: "SHOULD-NOT-BE-USED",
    customer_name: "Typed Name",
    raw_json: {
      "Customer ID": "RAW-CUST-123",
      "Customer Name": "Raw Name",
    },
  });

  assert.deepEqual(evidence.identifiers.map((identifier) => ({
    type: identifier.identifier_type,
    value: identifier.value,
  })), [{ type: "order_customer_id", value: "RAW-CUST-123" }]);
  assert.equal(evidence.attributes.display_name, "Raw Name");
});

test("does not use unsafe phone, order number, amount, shipping reference, or commerce reference as person identity", async () => {
  const evidence = await extractIdentityEvidenceFromPlatformOrder({
    platform: "wowboost",
    platform_order_id: "wowboost:105330",
    order_id: "105330",
    commerce_reference: "4F4DA0F1-3DEE-437B-A849-32E7B25D174C",
    gross_amount: 99.99,
    raw_json: {
      "Order Number": "25105330",
      ShippingReference: "25105330N",
      Phone: "5551112222",
    },
  });

  assert.equal(hasIdentityEvidence(evidence), false);
  assert.ok(evidence.warnings.some((warning) => warning.includes("country_context_required")));
  assert.ok(evidence.warnings.includes("commerce_reference_not_used_for_person_identity"));
});

test("stable resolve batch dedupe keys are deterministic", () => {
  const key = identityBackfillResolveDedupeKey("job-1", ["wowboost:1", "wowboost:2"]);
  assert.equal(key, "identity_resolve_batch:job-1:wowboost:1:wowboost:2:2");
});

test("identity backfill runtime progress is marked as Connector Runtime v1", () => {
  const progress = createConnectorRuntimeProgress({
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    phase: "discover_unlinked_records",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      metadata: { platforms: ["wowboost"], dry_run: true },
    }),
  });

  assert.equal(isConnectorRuntimeV1Job({ progress }, IDENTITY_BACKFILL_CONNECTOR_ID), true);
  assert.equal(progress.phase, "discover_unlinked_records");
  assert.equal(progress.metadata.dry_run, true);
});

test("legacy jobs are not reused for identity backfill runtime v1", () => {
  const legacyJob = {
    id: "legacy-identity-job",
    platform: "identity",
    status: "running",
    from_date: "2026-04-01",
    to_date: "2026-07-13",
    filter: IDENTITY_BACKFILL_JOB_TYPE,
    progress: {
      workspace_id: "default",
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      job_type: IDENTITY_BACKFILL_JOB_TYPE,
      requested_from: "2026-04-01",
      requested_to: "2026-07-13",
    },
  };

  const selected = selectConnectorRuntimeJobForStart({
    jobs: [legacyJob],
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
  });

  assert.equal(selected, null);
});

test("active identity runtime jobs dedupe while force_new_job bypasses reuse", () => {
  const runtimeJob = {
    id: "identity-runtime-job",
    status: "queued",
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: IDENTITY_BACKFILL_CONNECTOR_ID }),
  };

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [runtimeJob],
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
  })?.id, "identity-runtime-job");

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [runtimeJob],
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    force_new_job: true,
  }), null);
});

test("explicit identity runtime job_id resumes only marked runtime jobs", () => {
  const runtimeJob = {
    id: "identity-runtime-job",
    status: "failed",
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({ connector_id: IDENTITY_BACKFILL_CONNECTOR_ID }),
  };
  const legacyJob = {
    id: "legacy-identity-job",
    status: "running",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
  };

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [legacyJob, runtimeJob],
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    explicit_job_id: "identity-runtime-job",
  })?.id, "identity-runtime-job");

  assert.equal(selectConnectorRuntimeJobForStart({
    jobs: [legacyJob, runtimeJob],
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    explicit_job_id: "legacy-identity-job",
  }), null);
});

test("identity backfill task type names are durable", () => {
  assert.equal(IDENTITY_BACKFILL_TASK_TYPES.discover, "identity_backfill_discover_unlinked_records");
  assert.equal(IDENTITY_BACKFILL_TASK_TYPES.resolve, "identity_backfill_resolve_identity_batch");
  assert.equal(IDENTITY_BACKFILL_TASK_TYPES.finalize, "identity_backfill_validate_and_finalize");
});

test("finalize status reflects unresolved or review work", () => {
  assert.equal(identityBackfillFinalizeStatus({
    remaining_unlinked: 0,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  }), "completed");
  assert.equal(identityBackfillFinalizeStatus({
    remaining_unlinked: 1,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  }), "completed_with_errors");
});

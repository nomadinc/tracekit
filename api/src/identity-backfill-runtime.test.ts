import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  IDENTITY_BACKFILL_CONNECTOR_ID,
  IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
  IDENTITY_BACKFILL_DISCOVERY_INDEX,
  IDENTITY_BACKFILL_DISCOVERY_SELECT,
  IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES,
  IDENTITY_BACKFILL_JOB_TYPE,
  IDENTITY_BACKFILL_MAX_BATCH_SIZE,
  IDENTITY_BACKFILL_RESOLVE_SELECT,
  IDENTITY_BACKFILL_TARGET_DIAGNOSTIC_PLATFORM_ORDER_ID,
  IDENTITY_BACKFILL_TASK_TYPES,
  createIdentityBackfillDiscoveryState,
  dateRangeToTimestamps,
  extractIdentityEvidenceFromPlatformOrder,
  hasIdentityEvidence,
  identityBackfillTargetDiagnosticEventName,
  identityBackfillDiscoverySummary,
  identityBackfillDryRunFinalizeCounts,
  identityBackfillFinalizeStatus,
  identityBackfillResolveContinuationDedupeKey,
  identityBackfillResolveDedupeKey,
  identityBackfillResolveRemainingIds,
  identityBackfillResolveSubrequestLimitCheckpoint,
  identityBackfillRuntimeConfigMatches,
  isIdentityBackfillTargetDiagnosticRecord,
  isSupportedIdentityBackfillPlatformOrder,
  markIdentityBackfillPlatformDiscovery,
  maskIdentityBackfillDiagnosticValue,
  mergeIdentityBackfillResolveMetricMetadata,
  normalizeIdentityBackfillBatchSize,
  normalizeIdentityBackfillPlatforms,
  normalizeIdentityBackfillRequest,
  parseIdentityBackfillCursor,
  previewIdentityResolutionReadOnly,
  serializeIdentityBackfillCursor,
  shouldCheckpointIdentityBackfillResolveBatch,
} from "./identity-backfill-runtime.ts";
import {
  compactConnectorRuntimeMetrics,
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
    assert.equal(result.value.batch_size, 3);
    assert.equal(result.value.dry_run, true);
    assert.equal(result.value.force_new_job, true);
  }
});

test("identity resolve default batch size is three and max remains unchanged", () => {
  assert.equal(IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE, 3);
  assert.equal(IDENTITY_BACKFILL_MAX_BATCH_SIZE, 100);
  assert.equal(normalizeIdentityBackfillBatchSize(4), 3);
  assert.equal(normalizeIdentityBackfillBatchSize(250), 3);

  const defaulted = normalizeIdentityBackfillRequest({
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
  });

  assert.equal(defaulted.ok, true);
  if (defaulted.ok) assert.equal(defaulted.value.batch_size, 3);
});

test("target identity diagnostics are scoped and redact identifier values", () => {
  assert.equal(isIdentityBackfillTargetDiagnosticRecord(IDENTITY_BACKFILL_TARGET_DIAGNOSTIC_PLATFORM_ORDER_ID), true);
  assert.equal(isIdentityBackfillTargetDiagnosticRecord("wowboost:124726"), false);
  assert.equal(
    identityBackfillTargetDiagnosticEventName("identity_resolve.resolve_identity", "before_await"),
    "identity_resolve.target.resolve_identity.before_await",
  );
  assert.equal(
    identityBackfillTargetDiagnosticEventName("identity_repository.attachIdentifier.insert", "operation_timeout"),
    "identity_resolve.target.identity_repository.attachIdentifier.insert.operation_timeout",
  );
  assert.equal(
    identityBackfillTargetDiagnosticEventName("identity_resolve.attach_identifier.persist.sync_error", "error"),
    "identity_resolve.target.attach_identifier.persist.sync_error",
  );
  assert.equal(maskIdentityBackfillDiagnosticValue("buyer@example.com"), "b***@example.com");
  assert.equal(maskIdentityBackfillDiagnosticValue("+14155550101"), "***0101");
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

test("discovery scan contract matches the migration 015 keyset index", () => {
  assert.equal(IDENTITY_BACKFILL_DISCOVERY_INDEX.name, "platform_orders_identity_backfill_scan_idx");
  assert.deepEqual(IDENTITY_BACKFILL_DISCOVERY_INDEX.columns, ["workspace_id", "platform", "order_ts", "platform_order_id"]);
  assert.equal(IDENTITY_BACKFILL_DISCOVERY_INDEX.predicate, "person_id is null and platform_order_id is not null");
  assert.ok(IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.includes("workspace_id = ?"));
  assert.ok(IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.includes("platform = ?"));
  assert.ok(IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.includes("order_ts >= ?"));
  assert.ok(IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.includes("order_ts < ?"));
  assert.ok(IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.includes("platform_order_id > ? when cursor exists"));
  assert.deepEqual(IDENTITY_BACKFILL_DISCOVERY_INDEX.order_by, ["platform_order_id asc"]);
});

test("finalize count contract uses per-platform index-supported predicates", () => {
  assert.deepEqual(IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES.linked.filters, [
    "workspace_id = ?",
    "platform = ?",
    "person_id is not null",
    "order_ts >= ?",
    "order_ts < ?",
  ]);
  assert.deepEqual(IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES.unlinked.filters, [
    "workspace_id = ?",
    "platform = ?",
    "person_id is null",
    "order_ts >= ?",
    "order_ts < ?",
  ]);
  assert.equal(IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES.linked.index, "platform_orders_identity_backfill_linked_count_idx");
  assert.equal(IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES.unlinked.index, "platform_orders_identity_backfill_unlinked_count_idx");
  const serialized = JSON.stringify(IDENTITY_BACKFILL_FINALIZE_COUNT_QUERIES).toLowerCase();
  assert.equal(serialized.includes("platform = any"), false);
  assert.equal(serialized.includes(" unnest"), false);
  assert.equal(serialized.includes(" raw_json"), false);
  assert.equal(serialized.includes(" or "), false);
});

test("migration 016 replaces finalize counts with per-platform indexed counts", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/016_identity_backfill_finalize_count_indexes.sql", import.meta.url), "utf8").toLowerCase();

  assert.match(migration, /platform_orders_identity_backfill_linked_count_idx/);
  assert.match(migration, /platform_orders_identity_backfill_unlinked_count_idx/);
  assert.match(migration, /foreach v_platform in array/);
  assert.equal((migration.match(/po\.platform = v_platform/g) || []).length, 2);
  assert.equal(migration.includes("platform = any"), false);
  assert.equal(migration.includes("unnest"), false);
  assert.equal(migration.includes("raw_json"), false);
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

test("resolve budget checkpoint triggers only after a completed record boundary", () => {
  const started = Date.parse("2026-07-17T00:00:00.000Z");
  assert.equal(shouldCheckpointIdentityBackfillResolveBatch({
    started_ms: started,
    now_ms: started + 20000,
    budget_ms: 18000,
    processed: 0,
    total: 10,
  }), false);
  assert.equal(shouldCheckpointIdentityBackfillResolveBatch({
    started_ms: started,
    now_ms: started + 17999,
    budget_ms: 18000,
    processed: 8,
    total: 10,
  }), false);
  assert.equal(shouldCheckpointIdentityBackfillResolveBatch({
    started_ms: started,
    now_ms: started + 18000,
    budget_ms: 18000,
    processed: 8,
    total: 10,
  }), true);
  assert.equal(shouldCheckpointIdentityBackfillResolveBatch({
    started_ms: started,
    now_ms: started + 18000,
    budget_ms: 18000,
    processed: 10,
    total: 10,
  }), false);
});

test("resolve budget continuation contains only unprocessed records and has a distinct key", () => {
  const ids = Array.from({ length: 10 }, (_, index) => `wowboost:${index + 1}`);
  const remaining = identityBackfillResolveRemainingIds(ids, 8);
  assert.deepEqual(remaining, ["wowboost:9", "wowboost:10"]);

  const originalKey = identityBackfillResolveDedupeKey("job-1", ids);
  const continuationKey = identityBackfillResolveContinuationDedupeKey({
    job_id: "job-1",
    task_id: "task-1",
    processed: 8,
    remaining_platform_order_ids: remaining,
  });
  assert.notEqual(continuationKey, originalKey);
  assert.equal(continuationKey, "identity_resolve_batch:job-1:wowboost:9:wowboost:10:2:continuation:task-1:8");
  assert.equal(remaining.includes("wowboost:8"), false);
});

test("three-record identity resolve batch completes without continuation", () => {
  const ids = ["wowboost:1", "wowboost:2", "wowboost:3"];
  assert.deepEqual(identityBackfillResolveRemainingIds(ids, 3), []);
});

test("subrequest-limit checkpoint preserves completed progress and retries only remaining ids", () => {
  const ids = Array.from({ length: 8 }, (_, index) => `wowboost:${index + 1}`);
  const checkpoint = identityBackfillResolveSubrequestLimitCheckpoint({
    platform_order_ids: ids,
    completed_record_ids: ["wowboost:1", "wowboost:2", "wowboost:3", "wowboost:4"],
  });

  assert.equal(checkpoint.processed, 4);
  assert.deepEqual(checkpoint.remaining_platform_order_ids, ["wowboost:5", "wowboost:6", "wowboost:7", "wowboost:8"]);
  assert.equal(checkpoint.remaining_platform_order_ids.includes("wowboost:4"), false);
});

test("continuation discovery excludes completed records", () => {
  const ids = Array.from({ length: 6 }, (_, index) => `wowboost:${index + 1}`);
  const completed = ["wowboost:1", "wowboost:2", "wowboost:3"];
  const checkpoint = identityBackfillResolveSubrequestLimitCheckpoint({
    platform_order_ids: ids,
    completed_record_ids: completed,
  });

  assert.equal(checkpoint.processed, 3);
  assert.deepEqual(checkpoint.remaining_platform_order_ids, ["wowboost:4", "wowboost:5", "wowboost:6"]);
  assert.equal(checkpoint.remaining_platform_order_ids.some((id) => completed.includes(id)), false);
});

test("subrequest-limit checkpoint does not skip gaps after the last contiguous completed id", () => {
  const ids = ["wowboost:1", "wowboost:2", "wowboost:3", "wowboost:4"];
  const checkpoint = identityBackfillResolveSubrequestLimitCheckpoint({
    platform_order_ids: ids,
    completed_record_ids: ["wowboost:1", "wowboost:3"],
  });

  assert.equal(checkpoint.processed, 1);
  assert.deepEqual(checkpoint.remaining_platform_order_ids, ["wowboost:2", "wowboost:3", "wowboost:4"]);
});

test("dry run preview uses read-only repository methods and reports would-create", async () => {
  const mutations = {
    createPerson: 0,
    upsertIdentifier: 0,
    appendResolutionEvent: 0,
  };
  const repo = {
    async findIdentifiers() {
      return [];
    },
    async listPeopleByIds() {
      return [];
    },
    async createPerson() {
      mutations.createPerson += 1;
      throw new Error("must not mutate");
    },
    async upsertIdentifier() {
      mutations.upsertIdentifier += 1;
      throw new Error("must not mutate");
    },
    async appendResolutionEvent() {
      mutations.appendResolutionEvent += 1;
      throw new Error("must not mutate");
    },
  } as any;

  const result = await previewIdentityResolutionReadOnly(repo, {
    workspace_id: "default",
    identifiers: [{ identifier_type: "email", value: "Customer@Example.com", verification_status: "observed" }],
  });

  assert.equal(result.preview_action, "would_create_person");
  assert.equal(result.review_required, false);
  assert.deepEqual(mutations, {
    createPerson: 0,
    upsertIdentifier: 0,
    appendResolutionEvent: 0,
  });
});

test("dry run preview reports existing matches and review without mutations", async () => {
  const matched = await previewIdentityResolutionReadOnly({
    async findIdentifiers() {
      return [{ person_id: "person-1" }];
    },
    async listPeopleByIds() {
      return [{ id: "person-1", status: "active" }];
    },
  } as any, {
    workspace_id: "default",
    identifiers: [{ identifier_type: "email", value: "known@example.com", verification_status: "observed" }],
  });
  assert.equal(matched.preview_action, "would_match_existing");
  assert.equal(matched.person_id, "person-1");

  const review = await previewIdentityResolutionReadOnly({
    async findIdentifiers() {
      return [{ person_id: "person-1" }, { person_id: "person-2" }];
    },
    async listPeopleByIds() {
      return [{ id: "person-1", status: "active" }, { id: "person-2", status: "active" }];
    },
  } as any, {
    workspace_id: "default",
    identifiers: [{ identifier_type: "email", value: "shared@example.com", verification_status: "observed" }],
  });
  assert.equal(review.preview_action, "would_require_review");
  assert.equal(review.review_required, true);
});

test("dry run preview skips records with no valid identifiers", async () => {
  const result = await previewIdentityResolutionReadOnly({
    async findIdentifiers() {
      throw new Error("should not query identifiers without valid input");
    },
    async listPeopleByIds() {
      throw new Error("should not query people without valid input");
    },
  } as any, {
    workspace_id: "default",
    identifiers: [{ identifier_type: "phone", value: "5551112222", verification_status: "observed" }],
  });

  assert.equal(result.preview_action, "would_skip_no_identifiers");
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

test("per-platform discovery state tracks completion, pending, and exhausted failures", () => {
  const platforms = ["wowboost", "wowsuite:wowboost"];
  const initial = createIdentityBackfillDiscoveryState(platforms);
  assert.deepEqual(identityBackfillDiscoverySummary({ discovery_platforms: initial }, platforms), {
    state: { wowboost: "pending", "wowsuite:wowboost": "pending" },
    completed: [],
    failed: [],
    pending: ["wowboost", "wowsuite:wowboost"],
    incomplete: true,
  });

  const afterWowBoost = markIdentityBackfillPlatformDiscovery({ discovery_platforms: initial }, "wowboost", "completed");
  assert.deepEqual(identityBackfillDiscoverySummary({ discovery_platforms: afterWowBoost }, platforms), {
    state: { wowboost: "completed", "wowsuite:wowboost": "pending" },
    completed: ["wowboost"],
    failed: [],
    pending: ["wowsuite:wowboost"],
    incomplete: true,
  });

  const afterTimeout = markIdentityBackfillPlatformDiscovery({ discovery_platforms: afterWowBoost }, "wowsuite:wowboost", "failed");
  const summary = identityBackfillDiscoverySummary({ discovery_platforms: afterTimeout }, platforms);
  assert.deepEqual(summary.failed, ["wowsuite:wowboost"]);
  assert.equal(summary.incomplete, true);
});

test("keyset cursor preserves platform and platform_order_id without offset pagination", () => {
  const platforms = ["wowboost", "wowsuite:wowboost"];
  const cursor = serializeIdentityBackfillCursor({
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:26116819",
  });

  assert.deepEqual(parseIdentityBackfillCursor(cursor, platforms), {
    current_platform: "wowsuite:wowboost",
    platform_order_id: "wowsuite:wowboost:26116819",
  });
  assert.ok(!IDENTITY_BACKFILL_DISCOVERY_INDEX.query_filters.some((filter) => filter.toLowerCase().includes("offset")));
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

test("identity runtime config match reuses equivalent active jobs with batch size three", () => {
  const existing = {
    workspace_id: "default",
    requested_from: "2026-04-01T00:00:00.000Z",
    requested_to: "2026-07-13T00:00:00.000Z",
    metadata: connectorRuntimeMetadata({
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      metadata: {
        platforms: ["wowsuite:wowboost", "wowboost"],
        batch_size: 3,
        dry_run: false,
      },
    }),
  };

  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    platforms: ["wowboost", "wowsuite:wowboost"],
    batch_size: 3,
    dry_run: false,
  }), true);
  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    platforms: ["wowboost", "wowsuite:wowboost"],
    batch_size: 4,
    dry_run: false,
  }), true);
});

test("identity runtime config match rejects active jobs with stale batch size", () => {
  const existing = {
    workspace_id: "default",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      metadata: {
        platforms: ["wowboost"],
        batch_size: 4,
        dry_run: false,
      },
    }),
  };

  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    platforms: ["wowboost"],
    batch_size: 3,
    dry_run: false,
  }), false);
});

test("identity runtime config match rejects differing platform date or dry-run requests", () => {
  const existing = {
    workspace_id: "default",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      metadata: {
        platforms: ["wowboost"],
        batch_size: 3,
        dry_run: false,
      },
    }),
  };

  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    platforms: ["wowboost", "wowsuite:wowboost"],
    batch_size: 3,
    dry_run: false,
  }), false);
  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-02",
    to: "2026-07-13",
    platforms: ["wowboost"],
    batch_size: 3,
    dry_run: false,
  }), false);
  assert.equal(identityBackfillRuntimeConfigMatches(existing, {
    workspace_id: "default",
    from: "2026-04-01",
    to: "2026-07-13",
    platforms: ["wowboost"],
    batch_size: 3,
    dry_run: true,
  }), false);
});

test("new identity runtime progress persists batch size three", () => {
  const progress = createConnectorRuntimeProgress({
    workspace_id: "default",
    connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
    job_type: IDENTITY_BACKFILL_JOB_TYPE,
    phase: "discover_unlinked_records",
    requested_from: "2026-04-01",
    requested_to: "2026-07-13",
    metadata: connectorRuntimeMetadata({
      connector_id: IDENTITY_BACKFILL_CONNECTOR_ID,
      metadata: {
        platforms: ["wowboost"],
        batch_size: IDENTITY_BACKFILL_DEFAULT_BATCH_SIZE,
        dry_run: false,
      },
    }),
  });

  assert.equal(progress.metadata.batch_size, 3);
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

test("dry run finalization allows expected remaining unlinked records", () => {
  assert.equal(identityBackfillFinalizeStatus({
    remaining_unlinked: 64,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  }, { dry_run: true }), "completed");

  assert.equal(identityBackfillFinalizeStatus({
    remaining_unlinked: 64,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  }, { dry_run: true, would_require_review: 1 }), "completed_with_errors");

  assert.equal(identityBackfillFinalizeStatus({
    remaining_unlinked: 0,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  }, { dry_run: true, discovery_incomplete: true }), "completed_with_errors");
});

test("dry-run finalize can complete from persisted metrics without table counts", () => {
  const counts = identityBackfillDryRunFinalizeCounts({
    records_discovered: 64,
    records_processed: 64,
    metadata: {
      dry_run: true,
      people_created: 0,
      people_matched: 0,
      attached: 0,
      would_create_person: 64,
      would_match_existing: 0,
      would_require_review: 0,
      would_skip_no_identifiers: 0,
      incomplete_discovery: false,
    },
  });

  assert.deepEqual(counts, {
    total_in_scope: 64,
    linked_person_id: 0,
    remaining_unlinked: 64,
    review_required_count: 0,
    no_identifier_count: 0,
    runtime_error_count: 0,
  });
  assert.equal(identityBackfillFinalizeStatus(counts, { dry_run: true }), "completed");
});

test("compact metrics expose dry-run would counters and consistent retry counters", () => {
  const metrics = compactConnectorRuntimeMetrics({
    people_created: 0,
    attached: 0,
    would_create_person: 64,
    would_match_existing: 2,
    would_require_review: 1,
    would_skip_no_identifiers: 3,
    transient_retries: 2,
    incomplete_discovery: true,
    discovery_failed_platforms: ["wowsuite:wowboost"],
  });

  assert.equal(metrics.people_created, 0);
  assert.equal(metrics.attached, 0);
  assert.equal(metrics.would_create_person, 64);
  assert.equal(metrics.would_match_existing, 2);
  assert.equal(metrics.would_require_review, 1);
  assert.equal(metrics.would_skip_no_identifiers, 3);
  assert.equal(metrics.transient_retries, 2);
  assert.equal(metrics.incomplete_discovery, true);
  assert.deepEqual(metrics.discovery_failed_platforms, ["wowsuite:wowboost"]);
});

test("dry-run parent reclassifies live-shaped first resolve batch metrics", () => {
  let metadata: Record<string, any> = {
    dry_run: true,
    batch_size: 10,
    people_created: 0,
    people_matched: 0,
    attached: 0,
    would_create_person: 0,
  };
  const resolveSummaries = [
    { processed: 10, people_created: 10, people_matched: 0, attached: 0, would_create_person: 0 },
    { processed: 10, people_created: 0, people_matched: 0, attached: 0, would_create_person: 10 },
    { processed: 10, people_created: 0, people_matched: 0, attached: 0, would_create_person: 10 },
    { processed: 10, people_created: 0, people_matched: 0, attached: 0, would_create_person: 10 },
    { processed: 10, people_created: 0, people_matched: 0, attached: 0, would_create_person: 10 },
    { processed: 10, people_created: 0, people_matched: 0, attached: 0, would_create_person: 10 },
    { processed: 4, people_created: 0, people_matched: 0, attached: 0, would_create_person: 4 },
  ];

  let recordsProcessed = 0;
  for (const summary of resolveSummaries) {
    recordsProcessed += Number(summary.processed || 0);
    metadata = mergeIdentityBackfillResolveMetricMetadata(metadata, summary, Boolean(metadata.dry_run));
  }

  assert.equal(recordsProcessed, 64);
  assert.equal(resolveSummaries.length, 7);
  assert.equal(metadata.people_created, 0);
  assert.equal(metadata.people_matched, 0);
  assert.equal(metadata.attached, 0);
  assert.equal(metadata.would_create_person, 64);

  const metrics = compactConnectorRuntimeMetrics(metadata);
  assert.equal(metrics.people_created, 0);
  assert.equal(metrics.people_matched, 0);
  assert.equal(metrics.attached, 0);
  assert.equal(metrics.would_create_person, 64);
});

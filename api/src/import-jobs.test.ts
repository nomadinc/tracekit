import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildImportJobInsertPayload,
  normalizeImportJobMetadata,
} from "./import-jobs.ts";

const source = () => readFileSync(new URL("./index.ts", import.meta.url), "utf8");

function baseProgress(overrides: Record<string, any> = {}) {
  return {
    workspace_id: "default",
    status: "queued",
    records_fetched: 0,
    records_processed: 0,
    rows_upserted: 0,
    metadata: {},
    ...overrides,
  };
}

test("PayPal run-now creates an import job payload with non-null metadata", () => {
  const payload = buildImportJobInsertPayload({
    platform: "paypal",
    module: "paypal",
    status: "queued",
    from: "2026-07-29",
    to: "2026-07-30",
    filter: "all_financial_records",
    progress: baseProgress({ platform: "paypal" }),
  }, "2026-07-30T12:00:00.000Z");

  assert.deepEqual(payload.metadata, {});
  assert.equal(payload.platform, "paypal");
  assert.equal(payload.module, "paypal");
  assert.equal(payload.from_date, "2026-07-29");
  assert.equal(payload.to_date, "2026-07-30");
  assert.equal(payload.requested_from, "2026-07-29");
  assert.equal(payload.requested_to, "2026-07-30");
});

test("WowPay and WowBoost run-now create import job payloads with non-null metadata", () => {
  for (const platform of ["wowsuite:wowpay", "wowsuite:wowboost"]) {
    const payload = buildImportJobInsertPayload({
      platform,
      module: platform.endsWith("wowpay") ? "wowpay" : "wowboost",
      status: "running",
      from: "2026-07-29",
      to: "2026-07-30",
      filter: "all_sales",
      progress: baseProgress({ platform }),
    }, "2026-07-30T12:00:00.000Z");

    assert.deepEqual(payload.metadata, {});
    assert.equal(payload.platform, platform);
    assert.equal(payload.status, "running");
  }
});

test("scheduled job creation preserves explicit metadata", () => {
  const metadata = {
    workspace_id: "default",
    account_key: "wowsuite:wowboost",
    mode: "order_snapshot_import",
    from: "2026-07-29",
    to: "2026-07-30",
    scheduled: true,
    source: "cloudflare_cron",
    requested_by: "scheduler",
  };
  const payload = buildImportJobInsertPayload({
    id: "scheduled-job",
    workspace_id: "default",
    platform: "wowsuite:wowboost",
    module: "wowboost",
    connector_id: "wowsuite:wowboost",
    job_type: "commerce_order_snapshot_import",
    phase: "order_snapshot_import",
    status: "queued",
    from: "2026-07-29",
    to: "2026-07-30",
    filter: "all_sales",
    metadata,
    progress: baseProgress({ metadata }),
  }, "2026-07-30T12:00:00.000Z");

  assert.equal(payload.id, "scheduled-job");
  assert.deepEqual(payload.metadata, metadata);
  assert.equal(payload.connector_id, "wowsuite:wowboost");
  assert.equal(payload.job_type, "commerce_order_snapshot_import");
  assert.equal(payload.phase, "order_snapshot_import");
});

test("missing or invalid import job metadata defaults to empty object", () => {
  assert.deepEqual(normalizeImportJobMetadata(undefined), {});
  assert.deepEqual(normalizeImportJobMetadata(null), {});
  assert.deepEqual(normalizeImportJobMetadata([] as any), {});
});

test("import job insert payload keeps existing fields while defaulting metadata", () => {
  const progress = baseProgress({ status: "running", current_page: 3 });
  const payload = buildImportJobInsertPayload({
    workspace_id: "workspace-1",
    platform: "paypal",
    module: "paypal",
    connector_id: "paypal:merchant-1",
    job_type: "paypal_transaction_import",
    phase: "transaction_sync",
    status: "running",
    from: "2026-07-29",
    to: "2026-07-30",
    filter: "all_financial_records",
    metadata: null,
    progress,
  }, "2026-07-30T12:00:00.000Z");

  assert.deepEqual(payload.metadata, {});
  assert.equal(payload.workspace_id, "workspace-1");
  assert.equal(payload.connector_id, "paypal:merchant-1");
  assert.equal(payload.job_type, "paypal_transaction_import");
  assert.equal(payload.phase, "transaction_sync");
  assert.equal(payload.status, "running");
  assert.equal(payload.filter, "all_financial_records");
  assert.equal(payload.progress, progress);
  assert.equal(payload.requested_at, "2026-07-30T12:00:00.000Z");
  assert.equal(payload.updated_at, "2026-07-30T12:00:00.000Z");
});

test("Worker createImportJob uses the shared non-null metadata payload builder", () => {
  const worker = source();
  const createImportJobStart = worker.indexOf("async function createImportJob");
  const createImportJobEnd = worker.indexOf("async function createImportJobIfAbsent", createImportJobStart);
  assert.notEqual(createImportJobStart, -1);
  assert.notEqual(createImportJobEnd, -1);
  const createImportJobSource = worker.slice(createImportJobStart, createImportJobEnd);

  assert.match(createImportJobSource, /buildImportJobInsertPayload\(\{/);
  assert.doesNotMatch(createImportJobSource, /metadata:\s*args\.metadata\s*\?\?\s*null/);
});

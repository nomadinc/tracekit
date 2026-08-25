import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, isFreshCommasQuotaObservation } from "../lib/commerce/commas-continuous-worker.ts";

test("quota observation freshness is explicit and fail-closed", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");
  assert.equal(COMMAS_QUOTA_OBSERVATION_MAX_AGE_MS, 15 * 60 * 1000);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:50:01.000Z", now), true);
  assert.equal(isFreshCommasQuotaObservation("2026-08-24T11:44:59.000Z", now), false);
  assert.equal(isFreshCommasQuotaObservation(null, now), false);
});

test("quota probe is one-request, state-only, and never enters normalization", () => {
  const source = readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function runCommasQuotaProbe");
  const end = source.indexOf("async function scopedConnection", start);
  const probe = source.slice(start, end);
  assert.match(probe, /fetchProviderPage\(scope\.secret, 1, 1/);
  assert.match(probe, /providerRequests: 1/);
  assert.match(probe, /quota_source: "operator_quota_probe"/);
  assert.doesNotMatch(probe, /normalizeCommasTransaction|evidenceForPage|commerce_sync_runs.*POST|enqueue_commerce/);
});

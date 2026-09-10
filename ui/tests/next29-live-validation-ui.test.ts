import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = new URL("../app/api/next29/live-validation/route.ts", import.meta.url);
const runtime = new URL("../lib/commerce/next29-live-validation.ts", import.meta.url);
const detail = new URL("../components/connections/next29-connection-detail.tsx", import.meta.url);
const migration = new URL("../../supabase/migrations/20260910060000_commerce_source_mapping_subscription_type.sql", import.meta.url);

test("29Next M12 operator surface is explicit bounded and non-production gated", async () => {
  const [routeSource, runtimeSource, detailSource] = await Promise.all([
    readFile(route, "utf8"), readFile(runtime, "utf8"), readFile(detail, "utf8"),
  ]);
  assert.match(routeSource, /runStoredNext29LiveValidation/);
  assert.match(runtimeSource, /TRACEKIT_NEXT29_LIVE_VALIDATION_ENV/);
  assert.match(runtimeSource, /NODE_ENV === "production"/);
  assert.match(runtimeSource, /MAX_RECORDS = 10/);
  assert.match(runtimeSource, /runNext29LiveValidation/);
  assert.match(runtimeSource, /enabled=eq\.true/);
  assert.match(detailSource, /Run M12 Live Validation/);
  assert.match(detailSource, /Max 10 each/);
  assert.doesNotMatch(routeSource, /webhook.*register|cron\.schedule|scheduler.*enable/i);
});

test("29Next M12 server path resolves encrypted credential without returning it", async () => {
  const [runtimeSource, routeSource] = await Promise.all([readFile(runtime, "utf8"), readFile(route, "utf8")]);
  assert.match(runtimeSource, /resolveCredentialForExecution/);
  assert.match(runtimeSource, /parseNext29ConnectionCredential/);
  assert.match(runtimeSource, /SupabaseCommerceEvidenceStore/);
  assert.match(runtimeSource, /commerce_evidence_records/);
  assert.doesNotMatch(routeSource, /accessToken|credential\.accessToken|secret:/);
});

test("canonical source mappings explicitly permit subscription identity", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /canonical_object_type/);
  assert.match(sql, /'subscription'::text/);
  assert.doesNotMatch(sql, /cron\.schedule|http_post|net\.http|create trigger/i);
});

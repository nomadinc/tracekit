import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

function sourceBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const wowpayRunNowSource = () =>
  sourceBetween(
    'path === "/v1/integrations/wowpay/import-one-page"',
    'if (path === "/v1/integrations/wowsuite/status"',
  );

const paypalRunNowSource = () =>
  sourceBetween(
    'path === "/v1/integrations/paypal/import-transactions"',
    'if (path === "/v1/integrations/shopify/status"',
  );

test("WowPay run-now uses the in-scope import result instead of an undefined res variable", () => {
  const route = wowpayRunNowSource();

  assert.match(route, /const result = await runWowPayImportPage\(env, \{ from, to, page, pageSize \}\)/);
  assert.match(route, /const partialRun = Boolean\(result\.hasMore\)/);
  assert.match(route, /const completedAt = partialRun \? null : new Date\(\)\.toISOString\(\)/);
  assert.match(route, /const finalStatus = partialRun \? "paused" : "completed"/);
  assert.match(route, /partial_run: partialRun/);
  assert.doesNotMatch(route, /\bres\.partialRun\b/);
  assert.doesNotMatch(route, /\bres\./);
});

test("WowPay run-now successful job creation returns the intended API response", () => {
  const route = wowpayRunNowSource();

  assert.match(route, /job = await createImportJob\(env, \{/);
  assert.match(route, /await updateImportJob\(env, job\.id, \{/);
  assert.match(route, /status: finalStatus/);
  assert.match(route, /return json\(\{ ok: true, platform: settingsPlatform, from, to, job_id: job\.id, \.\.\.result \}\)/);
});

test("WowPay run-now import-job creation failures return a sanitized API error", () => {
  const route = wowpayRunNowSource();

  assert.match(route, /catch \(e: any\) \{\s*const message = sanitizedIntegrationError\(e\)/);
  assert.match(route, /error: "wowpay_import_job_create_failed"/);
  assert.match(route, /return json\(\{\s*ok: false,\s*error: "wowpay_import_job_create_failed",\s*message,\s*\}, 500\)/);
  assert.doesNotMatch(route, /error: e\?\.message \|\| String\(e\)[\s\S]*wowpay_import_job_create_failed/);
});

test("PayPal run-now keeps its existing runPaypalImport response path", () => {
  const route = paypalRunNowSource();

  assert.match(route, /const res = await runPaypalImport\(env, \{/);
  assert.match(route, /fetched: res\.records_processed/);
  assert.match(route, /upserted: res\.payment_transactions_upserted/);
  assert.match(route, /\.\.\.res/);
  assert.match(route, /return json\(paypalErrorPayload\(e\), paypalErrorStatus\(e\)\)/);
  assert.doesNotMatch(route, /runWowPayImportPage/);
});

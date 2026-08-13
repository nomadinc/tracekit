import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildIntegrationSettingsDefaultRow,
  buildIntegrationSettingsSavePatch,
} from "./integration-settings.ts";

const indexSource = () => readFileSync(new URL("./index.ts", import.meta.url), "utf8");

function functionSource(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} not found`);
  assert.notEqual(end, -1, `${endNeedle} not found after ${startNeedle}`);
  return source.slice(start, end);
}

test("missing integration settings default to disabled without scheduler history", () => {
  const wowboost = buildIntegrationSettingsDefaultRow(
    "wowsuite:wowboost",
    { intervalMinutes: 60, lookbackHours: 72 },
    "2026-07-30T12:00:00.000Z",
  );

  assert.deepEqual(wowboost, {
    platform: "wowsuite:wowboost",
    auto_import_enabled: false,
    auto_import_interval_minutes: 60,
    auto_import_lookback_hours: 72,
    last_run_at: null,
    last_success_at: null,
    last_error: null,
    updated_at: "2026-07-30T12:00:00.000Z",
  });

  const paypal = buildIntegrationSettingsDefaultRow(
    "paypal",
    { intervalMinutes: 60, lookbackHours: 30 },
    "2026-07-30T12:00:00.000Z",
  );

  assert.equal(paypal.auto_import_enabled, false);
  assert.equal(paypal.auto_import_interval_minutes, 60);
  assert.equal(paypal.auto_import_lookback_hours, 30);
});

test("settings save patch persists enabled state and preserves scheduler history fields", () => {
  const patch = buildIntegrationSettingsSavePatch(
    "paypal",
    {
      auto_import_enabled: true,
      auto_import_interval_minutes: 120,
      auto_import_lookback_hours: 36,
    },
    { intervalMinutes: 60, lookbackHours: 30 },
    "2026-07-30T12:05:00.000Z",
  );

  assert.deepEqual(patch, {
    platform: "paypal",
    auto_import_enabled: true,
    auto_import_interval_minutes: 120,
    auto_import_lookback_hours: 36,
    updated_at: "2026-07-30T12:05:00.000Z",
  });
  assert.equal(Object.hasOwn(patch, "last_run_at"), false);
  assert.equal(Object.hasOwn(patch, "last_success_at"), false);
  assert.equal(Object.hasOwn(patch, "last_error"), false);
});

test("settings save patch updates interval and lookback with existing clamps", () => {
  const low = buildIntegrationSettingsSavePatch(
    "wowsuite:wowboost",
    {
      auto_import_enabled: true,
      auto_import_interval_minutes: 1,
      auto_import_lookback_hours: -5,
    },
    { intervalMinutes: 60, lookbackHours: 72 },
    "2026-07-30T12:05:00.000Z",
  );
  assert.equal(low.auto_import_interval_minutes, 15);
  assert.equal(low.auto_import_lookback_hours, 1);

  const high = buildIntegrationSettingsSavePatch(
    "wowsuite:wowboost",
    {
      auto_import_enabled: true,
      auto_import_interval_minutes: 10_000,
      auto_import_lookback_hours: 999,
    },
    { intervalMinutes: 60, lookbackHours: 72 },
    "2026-07-30T12:05:00.000Z",
  );
  assert.equal(high.auto_import_interval_minutes, 1440);
  assert.equal(high.auto_import_lookback_hours, 168);
});

test("WowBoost and PayPal settings POST handlers upsert missing rows by platform", () => {
  const source = indexSource();
  const saveSource = functionSource(
    source,
    "async function saveIntegrationSettings",
    "async function saveCredential",
  );
  const wowboostPost = functionSource(
    source,
    "(path === \"/v1/integrations/wowboost/settings\" || path === \"/v1/integrations/wowpay/settings\") &&\n    req.method === \"POST\"",
    "  // Temporary validation endpoint.",
  );
  const paypalPost = functionSource(
    source,
    "if (path === \"/v1/integrations/paypal/settings\" && req.method === \"POST\")",
    "  if (path === \"/v1/integrations/paypal/reconcile-commerce-references\"",
  );

  assert.match(saveSource, /\.from\("integrations_settings"\)\.upsert\(patch as any, \{ onConflict: "platform" \}\)/);
  assert.match(wowboostPost, /saveIntegrationSettings\(env, wowSuiteKey\(sub\), body/);
  assert.match(paypalPost, /saveIntegrationSettings\(env, "paypal", body/);
  assert.match(saveSource, /buildIntegrationSettingsSavePatch\(platform, body, defaults\)/);
  assert.doesNotMatch(saveSource, /last_run_at\s*:/);
  assert.doesNotMatch(saveSource, /last_success_at\s*:/);
  assert.doesNotMatch(saveSource, /last_error\s*:/);
});

test("settings GET handlers return disabled defaults without destructive upsert", () => {
  const source = indexSource();
  const getSource = functionSource(
    source,
    "async function getIntegrationSettings",
    "async function saveIntegrationSettings",
  );
  const paypalGet = functionSource(
    source,
    "if (path === \"/v1/integrations/paypal/settings\" && req.method === \"GET\")",
    "  if (path === \"/v1/integrations/paypal/settings\" && req.method === \"POST\")",
  );
  const wowboostGet = functionSource(
    source,
    "(path === \"/v1/integrations/wowboost/settings\" || path === \"/v1/integrations/wowpay/settings\") &&\n    req.method === \"GET\"",
    "  if (\n    (path === \"/v1/integrations/wowboost/settings\" || path === \"/v1/integrations/wowpay/settings\") &&\n    req.method === \"POST\"",
  );

  assert.doesNotMatch(getSource, /\.upsert\(/);
  assert.match(getSource, /buildIntegrationSettingsDefaultRow\(platform, defaults, now\)/);
  assert.match(paypalGet, /getIntegrationSettings\(env, "paypal"/);
  assert.doesNotMatch(paypalGet, /\.upsert\(/);
  assert.match(wowboostGet, /getIntegrationSettings\(env, settingsPlatform/);
});

test("credential writes persist key version, IV, and ciphertext atomically", () => {
  const source = indexSource();
  const saveSource = functionSource(
    source,
    "async function saveCredential",
    "async function updateCredentialMetadata",
  );

  assert.match(saveSource, /encryptIntegrationSecret\(env, args\.password\)/);
  assert.match(saveSource, /password_key_version:\s*encrypted\.version/);
  assert.match(saveSource, /password_iv:\s*encrypted\.iv_b64/);
  assert.match(saveSource, /password_ciphertext:\s*encrypted\.ct_b64/);
  assert.match(saveSource, /\.upsert\(payload as any, \{ onConflict: "platform" \}\)/);
});

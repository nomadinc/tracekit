import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getIntegrationDefinition, getIntegrationsByCategory, integrationCategoryLabels } from "../lib/integrations/catalog";

test("advertising is a first-class integration category", () => {
  assert.equal(integrationCategoryLabels.advertising, "Advertising");
  const ids = getIntegrationsByCategory("advertising").map((item) => item.id);
  assert.deepEqual(ids, ["meta", "google-ads", "tiktok-ads"]);
});

test("Meta, Google Ads, and TikTok Ads are registered as OAuth advertising integrations", () => {
  const meta = getIntegrationDefinition("meta");
  const google = getIntegrationDefinition("google-ads");
  assert.ok(meta);
  assert.ok(google);\n  const tiktok = getIntegrationDefinition("tiktok-ads");\n  assert.ok(tiktok);
  assert.equal(meta?.authType, "oauth");
  assert.equal(google?.authType, "oauth");\n  assert.equal(tiktok?.authType, "oauth");\n  assert.equal(tiktok?.primaryAction, "manage");\n  assert.equal(tiktok?.supportsWebhook, false);\n  assert.equal(tiktok?.supportsBackfill, false);\n  assert.equal(tiktok?.connectPath, undefined);
  assert.equal(meta?.supportsWebhook, false);
  assert.equal(google?.supportsWebhook, false);
  assert.equal(meta?.supportsBackfill, false);
  assert.equal(google?.supportsBackfill, false);
  assert.equal(meta?.connectPath, undefined);
  assert.equal(google?.connectPath, undefined);
});

test("generic marketing repository does not import provider adapters", async () => {
  const source = await readFile(new URL("../lib/integrations/marketing-provider-repository.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /meta-oauth|google/i);
  assert.match(source, /marketingPersistenceRequest/);
  assert.match(source, /MarketingProviderAccount/);
  assert.match(source, /parentProviderAccountId/);
  assert.match(source, /eligibleForSpendSync/);
});

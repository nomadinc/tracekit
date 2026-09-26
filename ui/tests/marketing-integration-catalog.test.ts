import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getIntegrationDefinition, getIntegrationsByCategory, integrationCategoryLabels } from "../lib/integrations/catalog";

test("advertising is a first-class integration category", () => {
  assert.equal(integrationCategoryLabels.advertising, "Advertising");
  const ids = getIntegrationsByCategory("advertising").map((item) => item.id);
  assert.deepEqual(ids, ["meta", "google-ads"]);
});

test("Meta and Google Ads are registered as inactive OAuth advertising integrations", () => {
  const meta = getIntegrationDefinition("meta");
  const google = getIntegrationDefinition("google-ads");
  assert.ok(meta);
  assert.ok(google);
  assert.equal(meta?.authType, "oauth");
  assert.equal(google?.authType, "oauth");
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

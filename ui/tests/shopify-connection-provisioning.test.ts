import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("Shopify is available from the Connections provider catalog", () => {
  const catalog = source("lib/commerce/integration-experience.ts");
  assert.match(catalog, /provider: "shopify", name: "Shopify", availability: "available"/);
  assert.match(catalog, /SHOPIFY_CAPABILITIES/);
});

test("Connections UI collects Shopify domain and Admin token without exposing the secret", () => {
  const overview = source("components/connections/connections-overview.tsx");
  assert.match(overview, /type ConnectProvider = "commas" \| "everflow" \| "shopify"/);
  assert.match(overview, /name="shopDomain"/);
  assert.match(overview, /name="adminAccessToken" type="password"/);
  assert.match(overview, /provider: "shopify"/);
  assert.doesNotMatch(overview, /console\.log\([^\n]*adminAccessToken/);
});

test("Shopify provisioning uses the organization-scoped encrypted commerce control plane", () => {
  const route = source("app/api/commerce/[...commercePath]/route.ts");
  assert.match(route, /createCommerceControlPlane/);
  assert.match(route, /resolution\.session\.activeOrganization\.id/);
  assert.match(route, /plane\.createCredential\(resolution\.session, connection\.id, credentialSecret\)/);
  assert.match(route, /plane\.upsertProviderAccount/);
  assert.match(route, /plane\.verifyConnection/);
  assert.match(route, /plane\.revokeCredential/);
  assert.match(route, /plane\.disableConnection/);
  assert.doesNotMatch(route, /adminAccessToken[^\n]*return success/);
});

test("Shopify verification is bounded and read-only", () => {
  const verifier = source("lib/commerce/shopify-verifier.ts");
  assert.match(verifier, /SHOPIFY_ADMIN_API_VERSION = "2026-07"/);
  assert.match(verifier, /query TraceKitConnectionTest \{ shop \{ id name myshopifyDomain \} \}/);
  assert.match(verifier, /x-shopify-access-token/);
  assert.doesNotMatch(verifier, /mutation\s/);
  assert.doesNotMatch(verifier, /productsCreate|orderCreate|customerCreate/);
});

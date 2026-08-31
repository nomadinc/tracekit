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

test("Connections UI starts Shopify OAuth without collecting an Admin token", () => {
  const overview = source("components/connections/connections-overview.tsx");
  assert.match(overview, /type ConnectProvider = "commas" \| "everflow" \| "shopify"/);
  assert.match(overview, /name="shopDomain"/);
  assert.match(overview, /\/api\/shopify\/oauth\/start/);
  assert.match(overview, /Continue to Shopify/);
  assert.doesNotMatch(overview, /name="adminAccessToken"/);
  assert.doesNotMatch(overview, /shpat_/);
});

test("Shopify OAuth callback stores the shop token in the encrypted commerce control plane", () => {
  const callback = source("app/api/shopify/oauth/callback/route.ts");
  assert.match(callback, /exchangeShopifyAuthorizationCode/);
  assert.match(callback, /verifyShopifyOAuthCallback/);
  assert.match(callback, /serializeShopifyConnectionCredential/);
  assert.match(callback, /plane\.rotateCredential/);
  assert.match(callback, /plane\.createCredential/);
  assert.match(callback, /plane\.upsertProviderAccount/);
  assert.match(callback, /plane\.verifyConnection/);
  assert.doesNotMatch(callback, /console\.log\([^\n]*accessToken/);
});

test("Shopify OAuth start binds authorization to organization and state", () => {
  const start = source("app/api/shopify/oauth/start/route.ts");
  assert.match(start, /authorizeCommerceOrganizationAccess/);
  assert.match(start, /randomBytes\(24\)/);
  assert.match(start, /httpOnly: true/);
  assert.match(start, /sameSite: "lax"/);
  assert.match(start, /organizationId: resolution\.session\.activeOrganization\.id/);
});

test("Shopify verification remains bounded and read-only", () => {
  const verifier = source("lib/commerce/shopify-verifier.ts");
  assert.match(verifier, /SHOPIFY_ADMIN_API_VERSION = "2026-07"/);
  assert.match(verifier, /query TraceKitConnectionTest \{ shop \{ id name myshopifyDomain \} \}/);
  assert.match(verifier, /x-shopify-access-token/);
  assert.doesNotMatch(verifier, /mutation\s/);
  assert.doesNotMatch(verifier, /productsCreate|orderCreate|customerCreate/);
});

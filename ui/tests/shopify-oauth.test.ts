import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildShopifyAuthorizationUrl,
  normalizeShopifyOAuthShop,
  SHOPIFY_OAUTH_SCOPES,
  verifyShopifyOAuthCallback,
} from "../lib/commerce/shopify-oauth";

test("Shopify OAuth normalizes only myshopify domains", () => {
  assert.equal(normalizeShopifyOAuthShop("https://demo-store.myshopify.com/admin"), "demo-store.myshopify.com");
  assert.equal(normalizeShopifyOAuthShop("demo-store"), "demo-store.myshopify.com");
  assert.equal(normalizeShopifyOAuthShop("evil.example.com"), null);
});

test("Shopify authorization URL requests only the M4 read scopes", () => {
  const value = buildShopifyAuthorizationUrl({
    shop: "demo-store.myshopify.com",
    clientId: "client-id",
    redirectUri: "https://app.trace-kit.io/api/shopify/oauth/callback",
    state: "state-123",
  });
  const url = new URL(value);
  assert.equal(url.hostname, "demo-store.myshopify.com");
  assert.equal(url.pathname, "/admin/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("scope"), SHOPIFY_OAUTH_SCOPES.join(","));
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.doesNotMatch(url.searchParams.get("scope") || "", /write_/);
});

test("Shopify OAuth callback HMAC must match the client secret", () => {
  const params = new URLSearchParams({
    code: "abc",
    shop: "demo-store.myshopify.com",
    state: "state-123",
    timestamp: "1788130000",
  });
  const message = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  params.set("hmac", createHmac("sha256", "shared-secret").update(message).digest("hex"));
  assert.equal(verifyShopifyOAuthCallback(params, "shared-secret"), true);
  assert.equal(verifyShopifyOAuthCallback(params, "wrong-secret"), false);
});

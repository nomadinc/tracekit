import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("M9 registration manages exactly orders/create and refunds/create", async () => {
  const registration = await source("lib/commerce/shopify-webhook-registration.ts");
  assert.match(registration, /ORDERS_CREATE/);
  assert.match(registration, /REFUNDS_CREATE/);
  assert.match(registration, /webhookSubscriptions\(first: 20, topics: \$topics\)/);
  assert.match(registration, /webhookSubscriptionCreate/);
  assert.match(registration, /webhookSubscription: \{ uri: args\.callbackUrl \}/);
});

test("M9 authenticated registration endpoint targets the signed production route shape", async () => {
  const route = await source("app/api/shopify/webhook-subscriptions/route.ts");
  assert.match(route, /resolveApplicationSession/);
  assert.match(route, /resolveCredentialForExecution/);
  assert.match(route, /\/api\/webhooks\/shopify/);
  assert.match(route, /ensureTraceKitShopifyWebhookSubscriptions/);
  assert.match(route, /origin !== new URL\(request\.url\)\.origin/);
});

test("M9 connection UI exposes subscription readiness and activation", async () => {
  const component = await source("components/connections/shopify-webhook-secret.tsx");
  assert.match(component, /2\/2 webhooks active/);
  assert.match(component, /Activate webhooks/);
  assert.match(component, /webhook-subscriptions/);
});

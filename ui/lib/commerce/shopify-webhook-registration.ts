import "server-only";
import type { StoredShopifyCredential } from "./shopify-verifier";

export const SHOPIFY_WEBHOOK_TOPICS = ["ORDERS_CREATE", "REFUNDS_CREATE"] as const;
export type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPICS[number];

export type ShopifyWebhookSubscription = {
  id: string;
  topic: ShopifyWebhookTopic;
  uri: string;
};

export async function listTraceKitShopifyWebhookSubscriptions(args: {
  credential: StoredShopifyCredential;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const payload = await shopifyGraphql(args.credential, {
    query: `query TraceKitWebhookSubscriptions($topics: [WebhookSubscriptionTopic!]) {
      webhookSubscriptions(first: 20, topics: $topics) { nodes { id topic uri } }
    }`,
    variables: { topics: SHOPIFY_WEBHOOK_TOPICS },
  }, args.fetchImpl);

  const nodes = Array.isArray(payload?.data?.webhookSubscriptions?.nodes)
    ? payload.data.webhookSubscriptions.nodes
    : [];
  return nodes
    .map((node: any) => ({ id: String(node?.id || ""), topic: String(node?.topic || ""), uri: String(node?.uri || "") }))
    .filter((node: any): node is ShopifyWebhookSubscription =>
      Boolean(node.id) && SHOPIFY_WEBHOOK_TOPICS.includes(node.topic as ShopifyWebhookTopic) && node.uri === args.callbackUrl,
    );
}

export async function ensureTraceKitShopifyWebhookSubscriptions(args: {
  credential: StoredShopifyCredential;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const existing = await listTraceKitShopifyWebhookSubscriptions(args);
  const byTopic = new Map(existing.map((subscription) => [subscription.topic, subscription]));
  const created: ShopifyWebhookSubscription[] = [];

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    if (byTopic.has(topic)) continue;
    const payload = await shopifyGraphql(args.credential, {
      query: `mutation TraceKitWebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic uri }
          userErrors { field message }
        }
      }`,
      variables: { topic, webhookSubscription: { uri: args.callbackUrl } },
    }, args.fetchImpl);
    const result = payload?.data?.webhookSubscriptionCreate;
    const errors = Array.isArray(result?.userErrors) ? result.userErrors : [];
    if (errors.length) throw new Error(`Shopify webhook registration failed for ${topic}: ${String(errors[0]?.message || "unknown error")}`);
    const subscription = result?.webhookSubscription;
    if (!subscription?.id || subscription?.topic !== topic || subscription?.uri !== args.callbackUrl) {
      throw new Error(`Shopify webhook registration returned an invalid ${topic} subscription.`);
    }
    created.push({ id: String(subscription.id), topic, uri: String(subscription.uri) });
  }

  const subscriptions = await listTraceKitShopifyWebhookSubscriptions(args);
  return {
    subscriptions,
    created,
    ready: SHOPIFY_WEBHOOK_TOPICS.every((topic) => subscriptions.some((subscription) => subscription.topic === topic)),
  };
}

async function shopifyGraphql(
  credential: StoredShopifyCredential,
  body: { query: string; variables?: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(`https://${credential.shopDomain}/admin/api/${credential.apiVersion}/graphql.json`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-shopify-access-token": credential.adminAccessToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Shopify webhook Admin API request failed (${response.status}).`);
  const payload = await response.json().catch(() => null) as any;
  if (!payload || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new Error(`Shopify webhook Admin API returned an error: ${String(payload?.errors?.[0]?.message || "invalid response")}`);
  }
  return payload;
}

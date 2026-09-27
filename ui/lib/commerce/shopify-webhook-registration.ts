import "server-only";
import type { StoredShopifyCredential } from "./shopify-verifier";

export const SHOPIFY_WEBHOOK_TOPICS = ["ORDERS_CREATE", "REFUNDS_CREATE"] as const;
export type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPICS[number];

export type ShopifyWebhookSubscription = {
  id: string;
  topic: ShopifyWebhookTopic;
  uri: string;
};

type ShopifyGraphqlPayload = {
  data?: Record<string, any>;
  errors?: Array<{ message?: string }>;
};

export async function listTraceKitShopifyWebhookSubscriptions(args: {
  credential: StoredShopifyCredential;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<ShopifyWebhookSubscription[]> {
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

export async function createTraceKitShopifyWebhookSubscription(args:{credential:StoredShopifyCredential;callbackUrl:string;topic:ShopifyWebhookTopic;fetchImpl?:typeof fetch;}){
 if(!SHOPIFY_WEBHOOK_TOPICS.includes(args.topic))throw new Error("Shopify webhook creation topic is outside the bounded TraceKit contract.");
 const existing=await listTraceKitShopifyWebhookSubscriptions({credential:args.credential,callbackUrl:args.callbackUrl,fetchImpl:args.fetchImpl});
 const prior=existing.find(s=>s.topic===args.topic);if(prior)return{decision:"already_exists" as const,subscription:prior,verifiedPresent:true};
 const payload=await shopifyGraphql(args.credential,{query:`mutation TraceKitGovernedWebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) { webhookSubscription { id topic uri } userErrors { field message } } }`,variables:{topic:args.topic,webhookSubscription:{uri:args.callbackUrl}}},args.fetchImpl);
 const result=payload?.data?.webhookSubscriptionCreate,errors=Array.isArray(result?.userErrors)?result.userErrors:[];if(errors.length)throw new Error(`Shopify webhook creation failed: ${String(errors[0]?.message||"unknown error")}`);
 const row=result?.webhookSubscription;if(!row?.id||row.topic!==args.topic||row.uri!==args.callbackUrl)throw new Error("Shopify webhook creation returned an invalid subscription.");
 const after=await listTraceKitShopifyWebhookSubscriptions({credential:args.credential,callbackUrl:args.callbackUrl,fetchImpl:args.fetchImpl}),created=after.find(s=>s.id===String(row.id)&&s.topic===args.topic);
 if(!created)throw new Error("Shopify webhook creation could not be verified by read-back.");
 return{decision:"created" as const,subscription:created,verifiedPresent:true};
}

export async function deleteTraceKitShopifyWebhookSubscription(args:{credential:StoredShopifyCredential;subscription:ShopifyWebhookSubscription;callbackUrl:string;fetchImpl?:typeof fetch;}){
 if(!SHOPIFY_WEBHOOK_TOPICS.includes(args.subscription.topic)||args.subscription.uri!==args.callbackUrl)throw new Error("Shopify webhook deletion target is outside the bounded TraceKit subscription contract.");
 const payload=await shopifyGraphql(args.credential,{query:`mutation TraceKitWebhookSubscriptionDelete($id: ID!) { webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } } }`,variables:{id:args.subscription.id}},args.fetchImpl);
 const result=payload?.data?.webhookSubscriptionDelete,errors=Array.isArray(result?.userErrors)?result.userErrors:[];
 if(errors.length)throw new Error(`Shopify webhook deletion failed: ${String(errors[0]?.message||"unknown error")}`);
 if(String(result?.deletedWebhookSubscriptionId||"")!==args.subscription.id)throw new Error("Shopify webhook deletion returned an unexpected subscription identity.");
 const remaining=await listTraceKitShopifyWebhookSubscriptions({credential:args.credential,callbackUrl:args.callbackUrl,fetchImpl:args.fetchImpl});
 return{deletedSubscriptionId:args.subscription.id,verifiedAbsent:!remaining.some(s=>s.id===args.subscription.id),remaining};
}

async function shopifyGraphql(
  credential: StoredShopifyCredential,
  body: { query: string; variables?: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<ShopifyGraphqlPayload> {
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
  const payload = await response.json().catch(() => null) as ShopifyGraphqlPayload | null;
  if (!payload || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new Error(`Shopify webhook Admin API returned an error: ${String(payload?.errors?.[0]?.message || "invalid response")}`);
  }
  return payload;
}

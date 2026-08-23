import { exactTargetMatch, type WebhookSubscriptionSummary } from "./commas-webhook-inspector";

export const DISPUTE_EVENT_TYPES = ["dispute.created", "dispute.updated"] as const;

export type CreatorDependencies = {
  listSubscriptions: () => Promise<WebhookSubscriptionSummary[]>;
  createSubscription: (body: { webhook_url: string; event_types: readonly string[] }) => Promise<{ id: string; webhookUrl: string; eventTypes: string[]; secretKey?: string }>;
  updateCloudflareSecret: (secret: string) => Promise<boolean>;
};

export type CreatorResult = {
  created: boolean;
  subscriptionId: string | null;
  webhookUrl: string;
  eventTypes: string[];
  cloudflareSecretUpdated: boolean;
};

export async function createCommasDisputeWebhook(confirmation: boolean, dependencies: CreatorDependencies): Promise<CreatorResult> {
  if (!confirmation) throw new Error("Creation requires --confirm-create-commas-dispute-webhook.");
  const existing = await dependencies.listSubscriptions();
  if (exactTargetMatch(existing, "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks")) {
    const match = existing.find((subscription) => subscription.webhookUrl === "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks");
    return { created: false, subscriptionId: match?.id || null, webhookUrl: match?.webhookUrl || "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks", eventTypes: match?.eventTypes || [], cloudflareSecretUpdated: false };
  }
  const created = await dependencies.createSubscription({ webhook_url: "https://webhooks.trace-kit.io/v1/connectors/commas/webhooks", event_types: DISPUTE_EVENT_TYPES });
  if (!created.secretKey) throw new Error(`Subscription ${created.id} was created without a returned secret_key; do not create another subscription.`);
  const cloudflareSecretUpdated = await dependencies.updateCloudflareSecret(created.secretKey);
  return { created: true, subscriptionId: created.id, webhookUrl: created.webhookUrl, eventTypes: created.eventTypes, cloudflareSecretUpdated };
}

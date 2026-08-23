import { execFileSync } from "node:child_process";
import { createCommasDisputeWebhook, DISPUTE_EVENT_TYPES } from "../lib/commerce/commas-webhook-creator";
import { listCommasWebhookSubscriptions, resolveCommasApiKey, TARGET_URL } from "./inspect-commas-webhooks";

const baseUrl = () => (process.env.COMMAS_BASE_URL || "https://www.fanbasis.com").replace(/\/$/, "");

async function createSubscription(apiKey: string, body: { webhook_url: string; event_types: readonly string[] }) {
  const response = await fetch(`${baseUrl()}/public-api/webhook-subscriptions`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Commas webhook subscription creation failed (${response.status}).`);
  const payload = await response.json() as { data?: Record<string, unknown> };
  const data = payload.data || {};
  return {
    id: String(data.id || ""),
    webhookUrl: String(data.webhook_url || ""),
    eventTypes: Array.isArray(data.event_types) ? data.event_types.filter((value): value is string => typeof value === "string") : [],
    secretKey: typeof data.secret_key === "string" ? data.secret_key : undefined,
  };
}

async function updateCloudflareSecret(secret: string) {
  try {
    execFileSync("npx", ["wrangler", "secret", "put", "COMMAS_WEBHOOK_SECRET", "--name", "tracekit-api"], { input: secret, encoding: "utf8", stdio: ["pipe", "ignore", "pipe"] });
    const listed = execFileSync("npx", ["wrangler", "secret", "list", "--name", "tracekit-api"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return /COMMAS_WEBHOOK_SECRET/.test(listed);
  } catch {
    return false;
  }
}

async function main() {
  const apiKey = await resolveCommasApiKey();
  const report = await createCommasDisputeWebhook(process.argv.includes("--confirm-create-commas-dispute-webhook"), {
    listSubscriptions: () => listCommasWebhookSubscriptions(apiKey),
    createSubscription: (body) => createSubscription(apiKey, body),
    updateCloudflareSecret,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.created && !report.cloudflareSecretUpdated) {
    console.error(`Subscription ${report.subscriptionId} was created, but Cloudflare secret update failed. Recover the still-in-memory secret immediately; do not create another subscription.`);
    process.exitCode = 2;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Commas webhook creation failed.");
  process.exitCode = 1;
});

void DISPUTE_EVENT_TYPES;
void TARGET_URL;

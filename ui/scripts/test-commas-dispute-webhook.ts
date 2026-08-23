import { resolveCommasApiKey } from "./inspect-commas-webhooks";
import { sendCommasWebhookTestDelivery } from "../lib/commerce/commas-webhook-test-delivery";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

async function main() {
  const subscriptionId = argument("--subscription-id");
  const eventType = argument("--event-type");
  if (!subscriptionId) throw new Error("--subscription-id is required.");
  if (!eventType) throw new Error("--event-type is required.");
  const apiKey = await resolveCommasApiKey();
  const summary = await sendCommasWebhookTestDelivery({ apiKey, subscriptionId, eventType });
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Commas webhook test delivery failed.");
  process.exitCode = 1;
});

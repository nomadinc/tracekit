export const COMMAS_DISPUTE_WEBHOOK_EVENTS = ["dispute.created", "dispute.updated", "product.purchased", "subscription.created"] as const;
export type CommasDisputeWebhookEvent = typeof COMMAS_DISPUTE_WEBHOOK_EVENTS[number];

export function assertDisputeWebhookEvent(value: string): asserts value is CommasDisputeWebhookEvent {
  if (!COMMAS_DISPUTE_WEBHOOK_EVENTS.includes(value as CommasDisputeWebhookEvent)) {
    throw new Error("Event type must be a configured Commas webhook event.");
  }
}

export type WebhookTestSummary = {
  httpStatus: number;
  apiStatus?: string;
  message?: string;
  eventSent?: boolean;
  responseStatus?: number;
};

export async function sendCommasWebhookTestDelivery(args: {
  apiKey: string;
  subscriptionId: string;
  eventType: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<WebhookTestSummary> {
  if (!args.subscriptionId || !/^[a-zA-Z0-9_-]+$/.test(args.subscriptionId)) throw new Error("A valid subscription ID is required.");
  assertDisputeWebhookEvent(args.eventType);
  const fetchImpl = args.fetchImpl || fetch;
  const baseUrl = (args.baseUrl || "https://www.fanbasis.com").replace(/\/$/, "");
  const response = await fetchImpl(`${baseUrl}/public-api/webhook-subscriptions/${encodeURIComponent(args.subscriptionId)}/test`, {
    method: "POST",
    headers: { "x-api-key": args.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: args.eventType }),
  });
  let payload: Record<string, unknown> = {};
  try {
    const value = await response.json() as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) payload = value as Record<string, unknown>;
  } catch {
    // Preserve a sanitized status-only result for non-JSON provider errors.
  }
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {};
  const summary: WebhookTestSummary = { httpStatus: response.status };
  if (typeof payload.status === "string") summary.apiStatus = payload.status;
  if (typeof payload.message === "string") summary.message = payload.message;
  if (typeof data.event_sent === "boolean") summary.eventSent = data.event_sent;
  if (typeof data.response_status === "number") summary.responseStatus = data.response_status;
  return summary;
}

export type WebhookSubscriptionRow = Record<string, unknown>;

export type WebhookSubscriptionSummary = {
  id: string;
  webhookUrl: string;
  eventTypes: string[];
  active?: boolean;
  status?: string;
};

const CREDENTIAL_QUERY_KEY = /(?:token|key|secret|password|passcode|auth|signature|credential)/i;

/** Preserve routing identity without emitting query credentials or fragments. */
export function sanitizeWebhookUrl(value: unknown) {
  try {
    const parsed = new URL(String(value ?? ""));
    parsed.hash = "";
    const sanitized = new URLSearchParams();
    for (const [key] of parsed.searchParams) {
      sanitized.append(CREDENTIAL_QUERY_KEY.test(key) ? "[redacted-key]" : key, "[redacted]");
    }
    parsed.search = sanitized.toString();
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

/** Return only the non-sensitive fields needed for subscription inspection. */
export function summarizeWebhookSubscription(row: WebhookSubscriptionRow): WebhookSubscriptionSummary {
  const eventTypes = Array.isArray(row.event_types)
    ? row.event_types.filter((value): value is string => typeof value === "string")
    : [];
  const summary: WebhookSubscriptionSummary = {
    id: String(row.id ?? ""),
    webhookUrl: sanitizeWebhookUrl(row.webhook_url),
    eventTypes,
  };
  if (typeof row.is_active === "boolean") summary.active = row.is_active;
  if (typeof row.status === "string") summary.status = row.status;
  return summary;
}

export function exactTargetMatch(subscriptions: WebhookSubscriptionSummary[], targetUrl: string) {
  return subscriptions.some((subscription) => subscription.webhookUrl === targetUrl);
}

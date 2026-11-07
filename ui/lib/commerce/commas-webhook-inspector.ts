export type WebhookSubscriptionRow = Record<string, unknown>;

export type WebhookSubscriptionSummary = {
  id: string;
  webhookUrl: string;
  eventTypes: string[];
  active?: boolean;
  status?: string;
  targetMatchEligible?: false;
};

const CREDENTIAL_QUERY_KEY = /(?:token|key|secret|password|passcode|auth|signature|credential)/i;

/** Preserve routing identity without emitting query credentials or fragments. */
export function sanitizeWebhookUrl(value: unknown, secrets: string[] = []) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (!["https:", "http:"].includes(parsed.protocol)) return "[invalid-url]";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    const sanitized = new URLSearchParams();
    parsed.searchParams.forEach((_value, key) => {
      sanitized.append(CREDENTIAL_QUERY_KEY.test(key) ? "[redacted-key]" : key, "[redacted]");
    });
    parsed.search = sanitized.toString();
    return redactKnownSecrets(parsed.toString(), secrets);
  } catch {
    return "[invalid-url]";
  }
}

function redactKnownSecrets(value: string, secrets: string[]) {
  let result = value;
  for (const secret of secrets.filter(Boolean)) {
    for (const form of [secret, encodeURIComponent(secret), Buffer.from(secret).toString("base64")]) {
      result = result.split(form).join("[redacted]");
    }
  }
  return result;
}

/** Return only the non-sensitive fields needed for subscription inspection. */
export function summarizeWebhookSubscription(row: WebhookSubscriptionRow, secrets: string[] = []): WebhookSubscriptionSummary {
  const eventTypes = Array.isArray(row.event_types)
    ? row.event_types.filter((value): value is string => typeof value === "string")
    : [];
  const summary: WebhookSubscriptionSummary = {
    id: redactKnownSecrets(String(row.id ?? ""), secrets),
    webhookUrl: sanitizeWebhookUrl(row.webhook_url, secrets),
    eventTypes: eventTypes.map(value => redactKnownSecrets(value, secrets)),
  };
  if (typeof row.is_active === "boolean") summary.active = row.is_active;
  if (typeof row.status === "string") summary.status = redactKnownSecrets(row.status, secrets);
  // Sanitization must never turn a different callback into the approved target.
  if (summary.webhookUrl !== String(row.webhook_url ?? "") || summary.id !== String(row.id ?? "")) summary.targetMatchEligible = false;
  return summary;
}

export function exactTargetMatch(subscriptions: WebhookSubscriptionSummary[], targetUrl: string) {
  return subscriptions.some((subscription) => subscription.targetMatchEligible !== false && subscription.webhookUrl === targetUrl);
}

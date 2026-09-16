import "server-only";

/**
 * M14.1A signing-secret boundary.
 *
 * The environment fallback preserves the already-proven M13 staging contract only.
 * M14.1B must replace this fallback with connection-scoped encrypted storage before
 * production activation. Keep callers dependent on this resolver rather than on
 * environment-variable storage policy.
 */
export async function resolveNext29WebhookSigningSecret(input: {
  connectionId: string;
}): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(input.connectionId)) {
    throw new Error("29Next webhook signing secret is unavailable.");
  }

  const secret = String(process.env.TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET || "").trim();
  if (secret.length < 8) throw new Error("29Next webhook signing secret is unavailable.");
  return secret;
}

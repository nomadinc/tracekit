import "server-only";
import { resolveTypedCommerceCredential } from "./typed-credential-store";

/** M14.1B connection-scoped signing-secret resolver. */
export async function resolveNext29WebhookSigningSecret(input: {
  connectionId: string;
}): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(input.connectionId)) {
    throw new Error("29Next webhook signing secret is unavailable.");
  }

  try {
    const secret = (await resolveTypedCommerceCredential({
      connectionId: input.connectionId,
      credentialType: "webhook_signing_secret",
    })).trim();
    if (secret.length < 8) throw new Error("invalid");
    return secret;
  } catch {
    throw new Error("29Next webhook signing secret is unavailable.");
  }
}

import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { decodeCommerceCredentialKey, encryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { commercePersistenceRequest, SupabaseCommerceControlRepository } from "@/lib/commerce/supabase-control-repository";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ ok: false, code, message }, { status });

function credentialKey() {
  const id = process.env.COMMERCE_CREDENTIALS_KEY_ID;
  const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  if (!id || !Number.isInteger(version) || version < 1) throw new Error("Commerce credential encryption is unavailable.");
  return { bytes: decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY), id, version };
}

const bytea = (value: Uint8Array) => `\\x${Buffer.from(value).toString("hex")}`;

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if ((origin && origin !== new URL(request.url).origin) || (site && site !== "same-origin")) {
      return fail(403, "request_verification_failed", "Request verification failed.");
    }

    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return fail(404, "resource_unavailable", "The requested resource is unavailable.");
    }
    requirePermission(resolution.session, "connectors.manage");

    const { connectionId } = await context.params;
    const organizationId = resolution.session.activeOrganization.id;
    const connections = await commercePersistenceRequest(
      `commerce_provider_connections?id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,status&limit=1`,
    ) as Array<Record<string, unknown>>;
    if (!connections[0] || String(connections[0].status) === "revoked") {
      return fail(404, "resource_unavailable", "The requested resource is unavailable.");
    }

    const body = await request.json().catch(() => null) as { secret?: unknown; credentialType?: unknown } | null;
    const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
    const credentialType = body?.credentialType === "webhook_signing_secret" ? "webhook_signing_secret" : "api_key";
    if (!secret || secret.length > 4096) return fail(400, "invalid_credential", "A valid credential is required.");

    const repo = new SupabaseCommerceControlRepository();
    if (credentialType === "api_key" && await repo.activeCredential(connectionId, organizationId)) {
      return fail(409, "active_credential_exists", "An active API credential already exists.");
    }
    if (credentialType !== "api_key") {
      const existing = await commercePersistenceRequest(
        `commerce_provider_credentials?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&credential_type=eq.${credentialType}&revoked_at=is.null&select=id&limit=1`,
      ) as Array<Record<string, unknown>>;
      if (existing[0]) return fail(409, "active_credential_exists", "An active credential of this type already exists.");
    }

    const key = credentialKey();
    const encrypted = await encryptCommerceCredential(secret, key.bytes, key.id, key.version);
    const rows = await commercePersistenceRequest("commerce_provider_credentials", {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        connection_id: connectionId,
        credential_type: credentialType,
        storage_backend: "database_encrypted",
        encryption_key_id: encrypted.keyId,
        encryption_version: encrypted.encryptionVersion,
        secret_iv: bytea(encrypted.iv),
        secret_ciphertext: bytea(encrypted.ciphertext),
      }),
    }) as Array<Record<string, unknown>>;

    return NextResponse.json({ ok: true, credentialId: String(rows[0]?.id || ""), credentialType, status: "active" }, { status: 201 });
  } catch {
    return fail(500, "credential_provisioning_failed", "TraceKit could not provision the credential.");
  }
}

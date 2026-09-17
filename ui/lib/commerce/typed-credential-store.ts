import "server-only";
import { commercePersistenceRequest } from "./supabase-control-repository";
import { decodeCommerceCredentialKey, decryptCommerceCredential, encryptCommerceCredential } from "./credential-crypto";

export type CommerceCredentialPurpose = "api_key" | "webhook_signing_secret";

type CredentialRow = Record<string, unknown>;
const bytes = (value: unknown) => Uint8Array.from(Buffer.from(String(value).replace(/^\\x/, ""), "hex"));
const bytea = (value: Uint8Array) => `\\x${Buffer.from(value).toString("hex")}`;

function encryptionConfiguration() {
  const bytes = decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY);
  const keyId = String(process.env.COMMERCE_CREDENTIALS_KEY_ID || "").trim();
  if (!keyId) throw new Error("Commerce credential encryption is unavailable.");
  return { bytes, keyId, version: 1 };
}

export async function activeTypedCommerceCredential(input: {
  connectionId: string;
  credentialType: CommerceCredentialPurpose;
}) {
  const rows = await commercePersistenceRequest(
    `commerce_provider_credentials?connection_id=eq.${encodeURIComponent(input.connectionId)}` +
      `&credential_type=eq.${encodeURIComponent(input.credentialType)}` +
      `&revoked_at=is.null&select=id,organization_id,connection_id,credential_type,encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=1`,
  );
  return (rows[0] || null) as CredentialRow | null;
}

export async function resolveTypedCommerceCredential(input: {
  connectionId: string;
  credentialType: CommerceCredentialPurpose;
}) {
  const row = await activeTypedCommerceCredential(input);
  if (!row || !row.secret_ciphertext) throw new Error("Commerce credential is unavailable.");
  const key = encryptionConfiguration();
  if (String(row.encryption_key_id) !== key.keyId) throw new Error("Commerce credential is unavailable.");
  return decryptCommerceCredential(
    {
      keyId: String(row.encryption_key_id),
      encryptionVersion: Number(row.encryption_version),
      iv: bytes(row.secret_iv),
      ciphertext: bytes(row.secret_ciphertext),
    },
    key.bytes,
  );
}

export async function insertTypedCommerceCredential(input: {
  organizationId: string;
  connectionId: string;
  credentialType: CommerceCredentialPurpose;
  secret: string;
}) {
  if (!input.secret.trim()) throw new Error("Credential secret is required.");
  if (await activeTypedCommerceCredential(input)) throw new Error("An active credential of this type already exists.");
  const key = encryptionConfiguration();
  const encrypted = await encryptCommerceCredential(input.secret, key.bytes, key.keyId, key.version);
  const rows = await commercePersistenceRequest("commerce_provider_credentials", {
    method: "POST",
    body: JSON.stringify({
      organization_id: input.organizationId,
      connection_id: input.connectionId,
      credential_type: input.credentialType,
      storage_backend: "database_encrypted",
      encryption_key_id: encrypted.keyId,
      encryption_version: encrypted.encryptionVersion,
      secret_iv: bytea(encrypted.iv),
      secret_ciphertext: bytea(encrypted.ciphertext),
    }),
  });
  return String(rows[0]?.id || "");
}

export async function rotateTypedCommerceCredential(input: {
  organizationId: string;
  connectionId: string;
  credentialType: CommerceCredentialPurpose;
  previousId: string;
  secret: string;
}) {
  const key = encryptionConfiguration();
  const encrypted = await encryptCommerceCredential(input.secret, key.bytes, key.keyId, key.version);
  const rows = await commercePersistenceRequest("rpc/rotate_commerce_provider_credential", {
    method: "POST",
    body: JSON.stringify({
      p_organization_id: input.organizationId,
      p_connection_id: input.connectionId,
      p_previous_id: input.previousId,
      p_credential_type: input.credentialType,
      p_key_id: encrypted.keyId,
      p_encryption_version: encrypted.encryptionVersion,
      p_secret_iv: bytea(encrypted.iv),
      p_secret_ciphertext: bytea(encrypted.ciphertext),
    }),
  });
  if (!rows[0]) throw new Error("Commerce credential is unavailable.");
  return String(rows[0].id);
}

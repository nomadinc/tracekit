export const LEGACY_INTEGRATION_KEY_VERSION = 1 as const;
export const CURRENT_INTEGRATION_KEY_VERSION = 2 as const;
export type IntegrationKeyVersion = 1 | 2;

export type IntegrationEncryptionEnv = {
  /** Transitional v1 compatibility binding. Remove after explicit v1 cutover. */
  INTEGRATIONS_ENC_KEY?: string;
  INTEGRATIONS_ENC_KEY_V1?: string;
  INTEGRATIONS_ENC_KEY_V2?: string;
  INTEGRATIONS_ENC_WRITE_VERSION?: string;
};

export type EncryptedIntegrationSecret = {
  version: IntegrationKeyVersion;
  alg: "AES-GCM";
  iv_b64: string;
  ct_b64: string;
};

export type IntegrationCredentialCipherRow = {
  password_key_version?: number | null;
  password_iv?: string | null;
  password_ciphertext?: string | null;
};

export type IntegrationEncryptionErrorCode =
  | "integration_encryption_key_missing"
  | "integration_encryption_key_invalid"
  | "integration_encryption_key_version_unsupported"
  | "integration_encryption_key_mismatch"
  | "integration_credential_decryption_failed";

export class IntegrationEncryptionError extends Error {
  readonly code: IntegrationEncryptionErrorCode;

  constructor(code: IntegrationEncryptionErrorCode) {
    super(code);
    this.name = "IntegrationEncryptionError";
    this.code = code;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function decodeEncryptionKey(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new IntegrationEncryptionError("integration_encryption_key_missing");
  }
  if (value !== value.trim() || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new IntegrationEncryptionError("integration_encryption_key_invalid");
  }
  let raw: Uint8Array;
  try {
    raw = decodeBase64(value);
  } catch {
    throw new IntegrationEncryptionError("integration_encryption_key_invalid");
  }
  if (raw.byteLength !== 32 || encodeBase64(raw) !== value) {
    throw new IntegrationEncryptionError("integration_encryption_key_invalid");
  }
  return raw;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function normalizeVersion(value: unknown, allowMissingLegacy: boolean): IntegrationKeyVersion {
  if ((value === null || value === undefined || value === "") && allowMissingLegacy) {
    return LEGACY_INTEGRATION_KEY_VERSION;
  }
  if (typeof value !== "number" && value !== "1" && value !== "2") {
    throw new IntegrationEncryptionError("integration_encryption_key_version_unsupported");
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (numeric !== LEGACY_INTEGRATION_KEY_VERSION && numeric !== CURRENT_INTEGRATION_KEY_VERSION) {
    throw new IntegrationEncryptionError("integration_encryption_key_version_unsupported");
  }
  return numeric;
}

export function integrationEncryptionWriteVersion(env: IntegrationEncryptionEnv): IntegrationKeyVersion {
  return normalizeVersion(env.INTEGRATIONS_ENC_WRITE_VERSION ?? "1", false);
}

function encodedKeyForVersion(env: IntegrationEncryptionEnv, version: IntegrationKeyVersion): string {
  if (version === CURRENT_INTEGRATION_KEY_VERSION) {
    if (!env.INTEGRATIONS_ENC_KEY_V2) {
      throw new IntegrationEncryptionError("integration_encryption_key_missing");
    }
    return env.INTEGRATIONS_ENC_KEY_V2;
  }

  const explicit = env.INTEGRATIONS_ENC_KEY_V1;
  const compatibility = env.INTEGRATIONS_ENC_KEY;
  if (!explicit && !compatibility) {
    throw new IntegrationEncryptionError("integration_encryption_key_missing");
  }
  if (explicit && compatibility) {
    const explicitRaw = decodeEncryptionKey(explicit);
    const compatibilityRaw = decodeEncryptionKey(compatibility);
    if (!equalBytes(explicitRaw, compatibilityRaw)) {
      throw new IntegrationEncryptionError("integration_encryption_key_mismatch");
    }
  }
  return explicit ?? compatibility!;
}

async function importEncryptionKey(env: IntegrationEncryptionEnv, version: IntegrationKeyVersion): Promise<CryptoKey> {
  const raw = decodeEncryptionKey(encodedKeyForVersion(env, version));
  return crypto.subtle.importKey("raw", ownedBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptIntegrationSecret(
  env: IntegrationEncryptionEnv,
  plaintext: string,
  version = integrationEncryptionWriteVersion(env),
): Promise<EncryptedIntegrationSecret> {
  const key = await importEncryptionKey(env, version);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedBuffer(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    version,
    alg: "AES-GCM",
    iv_b64: encodeBase64(iv),
    ct_b64: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptIntegrationSecret(
  env: IntegrationEncryptionEnv,
  versionValue: unknown,
  ivBase64: string,
  ciphertextBase64: string,
  options: { allowMissingLegacyVersion?: boolean } = {},
): Promise<string> {
  const version = normalizeVersion(versionValue, options.allowMissingLegacyVersion === true);
  const key = await importEncryptionKey(env, version);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBuffer(decodeBase64(String(ivBase64 ?? "").trim())) },
      key,
      ownedBuffer(decodeBase64(String(ciphertextBase64 ?? "").trim())),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new IntegrationEncryptionError("integration_credential_decryption_failed");
  }
}

export async function decryptIntegrationSecretFromRow(
  env: IntegrationEncryptionEnv,
  row: IntegrationCredentialCipherRow,
): Promise<string> {
  return decryptIntegrationSecret(
    env,
    row.password_key_version,
    String(row.password_iv ?? ""),
    String(row.password_ciphertext ?? ""),
    { allowMissingLegacyVersion: true },
  );
}

export async function reencryptIntegrationSecret(
  env: IntegrationEncryptionEnv,
  row: IntegrationCredentialCipherRow,
  targetVersion: IntegrationKeyVersion = CURRENT_INTEGRATION_KEY_VERSION,
): Promise<EncryptedIntegrationSecret> {
  const plaintext = await decryptIntegrationSecretFromRow(env, row);
  return encryptIntegrationSecret(env, plaintext, targetVersion);
}

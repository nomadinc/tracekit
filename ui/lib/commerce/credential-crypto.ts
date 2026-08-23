const KEY_BYTES = 32;
const IV_BYTES = 12;
import { decodeBase64 } from "./web-encoding.ts";

export type EncryptedCommerceCredential = {
  keyId: string;
  encryptionVersion: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

export class CommerceCredentialConfigurationError extends Error {
  readonly code = "commerce_credential_configuration_error";
  constructor() { super("Commerce credential encryption is unavailable."); }
}

export class CommerceCredentialResolutionError extends Error {
  readonly code = "commerce_credential_unavailable";
  constructor() { super("The commerce credential is unavailable."); }
}

export function decodeCommerceCredentialKey(encoded: string | undefined) {
  if (!encoded) throw new CommerceCredentialConfigurationError();
  let bytes: Uint8Array;
  try { bytes = decodeBase64(encoded); }
  catch { throw new CommerceCredentialConfigurationError(); }
  if (bytes.byteLength !== KEY_BYTES) throw new CommerceCredentialConfigurationError();
  return bytes;
}

export async function encryptCommerceCredential(
  plaintext: string,
  keyBytes: Uint8Array,
  keyId: string,
  encryptionVersion = 1,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<EncryptedCommerceCredential> {
  if (!plaintext || keyBytes.byteLength !== KEY_BYTES || !keyId) throw new CommerceCredentialConfigurationError();
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await cryptoApi.subtle.importKey("raw", arrayBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const ciphertext = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: arrayBuffer(iv) }, key, new TextEncoder().encode(plaintext));
  return { keyId, encryptionVersion, iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptCommerceCredential(
  encrypted: EncryptedCommerceCredential,
  keyBytes: Uint8Array,
  cryptoApi: Crypto = globalThis.crypto,
) {
  if (keyBytes.byteLength !== KEY_BYTES) throw new CommerceCredentialConfigurationError();
  try {
    const key = await cryptoApi.subtle.importKey("raw", arrayBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
    const plaintext = await cryptoApi.subtle.decrypt({ name: "AES-GCM", iv: arrayBuffer(encrypted.iv) }, key, arrayBuffer(encrypted.ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new CommerceCredentialResolutionError();
  }
}

function arrayBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}

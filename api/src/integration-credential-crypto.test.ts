import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  IntegrationEncryptionError,
  decryptIntegrationSecret,
  decryptIntegrationSecretFromRow,
  encryptIntegrationSecret,
  integrationEncryptionWriteVersion,
  reencryptIntegrationSecret,
  type IntegrationEncryptionEnv,
} from "./integration-credential-crypto.ts";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const key = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");
const env = (overrides: Partial<IntegrationEncryptionEnv> = {}): IntegrationEncryptionEnv => ({
  INTEGRATIONS_ENC_KEY_V1: key(),
  INTEGRATIONS_ENC_KEY_V2: key(),
  INTEGRATIONS_ENC_WRITE_VERSION: "1",
  ...overrides,
});
const code = (expected: string) => (error: unknown) =>
  error instanceof IntegrationEncryptionError && error.code === expected;

test("legacy compatibility, explicit v1, and matching transition bindings work", async () => {
  const legacy = key();
  for (const candidate of [
    { INTEGRATIONS_ENC_KEY: legacy },
    { INTEGRATIONS_ENC_KEY_V1: legacy },
    { INTEGRATIONS_ENC_KEY: legacy, INTEGRATIONS_ENC_KEY_V1: legacy },
  ]) {
    const encrypted = await encryptIntegrationSecret(candidate, "synthetic", 1);
    assert.equal(encrypted.version, 1);
    assert.equal(await decryptIntegrationSecret(candidate, 1, encrypted.iv_b64, encrypted.ct_b64), "synthetic");
  }
});

test("different transitional v1 bindings fail closed", async () => {
  await assert.rejects(
    encryptIntegrationSecret({ INTEGRATIONS_ENC_KEY: key(), INTEGRATIONS_ENC_KEY_V1: key() }, "synthetic", 1),
    code("integration_encryption_key_mismatch"),
  );
});

test("v1 and v2 rows decrypt deterministically in mixed state", async () => {
  const configured = env();
  const v1 = await encryptIntegrationSecret(configured, "legacy", 1);
  const v2 = await encryptIntegrationSecret(configured, "replacement", 2);
  assert.equal(await decryptIntegrationSecret(configured, 1, v1.iv_b64, v1.ct_b64), "legacy");
  assert.equal(await decryptIntegrationSecret(configured, 2, v2.iv_b64, v2.ct_b64), "replacement");
  await assert.rejects(decryptIntegrationSecret(configured, 2, v1.iv_b64, v1.ct_b64), code("integration_credential_decryption_failed"));
  await assert.rejects(decryptIntegrationSecret(configured, 1, v2.iv_b64, v2.ct_b64), code("integration_credential_decryption_failed"));
});

test("write version controls the persisted encryption version", async () => {
  const configured = env();
  assert.equal(integrationEncryptionWriteVersion(configured), 1);
  assert.equal((await encryptIntegrationSecret(configured, "one")).version, 1);
  configured.INTEGRATIONS_ENC_WRITE_VERSION = "2";
  assert.equal((await encryptIntegrationSecret(configured, "two")).version, 2);
});

test("missing, malformed, and unsupported key configuration fails closed", async () => {
  await assert.rejects(encryptIntegrationSecret({}, "one", 1), code("integration_encryption_key_missing"));
  await assert.rejects(encryptIntegrationSecret({ INTEGRATIONS_ENC_KEY_V1: "not-base64" }, "one", 1), code("integration_encryption_key_invalid"));
  await assert.rejects(encryptIntegrationSecret({ INTEGRATIONS_ENC_KEY_V1: Buffer.alloc(31).toString("base64") }, "one", 1), code("integration_encryption_key_invalid"));
  await assert.rejects(encryptIntegrationSecret({ INTEGRATIONS_ENC_WRITE_VERSION: "2", INTEGRATIONS_ENC_KEY_V1: key() }, "two"), code("integration_encryption_key_missing"));
  assert.throws(() => integrationEncryptionWriteVersion({ INTEGRATIONS_ENC_WRITE_VERSION: "3" }), code("integration_encryption_key_version_unsupported"));
  assert.throws(() => integrationEncryptionWriteVersion({ INTEGRATIONS_ENC_WRITE_VERSION: "01" }), code("integration_encryption_key_version_unsupported"));
});

test("row key requirements and unknown versions fail closed without blind fallback", async () => {
  const configured = env();
  const v1 = await encryptIntegrationSecret(configured, "legacy", 1);
  const v2 = await encryptIntegrationSecret(configured, "replacement", 2);
  await assert.rejects(decryptIntegrationSecret({ INTEGRATIONS_ENC_KEY_V2: configured.INTEGRATIONS_ENC_KEY_V2 }, 1, v1.iv_b64, v1.ct_b64), code("integration_encryption_key_missing"));
  await assert.rejects(decryptIntegrationSecret({ INTEGRATIONS_ENC_KEY_V1: configured.INTEGRATIONS_ENC_KEY_V1 }, 2, v2.iv_b64, v2.ct_b64), code("integration_encryption_key_missing"));
  await assert.rejects(decryptIntegrationSecret(configured, 99, v1.iv_b64, v1.ct_b64), code("integration_encryption_key_version_unsupported"));
});

test("missing persisted version is an explicit temporary v1-only compatibility path", async () => {
  const configured = env();
  const encrypted = await encryptIntegrationSecret(configured, "legacy", 1);
  assert.equal(await decryptIntegrationSecretFromRow(configured, { password_iv: encrypted.iv_b64, password_ciphertext: encrypted.ct_b64 }), "legacy");
  await assert.rejects(decryptIntegrationSecret(configured, null, encrypted.iv_b64, encrypted.ct_b64), code("integration_encryption_key_version_unsupported"));
});

test("wrong key and tampering are rejected by authenticated encryption", async () => {
  const configured = env();
  const encrypted = await encryptIntegrationSecret(configured, "synthetic", 1);
  await assert.rejects(decryptIntegrationSecret({ INTEGRATIONS_ENC_KEY_V1: key() }, 1, encrypted.iv_b64, encrypted.ct_b64), code("integration_credential_decryption_failed"));
  const bytes = Buffer.from(encrypted.ct_b64, "base64");
  bytes[0] ^= 1;
  await assert.rejects(decryptIntegrationSecret(configured, 1, encrypted.iv_b64, bytes.toString("base64")), code("integration_credential_decryption_failed"));
});

test("synthetic v1 to v2 re-encryption preserves plaintext and rejects v1 afterward", async () => {
  const configured = env();
  const v1 = await encryptIntegrationSecret(configured, "rotate-me", 1);
  const v2 = await reencryptIntegrationSecret(configured, {
    password_key_version: 1,
    password_iv: v1.iv_b64,
    password_ciphertext: v1.ct_b64,
  });
  assert.equal(v2.version, 2);
  assert.equal(await decryptIntegrationSecret(configured, 2, v2.iv_b64, v2.ct_b64), "rotate-me");
  await assert.rejects(decryptIntegrationSecret(configured, 1, v2.iv_b64, v2.ct_b64), code("integration_credential_decryption_failed"));
});

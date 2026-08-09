import "server-only";
import { CommerceControlPlane, type CommerceConnectionVerifier, type CommerceReadinessEvaluator } from "./control-plane";
import { decodeCommerceCredentialKey } from "./credential-crypto";
import type { CommerceEvidenceStore } from "./evidence-store";
import { SupabaseCommerceControlRepository } from "./supabase-control-repository";

/** Server composition root. Never import this module from a Client Component. */
export function createCommerceControlPlane(dependencies: {
  evidenceStore: CommerceEvidenceStore;
  verifier?: CommerceConnectionVerifier;
  readinessEvaluator?: CommerceReadinessEvaluator;
}) {
  const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  const keyId = process.env.COMMERCE_CREDENTIALS_KEY_ID;
  if (!keyId || !Number.isInteger(version) || version < 1) throw new Error("Commerce credential encryption is unavailable.");
  return new CommerceControlPlane(
    new SupabaseCommerceControlRepository(),
    { bytes: decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY), id: keyId, version },
    dependencies.evidenceStore,
    dependencies.verifier,
    dependencies.readinessEvaluator,
  );
}

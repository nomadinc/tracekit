import type { Next29VerificationResult } from "./verification.ts";
import { verifyNext29WebhookSignature } from "./webhook.ts";

export const NEXT29_REQUIRED_MIGRATIONS = [
  "097_commerce_subscriptions_v1.sql",
  "098_commerce_webhook_receipts_v1.sql",
  "20260901060000_generalize_commerce_dispute_observations.sql",
  "20260902030000_next29_incremental_scheduler_foundation.sql",
  "20260902043000_next29_scheduler_dispatch_runtime.sql",
] as const;

export type Next29ActivationEvidence = {
  environment: "preview" | "staging" | "production";
  migrationsApplied: readonly string[];
  connectionVerification: Next29VerificationResult | null;
  boundedLiveReads: {
    orders: boolean;
    subscriptions: boolean;
    disputes: boolean;
  };
  canonicalReconciliation: {
    evidenceWritten: boolean;
    orderObserved: boolean;
    subscriptionObserved: boolean;
    disputeObserved: boolean;
  };
  webhookSignatureProof: {
    verified: boolean;
    serialization: "raw_bytes" | "json_reserialized" | "unknown";
  };
  schedulesEnabled: boolean;
  externalDispatcherEnabled: boolean;
  liveWebhookRegistered: boolean;
};

export type Next29ActivationReadiness = {
  readyForProductionActivation: boolean;
  readyForNonProductionValidation: boolean;
  blockers: string[];
  warnings: string[];
};

/**
 * Pure readiness gate. It never activates a schedule, registers a webhook,
 * writes credentials, or mutates 29Next. Production remains blocked until live
 * provider evidence is explicitly supplied by an operator.
 */
export function evaluateNext29ActivationReadiness(input: Next29ActivationEvidence): Next29ActivationReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const applied = new Set(input.migrationsApplied);

  for (const migration of NEXT29_REQUIRED_MIGRATIONS) {
    if (!applied.has(migration)) blockers.push(`missing_migration:${migration}`);
  }

  if (!input.connectionVerification) blockers.push("connection_verification_missing");
  else {
    if (input.connectionVerification.status !== "connected") blockers.push("connection_not_connected");
    if (input.connectionVerification.apiVersion !== "2024-04-01") blockers.push("unexpected_api_version");
    if (!input.connectionVerification.resourceChecks.orders) blockers.push("orders_read_unproven");
    if (!input.connectionVerification.resourceChecks.subscriptions) blockers.push("subscriptions_read_unproven");
    if (!input.connectionVerification.resourceChecks.disputes) blockers.push("disputes_read_unproven");
  }

  if (!input.boundedLiveReads.orders) blockers.push("orders_live_read_unproven");
  if (!input.boundedLiveReads.subscriptions) blockers.push("subscriptions_live_read_unproven");
  if (!input.boundedLiveReads.disputes) blockers.push("disputes_live_read_unproven");
  if (!input.canonicalReconciliation.evidenceWritten) blockers.push("immutable_evidence_unproven");
  if (!input.canonicalReconciliation.orderObserved) blockers.push("order_reconciliation_unproven");
  if (!input.canonicalReconciliation.subscriptionObserved) warnings.push("subscription_reconciliation_no_sample");
  if (!input.canonicalReconciliation.disputeObserved) warnings.push("dispute_reconciliation_no_sample");
  if (!input.webhookSignatureProof.verified) blockers.push("webhook_signature_unproven");
  if (input.webhookSignatureProof.serialization === "unknown") blockers.push("webhook_serialization_unknown");

  // M12 is validation-only. If any production execution surface is already on,
  // readiness fails closed because activation happened before the gate passed.
  if (input.environment === "production") {
    if (input.schedulesEnabled) blockers.push("production_schedule_already_enabled");
    if (input.externalDispatcherEnabled) blockers.push("production_dispatcher_already_enabled");
    if (input.liveWebhookRegistered) blockers.push("production_webhook_already_registered");
  }

  const readyForNonProductionValidation = input.environment !== "production" && NEXT29_REQUIRED_MIGRATIONS.every((m) => applied.has(m));
  return {
    readyForProductionActivation: blockers.length === 0,
    readyForNonProductionValidation,
    blockers,
    warnings,
  };
}

/**
 * Evaluates one captured 29Next delivery against both candidate serialization
 * contracts. This is diagnostic only and does not accept/process the webhook.
 */
export async function characterizeNext29WebhookSignature(input: {
  rawBody: Uint8Array;
  signature: string;
  signingSecret: string;
}): Promise<{ verified: boolean; serialization: "raw_bytes" | "json_reserialized" | "unknown" }> {
  const raw = await verifyNext29WebhookSignature(input);
  if (raw) return { verified: true, serialization: "raw_bytes" };

  try {
    const parsed = JSON.parse(new TextDecoder().decode(input.rawBody));
    const reserializedBody = new TextEncoder().encode(JSON.stringify(parsed));
    const reserialized = await verifyNext29WebhookSignature({ ...input, rawBody: reserializedBody });
    if (reserialized) return { verified: true, serialization: "json_reserialized" };
  } catch {
    // Invalid JSON cannot satisfy the documented webhook contract.
  }
  return { verified: false, serialization: "unknown" };
}

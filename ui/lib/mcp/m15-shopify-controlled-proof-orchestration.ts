import { createHash, randomUUID } from "node:crypto";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import {
  createTraceKitShopifyWebhookSubscription,
  deleteTraceKitShopifyWebhookSubscription,
  listTraceKitShopifyWebhookSubscriptions,
  SHOPIFY_PROOF_ONLY_TOPIC,
  type ShopifyWebhookSubscription,
} from "@/lib/commerce/shopify-webhook-registration";
import type { StoredShopifyCredential } from "@/lib/commerce/shopify-verifier";
import { persistMcpExecutionResult } from "./action-execution-result-repository";
import {
  markShopifyMutationCreated,
  markShopifyRollbackVerified,
  readShopifyMutationRecovery,
} from "./m15-shopify-recovery-repository";
import{assessIntelligenceAction}from"./production-v1-policy";
import {
  authorizeShopifyControlledProofExecution,
  type ShopifyControlledProofPlan,
} from "./m15-shopify-intent-repository";
export function buildShopifyProofEnvelope(input: {
  organizationId: string;
  plan: ShopifyControlledProofPlan;
  idempotencyKey: string;
  auditCorrelationId: string;
  createdAt: string;
  expiresAt: string;
}) {
  const canonical = JSON.stringify({
      organizationId: input.organizationId,
      operation: input.plan.operation,
      connectionId: input.plan.connectionId,
      shopDomain: input.plan.shopDomain,
      callbackUrl: input.plan.callbackUrl,
      topic: input.plan.topic,
      idempotencyKey: input.idempotencyKey,
      auditCorrelationId: input.auditCorrelationId,
      createdAt: input.createdAt,
    }),
    envelopeIdentity =
      "shopify-exec-v1-" +
      createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  return {
    state: "authorized",
    organizationId: input.organizationId,
    envelopeIdentity,
    idempotencyKey: input.idempotencyKey,
    auditCorrelationId: input.auditCorrelationId,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}
export async function orchestrateShopifyControlledProof(
  session: TraceKitSessionContext,
  input: {
    intentId: string;
    confirmationId: string;
    planIdentity: string;
    plan: ShopifyControlledProofPlan;
    credential: StoredShopifyCredential;
    idempotencyKey: string;
    auditCorrelationId: string;
    requestedAt: string;
    expiresAt: string;
    consumptionId: string;
    executionEnabled: boolean;
    fetchImpl?: typeof fetch;
  },
) {
  const envelope = buildShopifyProofEnvelope({
    organizationId: session.activeOrganization!.id,
    plan: input.plan,
    idempotencyKey: input.idempotencyKey,
    auditCorrelationId: input.auditCorrelationId,
    createdAt: input.requestedAt,
    expiresAt: input.expiresAt,
  });
  const policy=assessIntelligenceAction("shopify.controlled_webhook_create_delete_proof");
  if(!policy.allowed)return{status:"rejected"as const,reason:policy.reason,envelope,execution:null,executionAvailable:false,netProviderConfigurationMutation:false as const};
  if (
    !input.executionEnabled ||
    !session.effectivePermissions.includes("actions.execute")
  )
    return {
      status: "rejected" as const,
      reason: "capability_execution_disabled",
      envelope,
      execution: null,
      executionAvailable: false,
      netProviderConfigurationMutation: false,
    };
  const recovery = await readShopifyMutationRecovery({
    organizationId: envelope.organizationId,
    intentId: input.intentId,
  });
  if (
    !recovery ||
    recovery.plan_identity == null ||
    recovery.shop_domain !== input.plan.shopDomain ||
    recovery.callback_url !== input.plan.callbackUrl ||
    recovery.topic !== input.plan.topic
  )
    return {
      status: "rejected" as const,
      reason: "recovery_binding_invalid",
      envelope,
      execution: null,
      executionAvailable: false,
      netProviderConfigurationMutation: false,
    };
  const durable = await authorizeShopifyControlledProofExecution(session, {
    confirmationId: input.confirmationId,
    planIdentity: input.planIdentity,
    envelopeIdentity: envelope.envelopeIdentity,
    idempotencyKey: input.idempotencyKey,
    auditCorrelationId: input.auditCorrelationId,
    consumptionId: input.consumptionId,
    requestedAt: input.requestedAt,
  });
  if (durable.decision !== "consume" || !durable.consumptionId)
    return {
      status: "rejected" as const,
      reason: durable.decision,
      envelope,
      execution: null,
      executionAvailable: false,
      netProviderConfigurationMutation: false,
    };
  let subscription: ShopifyWebhookSubscription;
  if (recovery.state === "created" && recovery.created_external_id) {
    subscription = {
      id: String(recovery.created_external_id),
      topic: SHOPIFY_PROOF_ONLY_TOPIC,
      uri: input.plan.callbackUrl,
    };
  } else if (recovery.state === "prepared") {
    const existing = await listTraceKitShopifyWebhookSubscriptions({
        credential: input.credential,
        callbackUrl: input.plan.callbackUrl,
        fetchImpl: input.fetchImpl,
      }),
      proof = existing.filter((s) => s.topic === SHOPIFY_PROOF_ONLY_TOPIC);
    if (proof.length === 1) {
      subscription = proof[0];
      await markShopifyMutationCreated({
        organizationId: envelope.organizationId,
        intentId: input.intentId,
        externalId: subscription.id,
      });
    } else if (proof.length > 1)
      return {
        status: "rejected" as const,
        reason: "ambiguous_proof_topic_state",
        envelope,
        execution: null,
        executionAvailable: false,
        netProviderConfigurationMutation: true,
      };
    else {
      const created = await createTraceKitShopifyWebhookSubscription({
        credential: input.credential,
        callbackUrl: input.plan.callbackUrl,
        topic: SHOPIFY_PROOF_ONLY_TOPIC,
        fetchImpl: input.fetchImpl,
      });
      if (created.decision !== "created")
        return {
          status: "rejected" as const,
          reason: "proof_topic_not_disposable",
          envelope,
          execution: null,
          executionAvailable: false,
          netProviderConfigurationMutation: false,
        };
      subscription = created.subscription;
      await markShopifyMutationCreated({
        organizationId: envelope.organizationId,
        intentId: input.intentId,
        externalId: subscription.id,
      });
    }
  } else
    return {
      status: "rejected" as const,
      reason: "recovery_state_invalid",
      envelope,
      execution: null,
      executionAvailable: false,
      netProviderConfigurationMutation: false,
    };
  const rollback = await deleteTraceKitShopifyWebhookSubscription({
    credential: input.credential,
    subscription,
    callbackUrl: input.plan.callbackUrl,
    fetchImpl: input.fetchImpl,
  });
  if (!rollback.verifiedAbsent)
    return {
      status: "recovery_required" as const,
      reason: "rollback_not_verified",
      envelope,
      execution: { createdExternalId: subscription.id },
      executionAvailable: false,
      netProviderConfigurationMutation: true,
    };
  await markShopifyRollbackVerified({
    organizationId: envelope.organizationId,
    intentId: input.intentId,
    externalId: subscription.id,
  });
  const executionId = randomUUID(),
    execution = {
      status: "completed" as const,
      provider: "shopify" as const,
      operation: "controlled_webhook_create_delete_proof" as const,
      consumptionId: durable.consumptionId,
      createdExternalId: subscription.id,
      createVerified: true,
      rollbackExternalId: rollback.deletedSubscriptionId,
      rollbackVerified: true,
      netProviderConfigurationMutation: false,
      audit: {
        idempotencyKey: input.idempotencyKey,
        auditCorrelationId: input.auditCorrelationId,
        executionId,
      },
    };
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\\\/$/, ""),
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !serviceKey)
    throw new Error("m15_shopify_mutation_audit_unavailable");
  const audit = await fetch(
    `${dbUrl}/rest/v1/rpc/record_mcp_external_mutation_audit`,
    {
      method: "POST",
      headers: {
        ...supabaseAuthHeaders(serviceKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_execution_id: executionId,
        p_organization_id: envelope.organizationId,
        p_provider: "shopify",
        p_operation: "controlled_webhook_create_delete_proof",
        p_controlled_target: input.plan.shopDomain,
        p_mutation_object_type: "webhook_subscription",
        p_created_external_id: subscription.id,
        p_rollback_external_id: rollback.deletedSubscriptionId,
        p_create_verified: true,
        p_rollback_verified: true,
        p_net_provider_configuration_mutation: false,
        p_audit_correlation_id: input.auditCorrelationId,
        p_idempotency_key: input.idempotencyKey,
        p_executed_by: session.user.id,
        p_executed_at: new Date().toISOString(),
        p_evidence: {
          topic: input.plan.topic,
          callbackUrl: input.plan.callbackUrl,
          intentId: input.intentId,
        },
      }),
    },
  );
  if (!audit.ok) throw new Error("m15_shopify_mutation_audit_failed");
  await persistMcpExecutionResult({
    envelope,
    consumptionId: durable.consumptionId,
    result: execution,
  });
  return {
    status: "completed" as const,
    reason: "completed",
    envelope,
    execution,
    executionAvailable: true,
    netProviderConfigurationMutation: false,
  };
}

import { randomUUID } from "node:crypto";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
export type ShopifyControlledProofPlan = {
  operation: "shopify.controlled_webhook_create_delete_proof";
  provider: "shopify";
  connectionId: string;
  shopDomain: string;
  callbackUrl: string;
  topic: "APP_UNINSTALLED";
  requiredPermission: "actions.execute";
  confirmationRequired: true;
  recovery: "reversible";
};
function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("m15_shopify_intent_persistence_unavailable");
  return { url, key };
}
export async function issueShopifyControlledProofIntent(
  session: TraceKitSessionContext,
  input: {
    plan: ShopifyControlledProofPlan;
    planIdentity: string;
    auditCorrelationId: string;
    issuedAt: string;
    expiresAt: string;
  },
) {
  const { url, key } = cfg(),
    intentId = randomUUID(),
    res = await fetch(`${url}/rest/v1/mcp_action_intents`, {
      method: "POST",
      headers: {
        ...supabaseAuthHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        intent_id: intentId,
        organization_id: session.activeOrganization!.id,
        actor_user_id: session.user.id,
        plan_identity: input.planIdentity,
        customer_id: null,
        journey_id: null,
        operation: input.plan.operation,
        target_kind: "shopify_webhook_subscription",
        target: {
          connectionId: input.plan.connectionId,
          shopDomain: input.plan.shopDomain,
          callbackUrl: input.plan.callbackUrl,
          topic: input.plan.topic,
        },
        plan: input.plan,
        audit_correlation_id: input.auditCorrelationId,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
      }),
    });
  if (!res.ok)
    throw new Error(`m15_shopify_intent_issue_failed:http_${res.status}`);
  const recovery = await fetch(`${url}/rest/v1/mcp_shopify_mutation_recovery`, {
    method: "POST",
    headers: {
      ...supabaseAuthHeaders(key),
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      organization_id: session.activeOrganization!.id,
      intent_id: intentId,
      plan_identity: input.planIdentity,
      shop_domain: input.plan.shopDomain,
      callback_url: input.plan.callbackUrl,
      topic: input.plan.topic,
      state: "prepared",
      audit_correlation_id: input.auditCorrelationId,
    }),
  });
  if (!recovery.ok)
    throw new Error(
      `m15_shopify_recovery_issue_failed:http_${recovery.status}`,
    );
  return { intentId };
}

export async function resolveShopifyControlledProofConfirmation(
  session: TraceKitSessionContext,
  input: { confirmationId: string; requestedAt: string },
) {
  const { url, key } = cfg(),
    res = await fetch(
      `${url}/rest/v1/rpc/resolve_mcp_shopify_action_confirmation`,
      {
        method: "POST",
        headers: {
          ...supabaseAuthHeaders(key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_confirmation_id: input.confirmationId,
          p_organization_id: session.activeOrganization!.id,
          p_actor_user_id: session.user.id,
          p_requested_at: input.requestedAt,
        }),
      },
    );
  if (!res.ok)
    throw new Error(
      `m15_shopify_confirmation_resolve_failed:http_${res.status}`,
    );
  const rows = (await res.json()) as any[];
  return rows[0] || null;
}

export async function resolveCompletedShopifyControlledProofReplay(
  session: TraceKitSessionContext,
  input: {
    confirmationId: string;
    requestedAt: string;
    idempotencyKey: string;
  },
) {
  const { url, key } = cfg(),
    res = await fetch(
      `${url}/rest/v1/rpc/resolve_completed_mcp_shopify_execution_replay`,
      {
        method: "POST",
        headers: {
          ...supabaseAuthHeaders(key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_confirmation_id: input.confirmationId,
          p_organization_id: session.activeOrganization!.id,
          p_actor_user_id: session.user.id,
          p_expected_operation:
            "shopify.controlled_webhook_create_delete_proof",
          p_expected_target_kind: "shopify_webhook_subscription",
          p_requested_at: input.requestedAt,
          p_idempotency_key: input.idempotencyKey,
        }),
      },
    );
  if (!res.ok)
    throw new Error(
      `m15_shopify_completed_replay_resolve_failed:http_${res.status}`,
    );
  const rows = (await res.json()) as any[];
  return rows[0] || null;
}

export async function authorizeShopifyControlledProofExecution(
  session: TraceKitSessionContext,
  input: {
    confirmationId: string;
    planIdentity: string;
    envelopeIdentity: string;
    idempotencyKey: string;
    auditCorrelationId: string;
    consumptionId: string;
    requestedAt: string;
  },
) {
  const { url, key } = cfg(),
    res = await fetch(
      `${url}/rest/v1/rpc/authorize_mcp_shopify_execution_atomic`,
      {
        method: "POST",
        headers: {
          ...supabaseAuthHeaders(key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_confirmation_id: input.confirmationId,
          p_organization_id: session.activeOrganization!.id,
          p_actor_user_id: session.user.id,
          p_expected_operation:
            "shopify.controlled_webhook_create_delete_proof",
          p_expected_target_kind: "shopify_webhook_subscription",
          p_expected_plan_identity: input.planIdentity,
          p_authorization_id: randomUUID(),
          p_envelope_identity: input.envelopeIdentity,
          p_idempotency_key: input.idempotencyKey,
          p_audit_correlation_id: input.auditCorrelationId,
          p_consumption_id: input.consumptionId,
          p_requested_at: input.requestedAt,
        }),
      },
    );
  if (!res.ok)
    throw new Error(
      `m15_shopify_execution_authorization_failed:http_${res.status}`,
    );
  const rows = (await res.json()) as any[],
    row = rows[0];
  if (!row) return { decision: "reject" as const, consumptionId: null };
  return {
    decision: row.decision as
      "consume" | "reject" | "replay_result_unavailable",
    consumptionId: row.consumption_id as string | null,
  };
}

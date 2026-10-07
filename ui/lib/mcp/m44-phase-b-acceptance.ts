import "server-only";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";

export const WS019_M44_PHASE_B = {
  namespace: "ws019.m4.4.phase_b",
  organizationId: "8f6bb14b-2126-49b8-bfdb-c60edbc3549b",
  intents: {
    awaiting: "b4400000-0000-4000-8000-000000000001",
    executionFailure: "b4400000-0000-4000-8000-000000000002",
    incompleteRecovery: "b4400000-0000-4000-8000-000000000003",
  },
  confirmations: {
    awaitingResolution: "b4450000-0000-4000-8000-000000000001",
    executionFailure: "b4450000-0000-4000-8000-000000000002",
    incompleteRecovery: "b4450000-0000-4000-8000-000000000003",
  },
  authorization: "b4410000-0000-4000-8000-000000000002",
  consumption: "b4420000-0000-4000-8000-000000000002",
  executionResult: "b4430000-0000-4000-8000-000000000002",
  recovery: "b4440000-0000-4000-8000-000000000003",
  correlations: {
    awaiting: "ws019.m4.4.phase_b:awaiting",
    executionFailure: "ws019.m4.4.phase_b:execution_failure",
    incompleteRecovery: "ws019.m4.4.phase_b:incomplete_recovery",
  },
  idempotencyKey: "acceptance-idempotency:ws019.m4.4.phase_b:execution_failure",
  notificationIds: {
    awaiting: "action_notification:awaiting_approval:b4400000-0000-4000-8000-000000000001",
    executionFailure: "action_notification:execution_failure:b4430000-0000-4000-8000-000000000002",
    incompleteRecovery: "action_notification:verification_failure:b4440000-0000-4000-8000-000000000003",
  },
} as const;

export type Ws019M44FixtureOperation = "create" | "resolve-awaiting" | "resolve-recovery";

const RPC: Record<Ws019M44FixtureOperation, string> = {
  create: "create_ws019_m44_phase_b_fixture",
  "resolve-awaiting": "resolve_ws019_m44_phase_b_awaiting",
  "resolve-recovery": "resolve_ws019_m44_phase_b_recovery",
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("acceptance_fixture_unavailable");
  return { url, key };
}

export async function runWs019M44PhaseBFixture(
  operation: Ws019M44FixtureOperation,
  input: { organizationId: string; actorUserId: string },
) {
  if (input.organizationId !== WS019_M44_PHASE_B.organizationId || !input.actorUserId) {
    throw new Error("acceptance_fixture_unavailable");
  }
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/rpc/${RPC[operation]}`, {
    method: "POST",
    cache: "no-store",
    headers: { ...supabaseAuthHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
    }),
  });
  if (!response.ok) throw new Error("acceptance_fixture_unavailable");
  return response.json() as Promise<Record<string, unknown>>;
}

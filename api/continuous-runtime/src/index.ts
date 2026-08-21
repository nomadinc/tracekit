import { isConnectedCommasConnection, validateCommerceQueueMessage, type CommerceQueueMessage } from "../../src/continuous-commerce-cloudflare.ts";

export type ContinuousRuntimeEnv = {
  TRACEKIT_COMMERCE_SCHEDULER_ENABLED?: string;
  TRACEKIT_COMMERCE_KILL_SWITCH?: string;
};

type Scope = { provider?: unknown; status?: unknown; connectionId?: unknown; organizationId?: unknown; providerAccountId?: unknown };

const json = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function validateRuntimeScope(scope: unknown): Scope {
  if (!scope || typeof scope !== "object") throw new Error("continuous_runtime_scope_unavailable");
  const value = scope as Scope;
  if (!isConnectedCommasConnection(value) || typeof value.connectionId !== "string" || typeof value.organizationId !== "string" || typeof value.providerAccountId !== "string") throw new Error("continuous_runtime_provider_scope_invalid");
  return value;
}

export function validateRuntimeMessage(value: unknown): CommerceQueueMessage {
  return validateCommerceQueueMessage(value);
}

export default {
  async fetch(request: Request, env: ContinuousRuntimeEnv) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/commerce/sync") return json({ ok: false, error: "not_found" }, 404);
    if (env.TRACEKIT_COMMERCE_SCHEDULER_ENABLED !== "true" || env.TRACEKIT_COMMERCE_KILL_SWITCH !== "enabled") return json({ ok: false, error: "continuous_runtime_disabled" }, 503);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    try {
      const message = validateRuntimeMessage(body);
      // The inert deployment deliberately requires a separately resolved, connected
      // Commas scope before any future provider runtime can be invoked.
      validateRuntimeScope((body as { scope?: unknown }).scope);
      return json({ ok: false, error: "continuous_runtime_not_provisioned", mode: message.requested_mode }, 501);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "invalid_runtime_request" }, 400);
    }
  },
};

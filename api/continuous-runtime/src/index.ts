import { isConnectedCommasConnection, isRuntimeDispatchProbe, validateCommerceQueueMessage, type CommerceQueueMessage } from "../../src/continuous-commerce-cloudflare.ts";

export type ContinuousRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  COMMERCE_CREDENTIALS_ENC_KEY?: string;
  COMMERCE_CREDENTIALS_KEY_ID?: string;
  COMMERCE_CREDENTIALS_ENCRYPTION_VERSION?: string;
  CONTINUOUS_RUNTIME_SHARED_SECRET?: string;
  TRACEKIT_COMMERCE_SCHEDULER_ENABLED?: string;
  TRACEKIT_COMMERCE_KILL_SWITCH?: string;
};

type Scope = { provider?: unknown; status?: unknown; connectionId?: unknown; organizationId?: unknown; providerAccountId?: unknown };
const json = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const isUuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
export function validateScheduledQuotaBootstrap(value:unknown){const v=value&&typeof value==="object"?value as Record<string,unknown>:{};if(Object.keys(v).some(key=>!["claim_token","organization_id","connection_id","provider_account_id"].includes(key))||!isUuid(v.claim_token)||!isUuid(v.organization_id)||!isUuid(v.connection_id)||!isUuid(v.provider_account_id))throw new Error("scheduled_quota_bootstrap_invalid");return{claimToken:String(v.claim_token),organizationId:String(v.organization_id),connectionId:String(v.connection_id),providerAccountId:String(v.provider_account_id)}}

export function validateRuntimeScope(scope: unknown): Scope {
  if (!scope || typeof scope !== "object") throw new Error("continuous_runtime_scope_unavailable");
  const value = scope as Scope;
  if (!isConnectedCommasConnection(value) || !isUuid(value.connectionId) || !isUuid(value.organizationId) || !isUuid(value.providerAccountId)) throw new Error("continuous_runtime_provider_scope_invalid");
  return value;
}

export function validateRuntimeMessage(value: unknown): CommerceQueueMessage {
  const message = validateCommerceQueueMessage(value);
  if (message.bootstrap === true && (message.requested_mode !== "continuous" || message.job_type !== "commerce_continuous")) throw new Error("continuous_runtime_bootstrap_mode_invalid");
  return message;
}

function installRuntimeEnvironment(env: ContinuousRuntimeEnv) {
  const runtimeProcess = (globalThis as { process?: { env: Record<string, string | undefined> } }).process ?? { env: {} };
  runtimeProcess.env.NEXT_PUBLIC_SUPABASE_URL = env.SUPABASE_URL;
  runtimeProcess.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  runtimeProcess.env.COMMERCE_CREDENTIALS_ENC_KEY = env.COMMERCE_CREDENTIALS_ENC_KEY;
  runtimeProcess.env.COMMERCE_CREDENTIALS_KEY_ID = env.COMMERCE_CREDENTIALS_KEY_ID;
  runtimeProcess.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION = env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1";
  (globalThis as { process?: unknown }).process = runtimeProcess;
}

export default {
  async fetch(request: Request, env: ContinuousRuntimeEnv) {
    const url = new URL(request.url);
    if (request.method !== "POST" || !["/v1/commerce/sync","/v1/commerce/scheduled-quota-bootstrap"].includes(url.pathname)) return json({ ok: false, error: "not_found" }, 404);
    if (!env.CONTINUOUS_RUNTIME_SHARED_SECRET || request.headers.get("x-tracekit-runtime-secret") !== env.CONTINUOUS_RUNTIME_SHARED_SECRET) return json({ ok: false, error: "continuous_runtime_internal_only" }, 403);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    try {
      if(url.pathname==="/v1/commerce/scheduled-quota-bootstrap"){
        if(env.TRACEKIT_COMMERCE_KILL_SWITCH!=="enabled"||env.TRACEKIT_COMMERCE_SCHEDULER_ENABLED!=="true")return json({ok:false,error:"continuous_runtime_disabled"},503);
        installRuntimeEnvironment(env);
        const input=validateScheduledQuotaBootstrap(body);
        const{runScheduledCommasQuotaBootstrap}=await import("../../../ui/lib/commerce/commas-continuous-worker.ts");
        const result=await runScheduledCommasQuotaBootstrap(input);
        return json({ok:true,providerRequests:result.providerRequests,quotaRemaining:result.quotaRemaining,observedAt:result.observedAt},200);
      }
      if (isRuntimeDispatchProbe(body)) return json({ ok: true, probe: "runtime-dispatch-probe", runtimeReached: true, authPassed: true, statusCode: 200 }, 200);
      const message = validateRuntimeMessage(body);
      const bootstrap = message.bootstrap === true && message.bootstrap_mode === "quota-bootstrap";
      const manual = message.manual === true;
      const operatorOneShot = message.operator_one_shot === true;
      if ((operatorOneShot || !bootstrap && !manual) && env.TRACEKIT_COMMERCE_KILL_SWITCH !== "enabled") return json({ ok: false, error: "continuous_runtime_disabled" }, 503);
      if (!operatorOneShot && !bootstrap && !manual && env.TRACEKIT_COMMERCE_SCHEDULER_ENABLED !== "true") return json({ ok: false, error: "continuous_runtime_disabled" }, 503);
      const scope = validateRuntimeScope({ provider: message.provider, status: "connected", connectionId: message.connection_id, organizationId: message.organization_id, providerAccountId: message.provider_account_id });
      installRuntimeEnvironment(env);
      const mode = message.requested_mode === "deep_reconciliation" ? "deep_reconciliation" : "continuous";
      const { runContinuousCommasSync } = await import("../../../ui/lib/commerce/commas-continuous-worker.ts");
      const evidenceOnlyRecovery = message.evidence_only_recovery === true;
      const result = await runContinuousCommasSync({ mode, bootstrap, evidenceOnlyRecovery, maxPages: bootstrap ? 1 : operatorOneShot ? message.max_pages : undefined, maxProviderRequests: message.scheduled_deep===true ? message.max_provider_requests : undefined, perPage: bootstrap ? 1 : operatorOneShot ? message.per_page : undefined, overlapPages: bootstrap ? 1 : undefined, requestKey: message.request_key || message.scheduler_identity, expectedScope: { organizationId: String(scope.organizationId), connectionId: String(scope.connectionId), providerAccountId: String(scope.providerAccountId) } });
      return json({ ok: true, status: result.status, providerRequests: result.providerRequests, pagesScanned: result.pagesScanned, rateLimitStart: result.rateLimitStart, rateLimitEnd: result.rateLimitEnd }, 200);
    } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "continuous_runtime_failed" }, 400); }
  },
};

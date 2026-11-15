import { requireResourceScope } from "./authorization-gateway";
import type { Permission } from "./permissions";
import type { TraceKitSessionContext } from "./persistent-types";
import { ACTOR_HINT_KEYS, callerHintsMatch, TENANT_HINT_KEYS } from "./operational-tenant-boundary";

export type CustomerReadDiagnostic = {
  correlationId: string;
  route: string;
  deploymentId: string | null;
  organizationId: string | null;
  businessContextId: string | null;
  stage: "session_scope" | "tenant_hint_mismatch" | "business_context_mismatch" | "core_transport" | "core_upstream_status" | "projection_failure";
  upstreamStatus: number | null;
};

type Dependencies = {
  resolveSession: () => Promise<{ kind: string; session?: TraceKitSessionContext }>;
  apiBaseUrl: () => string;
  adminSecret: () => string;
  fetch: typeof fetch;
  customerReadDiagnostic?: (event: CustomerReadDiagnostic) => void;
};
// The production adapter supplies authenticated persistent identity. Test
// dependencies exercise the same permission, tenant and transport boundary.
export function createScopedCoreProxy(dependencies: Dependencies) {
async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function unavailable() {
  return { status: 404, body: { error: "The requested resource is unavailable." } };
}

async function authorizedScope(permission: Permission | readonly Permission[]) {
  const resolution = await dependencies.resolveSession();
  if (resolution.kind !== "authenticated" || !resolution.session?.activeOrganization) return null;
  try {
    for (const capability of (typeof permission === "string" ? [permission] : permission)) requireResourceScope(resolution.session, resolution.session.activeOrganization.id, capability);
  } catch {
    return null;
  }
  return { session: resolution.session, workspaceId: resolution.session.activeOrganization.id };
}

function queryMatchesScope(params: URLSearchParams, workspaceId: string) {
  return TENANT_HINT_KEYS.every((key) => params.getAll(key).every((value) => value === workspaceId));
}

function bodyMatchesScope(body: Record<string, unknown>, session: TraceKitSessionContext, workspaceId: string) {
  return callerHintsMatch(body, TENANT_HINT_KEYS, workspaceId)
    && callerHintsMatch(body, ACTOR_HINT_KEYS, session.user.id);
}

async function scopedCoreGet(
  upstreamPath: string,
  requestUrl: string,
  permission: Permission | readonly Permission[],
  project?: (body: any, session: TraceKitSessionContext) => unknown,
) {
  const incoming = new URL(requestUrl);
  // Diagnostics are restricted to Customer List and Customer Detail. No query,
  // path identifiers, headers, or upstream payloads are recorded.
  const customerRoute = /^\\/api\\/customers(?:\\/[^/]+)?$/.test(incoming.pathname);
  const correlationId = crypto.randomUUID();
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || null;
  const record = (stage: CustomerReadDiagnostic["stage"], upstreamStatus: number | null, session?: TraceKitSessionContext) => {
    if (!customerRoute) return;
    try {
      dependencies.customerReadDiagnostic?.({ correlationId, route: incoming.pathname === "/api/customers" ? "/api/customers" : "/api/customers/:customerId", deploymentId,
        organizationId: session?.activeOrganization?.id || null, businessContextId: session?.activeBusinessContextId || null, stage, upstreamStatus });
    } catch { /* Observability must never alter authorization or response. */ }
  };
  const scope = await authorizedScope(permission);
  if (!scope) { record("session_scope", null); return unavailable(); }

  const params = new URLSearchParams(incoming.searchParams);
  if (!queryMatchesScope(params, scope.workspaceId)) { record("tenant_hint_mismatch", null, scope.session); return unavailable(); }
  // Tenant scope is authoritative from the authenticated TraceKit session.
  // Browser-supplied workspace_id is never forwarded.
  for (const key of TENANT_HINT_KEYS) params.delete(key);
  params.set("workspace_id", scope.workspaceId);
  if (params.getAll("business_context_id").some(value => value !== scope.session.activeBusinessContextId)) { record("business_context_mismatch", null, scope.session); return unavailable(); }
  params.delete("business_context_id");
  if (scope.session.activeBusinessContextId) params.set("business_context_id", scope.session.activeBusinessContextId);
  const query = params.toString();

  const secret = dependencies.adminSecret();
  if (!secret) {
    return { status: 500, body: { ok: false, error: "admin_auth_not_configured", message: "TraceKit Core authentication is unavailable." } };
  }

  let res: Response;
  try { res = await dependencies.fetch(`${dependencies.apiBaseUrl()}${upstreamPath}${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json", "x-tk-secret": secret },
  });
  } catch { record("core_transport", null, scope.session); return { status: 503, body: { error: "The requested data is unavailable." } }; }
  if (!res.ok) { record("core_upstream_status", res.status, scope.session); return { status: res.status, body: { error: "The requested resource is unavailable." } }; }
  const body = await readJsonSafe(res);
  try { return { status: res.status, body: project ? project(body, scope.session) : body }; }
  catch { record("projection_failure", res.status, scope.session); return { status: 503, body: { error: "The requested data is unavailable." } }; }
}

async function scopedCorePost(
  upstreamPath: string,
  request: Request,
  permission: Permission | readonly Permission[],
  options: {
    includeActor?: boolean;
    includeCorrelation?: boolean;
    rejectCallerScopeHints?: boolean;
    allowedCallerKeys?: readonly string[];
  } = {},
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return { status: 403, body: { error: "Request verification failed." } };
  }
  const scope = await authorizedScope(permission);
  if (!scope) return unavailable();

  const incoming = new URL(request.url);
  if (!queryMatchesScope(incoming.searchParams, scope.workspaceId)) return unavailable();
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: 400, body: { error: "Invalid request body." } };
  }
  const body = raw as Record<string, unknown>;
  const suppliedScopeHints = [...TENANT_HINT_KEYS, ...ACTOR_HINT_KEYS].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (options.rejectCallerScopeHints && suppliedScopeHints) return unavailable();
  if (!bodyMatchesScope(body, scope.session, scope.workspaceId)) return unavailable();
  if (options.allowedCallerKeys) {
    const allowed = new Set(options.allowedCallerKeys);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      return { status: 400, body: { error: "Invalid request body." } };
    }
  }
  const sanitized = { ...body };
  for (const key of [...TENANT_HINT_KEYS, ...ACTOR_HINT_KEYS]) delete sanitized[key];
  sanitized.workspace_id = scope.workspaceId;
  if (options.includeActor) sanitized.actor_id = scope.session.user.id;
  if (options.includeCorrelation) sanitized.correlation_id = scope.session.correlationId;

  const secret = dependencies.adminSecret();
  if (!secret) {
    return { status: 500, body: { ok: false, error: "admin_auth_not_configured", message: "TraceKit Core authentication is unavailable." } };
  }
  let res: Response;
  try { res = await dependencies.fetch(`${dependencies.apiBaseUrl()}${upstreamPath}`, {
    method: "POST",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json", "x-tk-secret": secret },
    body: JSON.stringify(sanitized),
  });
  } catch { return { status: 503, body: { error: "The requested data is unavailable." } }; }
  return { status: res.status, body: res.ok ? await readJsonSafe(res) : { error: "The requested resource is unavailable." } };
}

return { scopedCoreGet, scopedCorePost };
}

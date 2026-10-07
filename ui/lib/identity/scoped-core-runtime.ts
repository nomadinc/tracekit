import { requireResourceScope } from "./authorization-gateway";
import type { Permission } from "./permissions";
import type { TraceKitSessionContext } from "./persistent-types";
import { ACTOR_HINT_KEYS, callerHintsMatch, TENANT_HINT_KEYS } from "./operational-tenant-boundary";

type Dependencies = {
  resolveSession: () => Promise<{ kind: string; session?: TraceKitSessionContext }>;
  apiBaseUrl: () => string;
  adminSecret: () => string;
  fetch: typeof fetch;
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
  const scope = await authorizedScope(permission);
  if (!scope) return unavailable();

  const incoming = new URL(requestUrl);
  const params = new URLSearchParams(incoming.searchParams);
  if (!queryMatchesScope(params, scope.workspaceId)) return unavailable();
  // Tenant scope is authoritative from the authenticated TraceKit session.
  // Browser-supplied workspace_id is never forwarded.
  for (const key of TENANT_HINT_KEYS) params.delete(key);
  params.set("workspace_id", scope.workspaceId);
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
  } catch { return { status: 503, body: { error: "The requested data is unavailable." } }; }
  if (!res.ok) return { status: res.status, body: { error: "The requested resource is unavailable." } };
  const body = await readJsonSafe(res);
  return { status: res.status, body: res.ok && project ? project(body, scope.session) : body };
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

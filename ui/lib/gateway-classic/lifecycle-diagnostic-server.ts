export const BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST = Object.freeze({
  workspace_id: "default",
  from: "2026-05-01",
  to: "2026-05-01",
  platforms: Object.freeze(["nmi:blackboxproducts0362"]),
  gateway_page_size: 25,
  gateway_max_pages: 1,
  dry_run: true,
  force_new_job: true,
});

export type LifecycleDiagnosticAuthorization =
  | { kind: "authorized"; organizationId: string }
  | { kind: "unauthenticated" | "no_active_organization" | "forbidden" };

export type LifecycleDiagnosticProxyDependencies = {
  authorize: () => Promise<LifecycleDiagnosticAuthorization>;
  apiBaseUrl: string;
  adminSecret: string;
  fetchImpl?: typeof fetch;
};

const EXACT_FIELDS = new Set(Object.keys(BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST));
const SAFE_JOB_STATUSES = new Set(["queued", "pending", "running", "completed", "failed", "paused", "cancelled", "canceled"]);

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store, private" },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

function isExactApprovedRequest(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== EXACT_FIELDS.size || keys.some((key) => !EXACT_FIELDS.has(key))) return false;
  return body.workspace_id === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.workspace_id
    && body.from === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.from
    && body.to === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.to
    && Array.isArray(body.platforms)
    && body.platforms.length === 1
    && body.platforms[0] === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.platforms[0]
    && body.gateway_page_size === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.gateway_page_size
    && body.gateway_max_pages === BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.gateway_max_pages
    && body.dry_run === true
    && body.force_new_job === true;
}

function safeJobId(value: unknown) {
  const id = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return /^[a-zA-Z0-9-]{1,80}$/.test(id) ? id : null;
}

function safeJobStatus(value: unknown) {
  const status = String(value || "").toLowerCase();
  return SAFE_JOB_STATUSES.has(status) ? status : null;
}

export async function handleBlackboxLifecycleDiagnosticProxy(
  request: Request,
  dependencies: LifecycleDiagnosticProxyDependencies,
) {
  if (!sameOrigin(request)) return response({ ok: false, error: "request_verification_failed" }, 403);
  if (request.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);
  if (Array.from(new URL(request.url).searchParams).length) return response({ ok: false, error: "bad_request" }, 400);

  const authorization = await dependencies.authorize();
  if (authorization.kind !== "authorized" || !authorization.organizationId) {
    return response({ ok: false, error: "resource_unavailable" }, 404);
  }

  const body = await request.json().catch(() => null);
  if (!isExactApprovedRequest(body)) return response({ ok: false, error: "approved_contract_required" }, 400);
  if (!dependencies.apiBaseUrl || !dependencies.adminSecret) {
    return response({ ok: false, error: "diagnostic_proxy_unavailable" }, 503);
  }

  const fetchImpl = dependencies.fetchImpl || fetch;
  const upstream = await fetchImpl(
    `${dependencies.apiBaseUrl.replace(/\/+$/, "")}/v1/chargebacks/backfill`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-tk-secret": dependencies.adminSecret,
      },
      body: JSON.stringify(BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST),
    },
  );
  const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
  if (!upstream.ok || payload.ok !== true) {
    return response({
      ok: false,
      status: upstream.status,
      error: "diagnostic_start_failed",
      message: "The bounded lifecycle diagnostic could not be started.",
    }, upstream.status >= 500 ? 502 : 409);
  }

  const job = payload.job && typeof payload.job === "object" ? payload.job as Record<string, unknown> : {};
  return response({
    ok: true,
    status: upstream.status,
    reused: payload.reused === true,
    job_id: safeJobId(job.id),
    job_status: safeJobStatus(job.status),
    platform: BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.platforms[0],
    from: BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.from,
    to: BLACKBOX_LIFECYCLE_DIAGNOSTIC_REQUEST.to,
    dry_run: true,
    gateway_page_size: 25,
    gateway_max_pages: 1,
  }, upstream.status);
}

export type GatewayClassicOperation = "list" | "status" | "import-one-page";

export type GatewayClassicAuthorization =
  | { kind: "authorized"; organizationId: string }
  | { kind: "unauthenticated" | "forbidden" };

export type GatewayClassicProxyDependencies = {
  authorize: () => Promise<GatewayClassicAuthorization>;
  apiBaseUrl: string;
  adminSecret: string;
  fetchImpl?: typeof fetch;
};

const PLATFORM_PATTERN = /^(?:nmi:[a-z0-9][a-z0-9._-]{0,127}|paydiverse(?::[a-z0-9][a-z0-9._-]{0,127})?)$/;
const IMPORT_FIELDS = new Set(["platform", "from", "to", "page", "pageSize"]);

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

function platform(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return PLATFORM_PATTERN.test(normalized) ? normalized : null;
}

function ymd(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : null;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function safeCode(value: unknown, fallback: string) {
  const code = String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return code || fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function sanitizeSuccess(operation: GatewayClassicOperation, payload: Record<string, unknown>) {
  if (operation === "list") {
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    return {
      ok: true,
      accounts: accounts.map((value) => {
        const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return {
          platform: text(row.platform) || "",
          base_url: text(row.base_url) || "",
          username: text(row.username) || "",
          created_at: text(row.created_at),
          updated_at: text(row.updated_at),
        };
      }),
    };
  }
  if (operation === "status") {
    return {
      ok: true,
      connected: payload.connected === true,
      platform: text(payload.platform),
      baseUrl: text(payload.baseUrl) || "",
      username: text(payload.username) || "",
      created_at: text(payload.created_at),
      updated_at: text(payload.updated_at),
    };
  }
  return {
    ok: true,
    platform: text(payload.platform),
    connector: payload.connector === "classic_query" ? "classic_query" : null,
    from: text(payload.from),
    to: text(payload.to),
    fetched: Number.isFinite(payload.fetched) ? Number(payload.fetched) : 0,
    upserted: Number.isFinite(payload.upserted) ? Number(payload.upserted) : 0,
    page: Number.isFinite(payload.page) ? Number(payload.page) : 0,
    pageSize: Number.isFinite(payload.pageSize) ? Number(payload.pageSize) : 0,
    hasMore: payload.hasMore === true,
    nextPage: Number.isFinite(payload.nextPage) ? Number(payload.nextPage) : null,
    latest_source_event_at: text(payload.latest_source_event_at),
  };
}

async function upstreamPayload(upstream: Response) {
  const value = await upstream.json().catch(() => ({}));
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function handleGatewayClassicProxy(
  request: Request,
  operationValue: string,
  dependencies: GatewayClassicProxyDependencies,
) {
  if (!sameOrigin(request)) return response({ ok: false, error: "request_verification_failed" }, 403);
  if (!["list", "status", "import-one-page"].includes(operationValue)) {
    return response({ ok: false, error: "operation_not_allowed" }, 404);
  }
  const operation = operationValue as GatewayClassicOperation;
  const authorization = await dependencies.authorize();
  if (authorization.kind !== "authorized" || !authorization.organizationId) {
    return response({ ok: false, error: "resource_unavailable" }, 404);
  }
  if (!dependencies.apiBaseUrl || !dependencies.adminSecret) {
    return response({ ok: false, error: "gateway_proxy_unavailable" }, 503);
  }

  const requestUrl = new URL(request.url);
  let upstreamPath: string;
  let init: RequestInit;
  if (operation === "list") {
    if (request.method !== "GET" || Array.from(requestUrl.searchParams).length) {
      return response({ ok: false, error: "bad_request" }, request.method === "GET" ? 400 : 405);
    }
    upstreamPath = "/v1/integrations/gateway-classic/list";
    init = { method: "GET" };
  } else if (operation === "status") {
    const entries = Array.from(requestUrl.searchParams);
    const requestedPlatform = platform(requestUrl.searchParams.get("platform"));
    if (request.method !== "GET" || entries.length !== 1 || entries[0][0] !== "platform" || !requestedPlatform) {
      return response({ ok: false, error: "bad_request" }, request.method === "GET" ? 400 : 405);
    }
    upstreamPath = `/v1/integrations/gateway-classic/status?platform=${encodeURIComponent(requestedPlatform)}`;
    init = { method: "GET" };
  } else {
    if (request.method !== "POST" || Array.from(requestUrl.searchParams).length) {
      return response({ ok: false, error: "bad_request" }, request.method === "POST" ? 400 : 405);
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Object.keys(body).some((key) => !IMPORT_FIELDS.has(key))) {
      return response({ ok: false, error: "bad_request" }, 400);
    }
    const requestedPlatform = platform(body.platform);
    const from = ymd(body.from);
    const to = ymd(body.to);
    const page = integer(body.page, 0, 0, 1000000);
    const pageSize = integer(body.pageSize, 1000, 1, 1000);
    if (!requestedPlatform || !from || !to || from > to || page === null || pageSize === null) {
      return response({ ok: false, error: "bad_request" }, 400);
    }
    upstreamPath = "/v1/integrations/gateway-classic/import-one-page";
    init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: requestedPlatform, from, to, page, pageSize }),
    };
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-tk-secret", dependencies.adminSecret);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const upstream = await fetchImpl(`${dependencies.apiBaseUrl.replace(/\/+$/, "")}${upstreamPath}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  const payload = await upstreamPayload(upstream);
  if (!upstream.ok || payload.ok !== true) {
    return response({
      ok: false,
      error: safeCode(payload.error, `worker_http_${upstream.status}`),
      message: "Gateway Classic request failed.",
    }, upstream.status);
  }
  return response(sanitizeSuccess(operation, payload), upstream.status);
}

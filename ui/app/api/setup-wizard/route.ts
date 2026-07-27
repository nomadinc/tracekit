import { NextResponse } from "next/server";

function apiBaseUrl() {
  return String(
    process.env.TRACEKIT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    "http://127.0.0.1:8787"
  ).replace(/\/+$/, "");
}

function adminSecret() {
  return String(
    process.env.TK_SECRET_KEY ||
    process.env.TRACEKIT_TK_SECRET ||
    ""
  ).trim();
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 400) };
  }
}

async function workerFetch(path: string, init: RequestInit = {}, options: { admin?: boolean } = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (options.admin) {
    const secret = adminSecret();
    if (!secret) {
      console.error("[Setup Wizard] Admin proxy secret is not configured.");
      return {
        ok: false,
        status: 500,
        body: {
          ok: false,
          error: "admin_auth_not_configured",
          message: "Setup services are temporarily unavailable. Please contact your administrator if the issue continues.",
        },
      };
    }
    headers.set("x-tk-secret", secret);
  }
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status, body: await readJsonSafe(res) };
}

function workspaceIdFromRequest(req: Request, body?: any) {
  const url = new URL(req.url);
  return String(body?.workspace_id || body?.workspaceId || url.searchParams.get("workspace_id") || "default").trim() || "default";
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function getSetupSnapshot(workspaceId: string, includeValidation = true) {
  const encodedWorkspace = encodeURIComponent(workspaceId);
  const [onboarding, browser, policy, commissions, payoutValidation] = await Promise.all([
    workerFetch(`/v1/setup-wizard?workspace_id=${encodedWorkspace}`, { method: "GET" }, { admin: true }),
    workerFetch(`/v1/browser/setup?workspace_id=${encodedWorkspace}`, { method: "GET" }, { admin: true }),
    workerFetch(`/v1/payouts/attribution-policy?workspace_id=${encodedWorkspace}`, { method: "GET" }),
    workerFetch(`/v1/payouts/affiliate-commissions?workspace_id=${encodedWorkspace}&status=draft&limit=5`, { method: "GET" }),
    includeValidation
      ? workerFetch("/v1/payouts/affiliate-commissions/generate", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: workspaceId,
          dry_run: true,
          limit: 100,
        }),
      })
      : Promise.resolve({ ok: true, status: 200, body: null }),
  ]);

  const failures = [
    ["onboarding", onboarding],
    ["browser", browser],
    ["policy", policy],
    ["commissions", commissions],
    ["payout_validation", payoutValidation],
  ].filter(([, result]: any) => result && !result.ok);

  if (failures.length) {
    console.error("[Setup Wizard] Snapshot section failures", failures.map(([section, result]: any) => ({
      section,
      status: result.status,
      error: result.body?.error || "request_failed",
      message: result.body?.message || null,
    })));
  }

  return {
    ok: failures.length === 0,
    workspace_id: workspaceId,
    generated_at: new Date().toISOString(),
    onboarding: onboarding.body?.onboarding || null,
    browser: browser.body || null,
    attribution_policy: policy.body?.policy || null,
    payout_validation: payoutValidation.body || null,
    latest_draft_commissions: commissions.body?.commissions || [],
    diagnostics: {
      api_base_configured: Boolean(apiBaseUrl()),
      admin_proxy_configured: Boolean(adminSecret()),
      failed_sections: failures.map(([section, result]: any) => ({
        section,
        status: result.status,
        error: result.body?.error || "request_failed",
        message: "Setup services are temporarily unavailable. Please contact your administrator if the issue continues.",
      })),
    },
  };
}

export async function GET(req: Request) {
  const workspaceId = workspaceIdFromRequest(req);
  const snapshot = await getSetupSnapshot(workspaceId).catch((error: any) => ({
    ok: false,
    workspace_id: workspaceId,
    error: "setup_snapshot_failed",
    message: error?.message || String(error),
  }));
  return NextResponse.json(snapshot, { status: snapshot.ok === false ? 500 : 200 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();
  const workspaceId = workspaceIdFromRequest(req, body);
  let result;

  if (action === "save_workspace") {
    result = await workerFetch("/v1/setup-wizard/workspace", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
        workspace_name: body.workspace_name,
        primary_website_url: body.primary_website_url,
        default_timezone: body.default_timezone,
        default_currency: body.default_currency,
        current_step: body.current_step || "browser_tracking",
        completed_steps: body.completed_steps || ["workspace"],
      }),
    }, { admin: true });
  } else if (action === "save_progress") {
    result = await workerFetch("/v1/setup-wizard/progress", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
        current_step: body.current_step,
        completed_steps: body.completed_steps || [],
        dismissed_warnings: body.dismissed_warnings || [],
        completed_at: body.completed_at,
        mark_completed: body.mark_completed,
      }),
    }, { admin: true });
  } else if (action === "configure_browser") {
    result = await workerFetch("/v1/browser/config", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
        allowed_origins: body.allowed_origins || [],
        rate_limit_per_minute: body.rate_limit_per_minute || 120,
        cross_subdomain_cookie_domain: body.cross_subdomain_cookie_domain || null,
        is_active: true,
      }),
    }, { admin: true });
  } else if (action === "save_policy") {
    result = await workerFetch("/v1/payouts/attribution-policy", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
        active_model: body.active_model || "first_touch",
        model_version: body.model_version || "v1",
        default_commission_rate: Number(body.default_commission_rate || 0),
        status: "active",
        metadata: {
          source: "setup_wizard",
          saved_at: new Date().toISOString(),
        },
      }),
    });
  } else if (action === "run_payout_validation") {
    result = await workerFetch("/v1/payouts/affiliate-commissions/generate", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: workspaceId,
        dry_run: true,
        from: body.from || null,
        to: body.to || todayYmd(),
        limit: 100,
      }),
    });
  } else {
    return NextResponse.json({
      ok: false,
      error: "bad_request",
      message: "Unsupported setup wizard action.",
    }, { status: 400 });
  }

  if (!result.ok) {
    console.error("[Setup Wizard] Action failed", {
      action,
      workspace_id: workspaceId,
      status: result.status,
      error: result.body?.error || "request_failed",
      message: result.body?.message || null,
    });
    return NextResponse.json({
      ok: false,
      error: result.body?.error || "request_failed",
      message: "Setup services are temporarily unavailable. Please contact your administrator if the issue continues.",
    }, { status: result.status });
  }

  const snapshot = await getSetupSnapshot(workspaceId).catch(() => null);
  return NextResponse.json({
    ok: true,
    action,
    result: result.body,
    snapshot,
  });
}

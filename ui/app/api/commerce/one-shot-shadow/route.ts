import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const CONNECTION_ID = "ea1c2313-6120-4692-84c5-ec3562e7dcf6";
const confirmation = "one-shot-continuous-shadow";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

function response(requestId: string, body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, requestId }, { status, headers: { "x-tracekit-request-id": requestId } });
}

function safeCode(value: unknown, fallback: string) {
  const code = String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return code || fallback;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return response(requestId, { ok: false, code: "request_verification_failed" }, 403);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    requirePermission(resolution.session, "connectors.manage");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || body.confirmation !== confirmation) return response(requestId, { ok: false, code: "explicit_confirmation_required" }, 400);

    const organizationId = resolution.session.activeOrganization.id;
    const connections = await commercePersistenceRequest(`commerce_provider_connections?id=eq.${CONNECTION_ID}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,account_id,organization_id,provider,status&limit=1`);
    const connection = connections[0] as Record<string, unknown> | undefined;
    if (!connection || connection.provider !== "commas" || connection.status !== "connected") return response(requestId, { ok: false, code: "connection_unavailable" }, 409);
    const accounts = await commercePersistenceRequest(`commerce_provider_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${CONNECTION_ID}&status=eq.active&select=id&limit=2`);
    if (accounts.length !== 1) return response(requestId, { ok: false, code: "provider_account_scope_unavailable" }, 409);

    const apiBase = String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    const secret = String(process.env.TK_SECRET_KEY || "").trim();
    if (!apiBase || !secret) return response(requestId, { ok: false, code: "operator_proxy_unavailable" }, 503);
    const requestKey = randomUUID();
    const workerResponse = await fetch(`${apiBase}/internal/commerce/one-shot-shadow`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tk-secret": secret },
      body: JSON.stringify({
        confirmation,
        connection_id: CONNECTION_ID,
        resource: "transactions",
        mode: "continuous",
        max_pages: 8,
        per_page: 100,
        request_key: requestKey,
      }),
    });
    const payload = await workerResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!workerResponse.ok) return response(requestId, { ok: false, status: workerResponse.status, code: safeCode(payload.error || payload.code, `worker_http_${workerResponse.status}`) }, workerResponse.status >= 500 ? 502 : 409);
    return response(requestId, { ok: true, status: workerResponse.status, run_id: typeof payload.run_id === "string" ? payload.run_id : null, dispatch_source: payload.dispatch_source === "operator_one_shot" ? payload.dispatch_source : null, acceptance_cycle: payload.acceptance_cycle === true, max_pages: payload.max_pages === 8 ? 8 : null, per_page: payload.per_page === 100 ? 100 : null }, 202);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    return response(requestId, { ok: false, code: safeCode(error instanceof Error ? error.message : "operator_proxy_failed", "operator_proxy_failed") }, 500);
  }
}

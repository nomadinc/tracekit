import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const confirmation = "recover-stranded-commas-one-shot";
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}
function safeCode(value: unknown, fallback: string) {
  const code = String(value || fallback).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return code || fallback;
}
function response(requestId: string, body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, requestId }, { status, headers: { "x-tracekit-request-id": requestId } });
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
    const apiBase = String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    const secret = String(process.env.TK_SECRET_KEY || "").trim();
    if (!apiBase || !secret) return response(requestId, { ok: false, code: "operator_proxy_unavailable" }, 503);
    const workerResponse = await fetch(`${apiBase}/internal/commerce/recover-stranded-one-shot`, {
      method: "POST", headers: { "content-type": "application/json", "x-tk-secret": secret }, body: JSON.stringify({ confirmation }),
    });
    const payload = await workerResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!workerResponse.ok) return response(requestId, { ok: false, status: workerResponse.status, code: safeCode(payload.error || payload.code, `worker_http_${workerResponse.status}`) }, workerResponse.status >= 500 ? 502 : 409);
    return response(requestId, { ok: true, status: workerResponse.status, run_id: typeof payload.run_id === "string" ? payload.run_id : null, operator_recovery: payload.operator_recovery === true, dispatch_source: payload.dispatch_source === "operator_one_shot" ? payload.dispatch_source : null, max_pages: payload.max_pages === 8 ? 8 : null, per_page: payload.per_page === 100 ? 100 : null }, 202);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    return response(requestId, { ok: false, code: safeCode(error instanceof Error ? error.message : "recovery_proxy_failed", "recovery_proxy_failed") }, 500);
  }
}

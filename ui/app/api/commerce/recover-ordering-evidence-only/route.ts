import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const confirmation = "recover-ordering-evidence-only";
const RUN_ID = "fdf97cb1-222c-4fb3-b02d-b4502a3f85a9";
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedCodes = new Set(["ordering_recovery_rpc_rejected", "ordering_recovery_rpc_result_invalid", "ordering_recovery_post_reservation_rejected", "ordering_recovery_queue_dispatch_failed", "ordering_recovery_dispatch_failed"]);
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); const site = request.headers.get("sec-fetch-site"); return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin"); }
function response(requestId: string, body: Record<string, unknown>, status: number) { return NextResponse.json({ ...body, requestId }, { status, headers: { "x-tracekit-request-id": requestId } }); }
function safeCode(value: unknown) { const code = String(value || ""); return allowedCodes.has(code) ? code : "ordering_recovery_failed"; }
function safeRunId(value: unknown) { return typeof value === "string" && runIdPattern.test(value) && value === RUN_ID ? value : null; }

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
    const upstream = await fetch(`${apiBase}/internal/commerce/recover-ordering-evidence-only`, { method: "POST", headers: { "content-type": "application/json", "x-tk-secret": secret }, body: JSON.stringify({ confirmation }) });
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    const runId = safeRunId(payload.run_id);
    if (!upstream.ok) return response(requestId, { ok: false, status: upstream.status, code: safeCode(payload.code), run_id: runId }, upstream.status >= 500 ? 502 : 409);
    return response(requestId, { ok: true, status: upstream.status, run_id: runId, evidence_only_recovery: payload.evidence_only_recovery === true, provider_requests: payload.provider_requests === 0 ? 0 : null }, 202);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return response(requestId, { ok: false, code: "resource_unavailable" }, 404);
    return response(requestId, { ok: false, code: "ordering_recovery_failed" }, 500);
  }
}

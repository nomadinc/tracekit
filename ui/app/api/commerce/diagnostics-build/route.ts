import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError, requirePermission } from "@/lib/identity/authorization-gateway";

const stages = [
  "pre_reserved_run_read",
  "pre_reserved_contract",
  "connection",
  "provider_accounts",
  "credential",
  "schedule",
  "connection_pause",
  "active_runs",
  "live_activation",
  "quota",
  "scheduler_control",
] as const;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
}

export async function GET(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ ok: false, code: "request_verification_failed" }, { status: 403 });
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return NextResponse.json({ ok: false, code: "resource_unavailable" }, { status: 404 });
    requirePermission(resolution.session, "connectors.manage");
    const apiBase = String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
    const secret = String(process.env.TK_SECRET_KEY || "").trim();
    if (!apiBase || !secret) return NextResponse.json({ ok: false, code: "operator_proxy_unavailable" }, { status: 503 });
    const upstream = await fetch(`${apiBase}/internal/diagnostics/commerce-build`, { method: "GET", headers: { "x-tk-secret": secret } });
    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok || payload.ok !== true) return NextResponse.json({ ok: false, code: "worker_diagnostic_unavailable" }, { status: upstream.ok ? 502 : upstream.status >= 500 ? 502 : 409 });
    return NextResponse.json({ ok: true, ordering_diagnostic_version: payload.ordering_diagnostic_version === "pre-reserved-substage-v1" ? payload.ordering_diagnostic_version : null, supported_stages: Array.isArray(payload.supported_stages) && payload.supported_stages.every((stage) => stages.includes(stage as typeof stages[number])) ? payload.supported_stages : [] });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return NextResponse.json({ ok: false, code: "resource_unavailable" }, { status: 404 });
    return NextResponse.json({ ok: false, code: "commerce_diagnostic_proxy_failed" }, { status: 500 });
  }
}

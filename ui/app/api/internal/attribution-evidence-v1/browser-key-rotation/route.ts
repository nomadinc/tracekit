import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

export const dynamic = "force-dynamic";
const PROJECT_ID = "prj_vHEklwWR4NABtKnmlasXrDNbudfH";
const TEAM_ID = "team_QFcd7GbqA7MfBH9bPM0kAqG9";
const CONFIRMATION = "rotate-default-browser-key-attribution-evidence-v1";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private, max-age=0", Pragma: "no-cache" } });
}

export async function POST(request: Request) {
  if (new URL(request.url).protocol !== "https:") return reply({ ok: false, code: "https_required" }, 400);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ ok: false, code: "operator_auth_required" }, 401);
  const access = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`, { headers: { authorization }, cache: "no-store" });
  if (!access.ok) return reply({ ok: false, code: "operator_auth_rejected" }, 403);
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== CONFIRMATION) return reply({ ok: false, code: "explicit_confirmation_required" }, 400);
  const rows = await commercePersistenceRequest("browser_event_sources?workspace_id=eq.default&select=workspace_id,allowed_origins,rate_limit_per_minute,cross_subdomain_cookie_domain,is_active,metadata&limit=2") as Array<Record<string, unknown>>;
  const current = rows[0];
  if (rows.length !== 1 || current.workspace_id !== "default" || JSON.stringify(current.allowed_origins) !== JSON.stringify(["https://example.com"]) || current.rate_limit_per_minute !== 120 || current.cross_subdomain_cookie_domain !== null || current.is_active !== true || JSON.stringify(current.metadata) !== JSON.stringify({ created_by: "admin_setup_route", sdk_version: "browser-touchpoint-v1" })) return reply({ ok: false, code: "source_precondition_failed" }, 409);
  const secret = String(process.env.TK_SECRET_KEY || "").trim();
  const apiBase = String(process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.trace-kit.io").replace(/\/$/, "");
  if (!secret) return reply({ ok: false, code: "server_secret_unavailable" }, 503);
  const upstream = await fetch(`${apiBase}/v1/browser/config`, { method: "POST", headers: { "content-type": "application/json", "x-tk-secret": secret }, body: JSON.stringify({ workspace_id: "default", allowed_origins: ["https://example.com"], rate_limit_per_minute: 120, cross_subdomain_cookie_domain: null, is_active: true }), cache: "no-store" });
  const result = await upstream.json().catch(() => null) as { ok?: boolean; write_key?: string } | null;
  if (!upstream.ok || result?.ok !== true || !result.write_key) return reply({ ok: false, code: "rotation_failed" }, 502);
  return reply({ ok: true, workspace_id: "default", write_key: result.write_key, write_key_returned_once: true });
}

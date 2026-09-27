import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runTikTokManualSync } from "@/lib/integrations/tiktok-ads-run-now";
import { TikTokOAuthError } from "@/lib/integrations/tiktok-ads-oauth";

export const dynamic = "force-dynamic";
function sameOrigin(request: Request) { const origin=request.headers.get("origin"), site=request.headers.get("sec-fetch-site"); return (!origin||origin===new URL(request.url).origin)&&(!site||site==="same-origin"); }

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) throw new TikTokOAuthError("request_verification_failed", "Request verification failed.", 403);
    if (Number(request.headers.get("content-length") || 0) > 65_536) throw new TikTokOAuthError("payload_too_large", "The TikTok sync request is too large.", 413);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) throw new TikTokOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
    const providerAccountId = typeof body?.providerAccountId === "string" ? body.providerAccountId : "";
    const since = typeof body?.since === "string" ? body.since : "";
    const until = typeof body?.until === "string" ? body.until : "";
    if (!connectionId || !providerAccountId || !since || !until) throw new TikTokOAuthError("invalid_request", "TikTok manual sync request is invalid.");
    const result = await runTikTokManualSync({ organizationId: resolution.session.activeOrganization.id, connectionId, providerAccountId, requestedByUserId: resolution.session.user.id, since, until });
    return NextResponse.json({ ok: true, provider: "tiktok_ads", ...result, requestId }, { headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  } catch (error: any) {
    const provider = error instanceof TikTokOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: provider?.code || String(error?.message || "tiktok_run_now_failed").slice(0,120), message: provider?.message || "TikTok manual sync failed safely.", schedulesActivated: false, requestId }, { status: provider?.httpStatus || 409, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { buildTikTokAuthorizationUrl, TikTokOAuthError } from "@/lib/integrations/tiktok-ads-oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "tracekit_tiktok_oauth_state";

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) {
      return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable.", requestId }, { status: 404 });
    }
    const authorizationUrl = buildTikTokAuthorizationUrl({ organizationId: resolution.session.activeOrganization.id, accountId: resolution.session.activeAccount.id, userId: resolution.session.user.id });
    const state = new URL(authorizationUrl).searchParams.get("state");
    if (!state) throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be initialized.", 500);
    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 10 * 60, path: "/v1/integrations/tiktok/oauth" });
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-tracekit-request-id", requestId);
    return response;
  } catch (error) {
    const provider = error instanceof TikTokOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: provider?.code || "tiktok_oauth_start_failed", message: provider?.message || "TraceKit could not start TikTok authorization.", requestId }, { status: provider?.httpStatus || 500, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  }
}

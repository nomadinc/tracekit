import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { completeTikTokOAuth } from "@/lib/integrations/tiktok-ads-connection";
import { TikTokOAuthError } from "@/lib/integrations/tiktok-ads-oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "tracekit_tiktok_oauth_state";
const RETURN_PATH = "/settings/integrations";

function returnUrl(request: Request, params: Record<string, string>) {
  const url = new URL(RETURN_PATH, request.url); url.searchParams.set("provider", "tiktok_ads");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const clearState = (response: NextResponse) => { response.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/v1/integrations/tiktok/oauth" }); response.headers.set("cache-control", "no-store"); response.headers.set("x-tracekit-request-id", requestId); return response; };
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) return clearState(NextResponse.redirect(returnUrl(request, { tiktok: "unavailable" }), 303));
    const state = request.nextUrl.searchParams.get("state") || "", code = request.nextUrl.searchParams.get("auth_code") || request.nextUrl.searchParams.get("code") || "", error = request.nextUrl.searchParams.get("error");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value || "";
    if (error) return clearState(NextResponse.redirect(returnUrl(request, { tiktok: "cancelled" }), 303));
    if (!state || !code || !cookieState || state !== cookieState) throw new TikTokOAuthError("tiktok_oauth_state_invalid", "TikTok authorization could not be verified.", 403);
    const endpoint = String(process.env.TIKTOK_ADVERTISER_INFO_ENDPOINT || "").trim();
    if (!endpoint) throw new TikTokOAuthError("tiktok_configuration_unavailable", "TikTok advertiser discovery configuration is unavailable.", 503, true);
    const connected = await completeTikTokOAuth({ session: resolution.session, state, code, advertiserInfoEndpoint: endpoint });
    return clearState(NextResponse.redirect(returnUrl(request, { tiktok: "connected", connectionId: connected.connectionId, accounts: String(connected.discoveredAccountCount) }), 303));
  } catch (error) {
    const provider = error instanceof TikTokOAuthError ? error : null;
    const code = provider?.code === "tiktok_oauth_state_invalid" ? "state" : provider?.code === "tiktok_configuration_unavailable" ? "configuration" : "failed";
    return clearState(NextResponse.redirect(returnUrl(request, { tiktok: code }), 303));
  }
}

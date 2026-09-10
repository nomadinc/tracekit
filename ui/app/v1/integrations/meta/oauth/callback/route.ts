import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { completeMetaOAuth } from "@/lib/integrations/meta-connection";
import { MetaOAuthError } from "@/lib/integrations/meta-oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "tracekit_meta_oauth_state";
const RETURN_PATH = "/settings/integrations/meta";

function returnUrl(request: Request, params: Record<string, string>) {
  const url = new URL(RETURN_PATH, request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const clearState = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/v1/integrations/meta/oauth" });
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-tracekit-request-id", requestId);
    return response;
  };
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) {
      return clearState(NextResponse.redirect(returnUrl(request, { meta: "unavailable" }), 303));
    }
    const state = request.nextUrl.searchParams.get("state") || "";
    const code = request.nextUrl.searchParams.get("code") || "";
    const error = request.nextUrl.searchParams.get("error");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value || "";
    if (error) return clearState(NextResponse.redirect(returnUrl(request, { meta: "cancelled" }), 303));
    if (!state || !code || !cookieState || state !== cookieState) throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be verified.", 403);

    const connected = await completeMetaOAuth({ session: resolution.session, state, code });
    return clearState(NextResponse.redirect(returnUrl(request, {
      meta: "connected",
      connectionId: connected.connectionId,
      accounts: String(connected.discoveredAccountCount),
    }), 303));
  } catch (error) {
    const meta = error instanceof MetaOAuthError ? error : null;
    const code = meta?.code === "meta_required_permission_missing" ? "permission" : meta?.code === "meta_oauth_state_invalid" ? "state" : "failed";
    return clearState(NextResponse.redirect(returnUrl(request, { meta: code }), 303));
  }
}

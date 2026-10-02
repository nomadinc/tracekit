import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { buildMetaAuthorizationUrl, MetaOAuthError } from "@/lib/integrations/meta-oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "tracekit_meta_oauth_state";

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) {
      return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable.", requestId }, { status: 404 });
    }
    const authorizationUrl = buildMetaAuthorizationUrl({
      organizationId: resolution.session.activeOrganization.id,
      userId: resolution.session.user.id,
    });
    const state = new URL(authorizationUrl).searchParams.get("state");
    if (!state) throw new MetaOAuthError("meta_oauth_state_invalid", "Meta authorization could not be initialized.", 500);
    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/v1/integrations/meta/oauth",
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-tracekit-request-id", requestId);
    return response;
  } catch (error) {
    const meta = error instanceof MetaOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: meta?.code || "meta_oauth_start_failed", message: meta?.message || "TraceKit could not start Meta authorization.", requestId }, { status: meta?.httpStatus || 500, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { GoogleAdsConnectionError, startGoogleAdsOAuth } from "@/lib/integrations/google-ads-connection";

export const dynamic = "force-dynamic";
const COOKIE = "tracekit_google_ads_oauth_state";

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (
      resolution.kind !== "authenticated" ||
      !resolution.session.activeOrganization ||
      !resolution.session.effectivePermissions.includes("connectors.manage")
    ) {
      return NextResponse.json(
        { ok: false, code: "resource_unavailable", message: "The requested resource is unavailable.", requestId },
        { status: 404, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } },
      );
    }

    const started = startGoogleAdsOAuth(resolution.session);
    const response = NextResponse.redirect(started.url, 303);
    response.cookies.set(COOKIE, started.state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/v1/integrations/google-ads/oauth",
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-tracekit-request-id", requestId);
    return response;
  } catch (error) {
    const google = error instanceof GoogleAdsConnectionError ? error : null;
    return NextResponse.json(
      {
        ok: false,
        code: google?.code || "google_ads_connection_failed",
        message: google?.message || "Google Ads connection could not be started.",
        requestId,
      },
      {
        status: google?.httpStatus || 500,
        headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId },
      },
    );
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { getTikTokConnectionPresentation } from "@/lib/integrations/tiktok-ads-connection";
import { TikTokOAuthError } from "@/lib/integrations/tiktok-ads-oauth";
export const dynamic = "force-dynamic";
export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") throw new TikTokOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
    const connections = await getTikTokConnectionPresentation(resolution.session);
    return NextResponse.json({ ok: true, provider: "tiktok_ads", connections, schedulesActivated: false, requestId }, { headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  } catch (error) {
    const provider = error instanceof TikTokOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: provider?.code || "tiktok_status_failed", message: provider?.message || "TraceKit could not load TikTok connection status.", requestId }, { status: provider?.httpStatus || 500, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  }
}

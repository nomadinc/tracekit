import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runMetaInsightsSync } from "@/lib/integrations/meta-insights-sync";
import { MetaOAuthError } from "@/lib/integrations/meta-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const headers = { "cache-control": "no-store", "x-tracekit-request-id": requestId };
  try {
    if (!sameOrigin(request)) throw new MetaOAuthError("request_verification_failed", "Request verification failed.", 403);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 65_536) throw new MetaOAuthError("payload_too_large", "The Meta Insights request is too large.", 413);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const since = typeof body?.since === "string" ? body.since.trim() : "";
    const until = typeof body?.until === "string" ? body.until.trim() : "";
    const rawAccountIds = body?.accountIds;
    const accountIds = Array.isArray(rawAccountIds) ? rawAccountIds.filter((value): value is string => typeof value === "string") : undefined;
    if (!connectionId || !since || !until || (Array.isArray(rawAccountIds) && accountIds?.length !== rawAccountIds.length)) throw new MetaOAuthError("invalid_request", "Meta Insights sync request is invalid.");
    const results = await runMetaInsightsSync({ session: resolution.session, connectionId, since, until, accountIds });
    const failed = results.filter((row) => row.status === "failed").length;
    return NextResponse.json({ ok: failed === 0, provider: "meta", mode: "manual", resource: "insights_daily", schedulesActivated: false, results, requestId }, { status: failed === results.length ? 502 : failed ? 207 : 200, headers });
  } catch (error) {
    const meta = error instanceof MetaOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: meta?.code || "meta_insights_sync_failed", message: meta?.message || "TraceKit could not complete the Meta Insights sync.", retryable: meta?.retryable || false, requestId }, { status: meta?.httpStatus || 500, headers });
  }
}

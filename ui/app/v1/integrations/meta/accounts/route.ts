import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { getMetaAccountsForConnection, setMetaAccountSelection } from "@/lib/integrations/meta-connection";
import { MetaOAuthError } from "@/lib/integrations/meta-oauth";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

function failure(requestId: string, error: unknown) {
  const meta = error instanceof MetaOAuthError ? error : null;
  return NextResponse.json(
    { ok: false, code: meta?.code || "meta_accounts_failed", message: meta?.message || "TraceKit could not update Meta advertising accounts.", requestId },
    { status: meta?.httpStatus || 500, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } },
  );
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
    const connectionId = request.nextUrl.searchParams.get("connectionId") || "";
    const accounts = await getMetaAccountsForConnection(resolution.session, connectionId);
    return NextResponse.json({ ok: true, provider: "meta", connectionId, accounts, requestId }, { headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  } catch (error) {
    return failure(requestId, error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) throw new MetaOAuthError("request_verification_failed", "Request verification failed.", 403);
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 65_536) throw new MetaOAuthError("payload_too_large", "The Meta account selection is too large.", 413);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const accountIds = Array.isArray(body?.accountIds) ? body.accountIds.filter((value): value is string => typeof value === "string") : [];
    if (!body || accountIds.length !== (Array.isArray(body.accountIds) ? body.accountIds.length : -1)) throw new MetaOAuthError("invalid_request", "Meta account selection is invalid.");
    const accounts = await setMetaAccountSelection({ session: resolution.session, connectionId, accountIds });
    return NextResponse.json({ ok: true, provider: "meta", connectionId, accounts, selectedAccountCount: accounts.filter((account) => account.selectedForSync).length, schedulesActivated: false, requestId }, { headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  } catch (error) {
    return failure(requestId, error);
  }
}

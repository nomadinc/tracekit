import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { getMetaConnectionPresentation } from "@/lib/integrations/meta-connection";
import { MetaOAuthError } from "@/lib/integrations/meta-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated") return NextResponse.json({ ok: false, code: "resource_unavailable", message: "The requested resource is unavailable.", requestId }, { status: 404 });
    const connections = await getMetaConnectionPresentation(resolution.session);
    return NextResponse.json({ ok: true, provider: "meta", connections, requestId }, { headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  } catch (error) {
    const meta = error instanceof MetaOAuthError ? error : null;
    return NextResponse.json({ ok: false, code: meta?.code || "meta_status_failed", message: meta?.message || "TraceKit could not load Meta connection status.", requestId }, { status: meta?.httpStatus || 500, headers: { "cache-control": "no-store", "x-tracekit-request-id": requestId } });
  }
}

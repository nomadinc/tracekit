import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { syncEverflowAffiliates } from "@/lib/integrations/everflow-affiliates";
import { EverflowHealthError } from "@/lib/integrations/everflow-client";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return NextResponse.json({ ok: false, message: "Request verification failed.", requestId }, { status: 403, headers: responseHeaders(requestId) });
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return NextResponse.json({ ok: false, message: "The requested resource is unavailable.", requestId }, { status: 404, headers: responseHeaders(requestId) });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return NextResponse.json({ ok: false, message: "A valid Everflow connection is required.", requestId }, { status: 400, headers: responseHeaders(requestId) });
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const result = await syncEverflowAffiliates({
      plane,
      session: resolution.session,
      organizationId: resolution.session.activeOrganization.id,
      connectionId,
    });
    return NextResponse.json({ ok: true, ...result, requestId }, { headers: responseHeaders(requestId) });
  } catch (error) {
    if (error instanceof EverflowHealthError) return NextResponse.json({ ok: false, code: error.code, message: error.message, retryable: error.retryable, requestId }, { status: error.httpStatus, headers: responseHeaders(requestId) });
    return NextResponse.json({ ok: false, message: "TraceKit could not complete the Everflow affiliate sync.", requestId }, { status: 500, headers: responseHeaders(requestId) });
  }
}

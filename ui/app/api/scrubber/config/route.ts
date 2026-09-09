import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { readEverflowScrubberConfiguration, updateEverflowScrubberConfiguration } from "@/lib/integrations/everflow-scrubber-admin";

export const dynamic = "force-dynamic";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId, "cache-control": "no-store" });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin");
};

async function context(request: Request, permission: "connectors.view" | "connectors.manage") {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("not_found");
  requirePermission(resolution.session, permission);
  const connectionId = (request.method === "GET" ? new URL(request.url).searchParams.get("connectionId") : null)?.trim() || "";
  return { resolution, connectionId };
}

async function verifyConnection(session: Awaited<ReturnType<typeof context>>["resolution"]["session"], connectionId: string) {
  if (!uuid(connectionId)) throw new Error("invalid_connection");
  const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
  const connection = await plane.getConnection(session, connectionId);
  if (connection.organizationId !== session.activeOrganization?.id || connection.provider !== "everflow" || connection.status === "revoked") throw new Error("not_found");
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    const { resolution, connectionId } = await context(request, "connectors.view");
    await verifyConnection(resolution.session, connectionId);
    const search = new URL(request.url).searchParams;
    const configuration = await readEverflowScrubberConfiguration({ organizationId: resolution.session.activeOrganization!.id, connectionId, offerId: search.get("offerId"), affiliateId: search.get("affiliateId") });
    return NextResponse.json({ ok: true, connectionId, ...configuration, requestId }, { headers: responseHeaders(requestId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unavailable";
    const status = code === "invalid_connection" ? 400 : code === "not_found" || code === "access_denied" ? 404 : 500;
    return NextResponse.json({ ok: false, code: status === 500 ? "SCRUBBER_CONFIG_UNAVAILABLE" : code, requestId }, { status, headers: responseHeaders(requestId) });
  }
}

export async function PATCH(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return NextResponse.json({ ok: false, code: "request_verification_failed", requestId }, { status: 403, headers: responseHeaders(requestId) });
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("not_found");
    requirePermission(resolution.session, "connectors.manage");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = String(body?.connectionId || "").trim();
    await verifyConnection(resolution.session, connectionId);
    const configuration = await updateEverflowScrubberConfiguration({ organizationId: resolution.session.activeOrganization.id, connectionId, actorUserId: resolution.session.user.id, body: body || {} });
    return NextResponse.json({ ok: true, connectionId, ...configuration, requestId }, { headers: responseHeaders(requestId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unavailable";
    const status = message === "not_found" || message === "access_denied" ? 404 : message === "invalid_connection" ? 400 : 422;
    return NextResponse.json({ ok: false, code: status === 422 ? "SCRUBBER_CONFIG_INVALID" : message, requestId }, { status, headers: responseHeaders(requestId) });
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { connectEverflowNetwork } from "@/lib/integrations/everflow-connection";
import { EverflowHealthError } from "@/lib/integrations/everflow-client";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });
const success = (requestId: string, body: Record<string, unknown>, status = 200) =>
  NextResponse.json({ ok: true, ...body, requestId }, { status, headers: responseHeaders(requestId) });
const failure = (requestId: string, status: number, code: string, message: string, retryable = false) =>
  NextResponse.json({ ok: false, code, message, requestId, retryable }, { status, headers: responseHeaders(requestId) });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return failure(requestId, 403, "request_verification_failed", "Request verification failed.");
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 65_536) return failure(requestId, 413, "payload_too_large", "The connection request is too large.");

    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const networkId = typeof body?.networkId === "string" && body.networkId.trim() ? body.networkId.trim() : null;
    const displayName = typeof body?.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : null;
    if (apiKey.length < 8) return failure(requestId, 400, "invalid_request", "Enter a valid Everflow API key.");
    if (networkId && !/^\d+$/.test(networkId)) return failure(requestId, 400, "invalid_network_id", "Everflow Network ID must be numeric.");

    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const connected = await connectEverflowNetwork({
      plane,
      session: resolution.session,
      organizationId: resolution.session.activeOrganization.id,
      apiKey,
      networkId,
      displayName,
      setupRequestId: idempotencyKey(request),
      correlationId: resolution.session.correlationId,
    });

    return success(requestId, {
      connected: true,
      verified: true,
      reconnected: connected.reconnected,
      status: connected.status,
      provider: "everflow",
      connectionId: connected.connectionId,
      providerAccountId: connected.providerAccountId,
      network: {
        networkId: connected.network.networkId,
        name: connected.network.name,
        displayedName: connected.network.displayedName,
        identifier: connected.network.identifier,
        accountStatus: connected.network.accountStatus,
        timezoneId: connected.network.timezoneId,
        currencyId: connected.network.currencyId,
      },
      message: connected.reconnected ? "Everflow credentials updated and network identity reverified." : "Everflow connected successfully.",
    }, connected.reconnected ? 200 : 201);
  } catch (error) {
    if (error instanceof EverflowHealthError) return failure(requestId, error.httpStatus, error.code, error.message, error.retryable);
    return failure(requestId, 500, "everflow_connection_failed", "TraceKit could not complete the Everflow connection.", true);
  }
}

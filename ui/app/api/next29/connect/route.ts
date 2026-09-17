import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { CommerceProviderConnectionVerifier } from "@/lib/commerce/provider-verifier";
import { normalizeNext29Store, serializeNext29ConnectionCredential } from "@/lib/commerce/next29-verifier";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });
const success = (requestId: string, body: Record<string, unknown>, status = 200) => NextResponse.json({ ok: true, ...body, requestId }, { status, headers: responseHeaders(requestId) });
const failure = (requestId: string, status: number, code: string, message: string, retryable = false) => NextResponse.json({ ok: false, code, message, requestId, retryable }, { status, headers: responseHeaders(requestId) });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return failure(requestId, 403, "request_verification_failed", "Request verification failed.");
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    }
    const setupRequestId = idempotencyKey(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!setupRequestId || !body || typeof body.displayName !== "string" || !body.displayName.trim()) {
      return failure(requestId, 400, "invalid_request", "Check the 29Next connection details and try again.");
    }

    const store = normalizeNext29Store(body.store);
    if (!store) return failure(requestId, 400, "invalid_request", "Enter a valid 29Next store slug or store domain.");

    let credentialSecret: string;
    try {
      credentialSecret = serializeNext29ConnectionCredential({ store, accessToken: body.accessToken });
    } catch (error) {
      return failure(requestId, 400, "invalid_request", error instanceof Error ? error.message : "Check the 29Next connection details and try again.");
    }

    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore(), verifier: new CommerceProviderConnectionVerifier() });
    const connection = await plane.createConnection(resolution.session, resolution.session.activeOrganization.id, {
      provider: "next29",
      displayName: body.displayName.trim().slice(0, 100),
      environment: "production",
      setupRequestId,
    });
    await plane.upsertProviderAccount(resolution.session, connection.id, { externalId: store });
    const credential = await plane.credentialStatus(resolution.session, connection.id);
    if (credential.status === "missing") {
      try {
        await plane.createCredential(resolution.session, connection.id, credentialSecret);
      } catch (error) {
        if ((await plane.credentialStatus(resolution.session, connection.id)).status === "missing") throw error;
      }
    }

    try {
      await plane.verifyConnection(resolution.session, connection.id);
      return success(requestId, {
        connectionId: connection.id,
        verified: true,
        status: "connected",
        provider: "next29",
        message: "29Next connected and read scopes verified successfully.",
      }, 201);
    } catch {
      return success(requestId, {
        connectionId: connection.id,
        verified: false,
        status: "degraded",
        provider: "next29",
        message: "29Next credentials were saved securely, but one or more read scopes could not be verified.",
      }, 201);
    }
  } catch {
    return failure(requestId, 500, "internal_error", "TraceKit could not complete the 29Next connection operation.", true);
  }
}

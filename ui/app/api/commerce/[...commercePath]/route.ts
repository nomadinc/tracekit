import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { BoundedCommasConnectionVerifier } from "@/lib/commerce/commas-verifier";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const attempts = new Map<string, { count: number; reset: number }>();
const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });
const success = (requestId: string, body: Record<string, unknown>, status = 200) => NextResponse.json({ ok: true, ...body, requestId }, { status, headers: responseHeaders(requestId) });
const failure = (requestId: string, status: number, code: string, message: string, retryable = false) => NextResponse.json({ ok: false, code, message, requestId, retryable }, { status, headers: responseHeaders(requestId) });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}
function rateLimited(request: Request) {
  const key = `${request.headers.get("x-forwarded-for") || "local"}:${new URL(request.url).pathname}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset < now) { attempts.set(key, { count: 1, reset: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > 10;
}
function idempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function POST(request: Request, context: { params: Promise<{ commercePath: string[] }> }) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) return failure(requestId, 403, "request_verification_failed", "Request verification failed.");
    if (rateLimited(request)) return failure(requestId, 429, "rate_limited", "Please wait before trying again.", true);
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return failure(requestId, 400, "invalid_request", "Check the connection details and try again.");
    const path = (await context.params).commercePath;
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore(), verifier: new BoundedCommasConnectionVerifier() });

    if (path.join("/") === "connections") {
      const setupRequestId = idempotencyKey(request);
      if (!setupRequestId || typeof body.displayName !== "string" || !body.displayName.trim() || !["production", "sandbox"].includes(String(body.environment)) || typeof body.apiKey !== "string" || body.apiKey.length < 8) {
        return failure(requestId, 400, "invalid_request", "Check the connection details and try again.");
      }
      const connection = await plane.createConnection(resolution.session, resolution.session.activeOrganization.id, { provider: "commas", displayName: body.displayName.trim().slice(0, 100), environment: String(body.environment), setupRequestId });
      await plane.upsertProviderAccount(resolution.session, connection.id, {});
      const credential = await plane.credentialStatus(resolution.session, connection.id);
      if (credential.status === "missing") {
        try { await plane.createCredential(resolution.session, connection.id, body.apiKey); }
        catch (error) { if ((await plane.credentialStatus(resolution.session, connection.id)).status === "missing") throw error; }
      }
      try {
        await plane.verifyConnection(resolution.session, connection.id);
        return success(requestId, { connectionId: connection.id, verified: true, status: "connected", message: "Commas connected successfully." }, 201);
      } catch {
        return success(requestId, { connectionId: connection.id, verified: false, status: "degraded", message: "Connection saved, but verification did not succeed." }, 201);
      }
    }

    const connectionId = path[1];
    if (!connectionId || path[0] !== "connections") return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    if (path[2] === "sync-now") {
      const apiBase = process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
      const secret = process.env.TK_SECRET_KEY;
      if (!apiBase || !secret) return failure(requestId, 503, "manual_sync_unavailable", "Manual synchronization is unavailable.");
      const accounts = await commercePersistenceRequest(`commerce_provider_accounts?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(resolution.session.activeOrganization.id)}&status=eq.active&select=id&limit=2`);
      if (accounts.length !== 1) return failure(requestId, 409, "manual_sync_not_permitted", "Manual synchronization is unavailable for this connection.");
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/commerce/sync-now`, { method: "POST", headers: { "content-type": "application/json", "x-tk-secret": secret }, body: JSON.stringify({ account_id: resolution.session.activeAccount?.id, organization_id: resolution.session.activeOrganization.id, connection_id: connectionId, provider_account_id: accounts[0].id }) });
      const payload = await response.json().catch(() => ({}));
      return NextResponse.json(payload, { status: response.status, headers: response.headers });
    }
    if (path[2] === "verify") {
      try {
        const result = await plane.verifyConnection(resolution.session, connectionId);
        return success(requestId, { verified: true, status: result.status, verification: { providerStatus: result.providerStatus ?? null, providerRequestIdPresent: result.providerRequestIdPresent ?? false, rateLimitRemaining: result.rateLimitRemaining ?? null } });
      } catch (error) {
        if (error instanceof AuthorizationDeniedError) throw error;
        return failure(requestId, 502, "provider_verification_failed", "Connection verification did not succeed.", true);
      }
    }
    if (path[2] === "rotate") {
      if (typeof body.apiKey !== "string" || body.apiKey.length < 8) return failure(requestId, 400, "invalid_request", "Enter a valid credential and try again.");
      await plane.rotateCredential(resolution.session, connectionId, body.apiKey);
      return success(requestId, { status: "active", message: "Credential rotated securely." });
    }
    if (path[2] === "disable") {
      await plane.disableConnection(resolution.session, connectionId);
      return success(requestId, { status: "disabled", message: "Connection disabled." });
    }
    return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return failure(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    }
    return failure(requestId, 500, "internal_error", "TraceKit could not complete the connection operation.", true);
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const headers = (requestId: string) => ({ "x-tracekit-request-id": requestId });
const fail = (requestId: string, status: number, code: string, message: string, diagnostic?: string) =>
  NextResponse.json({ ok: false, code, message, diagnostic: diagnostic || null, requestId }, { status, headers: headers(requestId) });

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const requestId = randomUUID();
  try {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((origin && origin !== new URL(request.url).origin) || (fetchSite && fetchSite !== "same-origin")) {
      return fail(requestId, 403, "request_verification_failed", "Request verification failed.");
    }

    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return fail(requestId, 404, "resource_unavailable", "The requested resource is unavailable.");
    }
    requirePermission(resolution.session, "connectors.manage");

    const { connectionId } = await context.params;
    const organizationId = resolution.session.activeOrganization.id;
    const connections = await commercePersistenceRequest(
      `commerce_provider_connections?id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=id,provider,display_name,status&limit=1`,
    ) as Array<Record<string, unknown>>;
    const connection = connections[0];
    if (!connection || connection.provider !== "everflow") {
      return fail(requestId, 409, "manual_sync_not_permitted", "Manual Everflow sync is unavailable for this connection.");
    }

    const accounts = await commercePersistenceRequest(
      `commerce_provider_accounts?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=id,provider_account_external_id&limit=2`,
    ) as Array<Record<string, unknown>>;
    if (accounts.length !== 1) {
      return fail(requestId, 409, "manual_sync_account_scope_invalid", "This Everflow connection must have exactly one active provider account before it can sync.");
    }

    const apiBase = process.env.TRACEKIT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
    const secret = process.env.TK_SECRET_KEY;
    if (!apiBase || !secret) {
      return fail(requestId, 503, "manual_sync_unavailable", "Manual synchronization is unavailable because the server runtime is not configured.");
    }

    const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/commerce/sync-now`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tk-secret": secret },
      body: JSON.stringify({
        account_id: resolution.session.activeAccount?.id,
        organization_id: organizationId,
        connection_id: connectionId,
        provider_account_id: accounts[0].id,
        resource: "everflow_conversions",
      }),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { payload = {}; }

    if (!response.ok) {
      const downstreamCode = typeof payload.code === "string" ? payload.code : typeof payload.error === "string" ? payload.error : `http_${response.status}`;
      const downstreamMessage = typeof payload.message === "string" ? payload.message : typeof payload.error_description === "string" ? payload.error_description : "The Everflow sync runtime rejected the request.";
      return fail(requestId, response.status, `everflow_sync_${downstreamCode}`, downstreamMessage, raw.slice(0, 800));
    }

    return NextResponse.json({
      ok: true,
      code: "everflow_sync_started",
      message: `Sync started for ${String(connection.display_name || "Everflow")} (NID ${String(accounts[0].provider_account_external_id || "unknown")}).`,
      connectionId,
      providerAccountId: accounts[0].id,
      resource: "everflow_conversions",
      downstream: payload,
      requestId,
    }, { status: 200, headers: headers(requestId) });
  } catch (error) {
    return fail(requestId, 500, "everflow_sync_internal_error", "TraceKit could not start the Everflow sync.", error instanceof Error ? error.message : "unknown_error");
  }
}

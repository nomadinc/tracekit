import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { commercePersistenceCount, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { syncEverflowConversions, validateEverflowConversionRange } from "@/lib/integrations/everflow-conversions";
import { captureEverflowConversionBaseline, finalizeEverflowConversionRunMetrics } from "@/lib/integrations/everflow-conversion-run-metrics";
import { captureEverflowFinancialBaseline, persistEverflowEventReversalHistory } from "@/lib/integrations/everflow-event-reversals";
import { EverflowHealthError } from "@/lib/integrations/everflow-client";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

async function apiEvidenceCount(connectionId: string) {
  return commercePersistenceCount(`everflow_conversion_events?connection_id=eq.${encodeURIComponent(connectionId)}&ingestion_method=eq.api&select=id`);
}

async function persistSyncRunMetrics(input: {
  organizationId: string;
  connectionId: string;
  syncRunId: string;
  seen: number;
  pages: number;
}) {
  await commercePersistenceRequest(
    `commerce_sync_runs?id=eq.${encodeURIComponent(input.syncRunId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        pages_completed: input.pages,
        records_seen: input.seen,
        provider_request_count: input.pages,
      }),
    },
  );
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ ok: false, message: "Request verification failed.", requestId }, { status: 403, headers: responseHeaders(requestId) });
    }
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return NextResponse.json({ ok: false, message: "The requested resource is unavailable.", requestId }, { status: 404, headers: responseHeaders(requestId) });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const from = typeof body?.from === "string" ? body.from.trim() : "";
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !from || !to) {
      return NextResponse.json({ ok: false, message: "A valid Everflow connection and bounded date range are required.", requestId }, { status: 400, headers: responseHeaders(requestId) });
    }
    let range: { from: string; to: string };
    try {
      range = validateEverflowConversionRange(from, to);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Everflow conversion range is invalid.";
      return NextResponse.json({ ok: false, message, requestId }, { status: 400, headers: responseHeaders(requestId) });
    }
    const organizationId = resolution.session.activeOrganization.id;
    const beforeCount = await apiEvidenceCount(connectionId);
    const baseline = await captureEverflowConversionBaseline(connectionId);
    const financialBaseline = await captureEverflowFinancialBaseline(connectionId);
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const result = await syncEverflowConversions({
      plane,
      session: resolution.session,
      organizationId,
      connectionId,
      from: range.from,
      to: range.to,
    });
    const afterCount = await apiEvidenceCount(connectionId);
    const createdByCount = Math.max(0, afterCount - beforeCount);
    await persistSyncRunMetrics({ organizationId, connectionId, syncRunId: result.syncRunId, seen: result.seen, pages: result.pages });
    const changeMetrics = await finalizeEverflowConversionRunMetrics({ connectionId, syncRunId: result.syncRunId, baseline });
    if (changeMetrics.created !== createdByCount) throw new Error("Everflow conversion change metrics were inconsistent.");
    const eventEffects = await persistEverflowEventReversalHistory({
      organizationId,
      connectionId,
      syncRunId: result.syncRunId,
      providerAccountId: result.providerAccountId,
      baseline: financialBaseline,
    });
    return NextResponse.json({ ok: true, ...result, ...changeMetrics, eventEffects, requestId }, { headers: responseHeaders(requestId) });
  } catch (error) {
    if (error instanceof EverflowHealthError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message, retryable: error.retryable, requestId }, { status: error.httpStatus, headers: responseHeaders(requestId) });
    }
    return NextResponse.json({ ok: false, message: "TraceKit could not complete the Everflow conversion sync.", requestId }, { status: 500, headers: responseHeaders(requestId) });
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { resolveAndMapEverflowOrder } from "@/lib/integrations/everflow-order-linkage";

const headers = (requestId: string) => ({ "x-tracekit-request-id": requestId });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ ok: false, message: "Request verification failed.", requestId }, { status: 403, headers: headers(requestId) });
    }
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return NextResponse.json({ ok: false, message: "The requested resource is unavailable.", requestId }, { status: 404, headers: headers(requestId) });
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const sourceRecordId = typeof body?.sourceRecordId === "string" ? body.sourceRecordId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !sourceRecordId || sourceRecordId.length > 256) {
      return NextResponse.json({ ok: false, message: "A valid Everflow connection and source record are required.", requestId }, { status: 400, headers: headers(requestId) });
    }
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const result = await resolveAndMapEverflowOrder({
      plane,
      session: resolution.session,
      link: {
        organizationId: resolution.session.activeOrganization.id,
        connectionId,
        sourceRecordId,
        transactionId: typeof body?.transactionId === "string" ? body.transactionId : null,
        email: typeof body?.email === "string" ? body.email : null,
        occurredAt: typeof body?.occurredAt === "string" ? body.occurredAt : null,
        amount: typeof body?.amount === "number" || typeof body?.amount === "string" ? body.amount : null,
      },
    });
    return NextResponse.json({ ok: true, ...result, requestId }, { headers: headers(requestId) });
  } catch {
    return NextResponse.json({ ok: false, message: "TraceKit could not resolve the Everflow order identity.", requestId }, { status: 500, headers: headers(requestId) });
  }
}

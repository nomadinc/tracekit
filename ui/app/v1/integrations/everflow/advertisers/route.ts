import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { listPersistedEverflowAdvertisers } from "@/lib/integrations/everflow-advertisers";

const headers = (requestId: string) => ({ "x-tracekit-request-id": requestId });

export async function GET(request: Request) {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return NextResponse.json({ ok: false, message: "The requested resource is unavailable.", requestId }, { status: 404, headers: headers(requestId) });
    }
    const connectionId = new URL(request.url).searchParams.get("connectionId")?.trim() || "";
    if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return NextResponse.json({ ok: false, message: "A valid Everflow connection is required.", requestId }, { status: 400, headers: headers(requestId) });
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const connection = await plane.getConnection(resolution.session, connectionId);
    if (connection.organizationId !== resolution.session.activeOrganization.id || connection.provider !== "everflow") {
      return NextResponse.json({ ok: false, message: "The requested resource is unavailable.", requestId }, { status: 404, headers: headers(requestId) });
    }
    const advertisers = await listPersistedEverflowAdvertisers({ organizationId: resolution.session.activeOrganization.id, connectionId });
    return NextResponse.json({ ok: true, connectionId, advertisers, count: advertisers.length, requestId }, { headers: headers(requestId) });
  } catch {
    return NextResponse.json({ ok: false, message: "Everflow advertisers are unavailable.", requestId }, { status: 500, headers: headers(requestId) });
  }
}

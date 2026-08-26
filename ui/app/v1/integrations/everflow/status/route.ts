import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { getEverflowConnectionStatus } from "@/lib/integrations/everflow-connection";
import { EVERFLOW_API_BASE } from "@/lib/integrations/everflow-client";

const responseHeaders = (requestId: string) => ({ "x-tracekit-request-id": requestId });

export async function GET() {
  const requestId = randomUUID();
  try {
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) {
      return NextResponse.json(
        { ok: false, message: "The requested resource is unavailable.", requestId },
        { status: 404, headers: responseHeaders(requestId) },
      );
    }

    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const connections = await getEverflowConnectionStatus({
      plane,
      session: resolution.session,
      organizationId: resolution.session.activeOrganization.id,
    });
    const primary = connections[0] || null;
    const networkName = primary?.network?.displayedName || primary?.network?.name || primary?.displayName || null;

    return NextResponse.json({
      ok: true,
      connected: connections.some((connection) => connection.connected),
      platform: "everflow",
      baseUrl: EVERFLOW_API_BASE,
      username: networkName,
      environment: primary?.environment || "production",
      merchant_account_id: primary?.networkId || null,
      connector_id: primary?.connectionId || null,
      last_successful_sync_at: primary?.lastVerifiedAt || null,
      updated_at: primary?.lastVerifiedAt || null,
      network_name: networkName,
      network_status: primary?.network?.accountStatus || null,
      timezone_id: primary?.network?.timezoneId ?? null,
      currency_id: primary?.network?.currencyId || null,
      connections,
      capabilities: {
        transaction_reporting: false,
        fees: false,
        disputes: false,
        webhooks: false,
        warnings: ["Everflow data sync and webhook ingestion are not enabled yet."],
      },
      requestId,
    }, { headers: responseHeaders(requestId) });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Everflow connection status is unavailable.", requestId },
      { status: 500, headers: responseHeaders(requestId) },
    );
  }
}

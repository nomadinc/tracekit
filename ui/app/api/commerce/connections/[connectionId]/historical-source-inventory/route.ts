import { gzipSync } from "node:zlib";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { getEverflowNetworkIdentity, EverflowHealthError } from "@/lib/integrations/everflow-client";
import { captureEverflowSourceInventory, EverflowInventoryError } from "@/lib/integrations/everflow-source-inventory";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const unavailable = () => Response.json({ ok: false, code: "resource_unavailable" }, { status: 404, headers });

export async function GET(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const url = new URL(request.url);
    const site = request.headers.get("sec-fetch-site");
    const origin = request.headers.get("origin");
    if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== url.origin)) return unavailable();
    const resolution = await resolveApplicationSession();
    if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return unavailable();
    requirePermission(resolution.session, "connectors.manage");
    requirePermission(resolution.session, "imports.manage");
    const { connectionId } = await context.params;
    const runId = url.searchParams.get("runId") || "";
    if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !/^[0-9a-f-]{36}$/i.test(runId)) return unavailable();
    const organizationId = resolution.session.activeOrganization.id;
    const plane = createCommerceControlPlane({ evidenceStore: new MemoryCommerceEvidenceStore() });
    const connection = await plane.getConnection(resolution.session, connectionId);
    if (connection.organizationId !== organizationId || connection.provider !== "everflow" || connection.status !== "connected") return unavailable();
    const accounts = (await plane.listProviderAccounts(resolution.session, connectionId)).filter(a => a.status === "active" && !a.provisional);
    if (accounts.length !== 1) return unavailable();
    const account = accounts[0];
    if(account.organizationId !== organizationId || account.connectionId !== connectionId) return unavailable();
    const runs = await commercePersistenceRequest(`commerce_sync_runs?id=eq.${runId}&organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${account.id}&sync_type=eq.everflow_conversions_historical&select=id,metadata&limit=1`);
    if (runs.length !== 1) return unavailable();
    const metadata = runs[0].metadata as Record<string, unknown>;
    const network = connection.capabilities?.everflowNetwork as Record<string, unknown> | undefined;
    if (Number(network?.timezoneId) !== 80 || String(network?.currencyId) !== "USD" || String(network?.networkId) !== account.externalId)
      return Response.json({ ok: false, code: "everflow_inventory_reporting_scope_unverified" }, { status: 409, headers });
    const apiKey = await plane.resolveCredentialForExecution(resolution.session, connectionId);
    await getEverflowNetworkIdentity({ apiKey, networkId: account.externalId, correlationId: resolution.session.correlationId });
    const inventory = await captureEverflowSourceInventory({ apiKey, networkId: account.externalId,
      from: String(metadata?.from || ""), to: String(metadata?.to || ""), timezoneId: 80, currencyId: "USD" });
    const body = JSON.stringify({ ...inventory, importId: runId, organizationId, connectionId, providerAccountId: account.id });
    if (Buffer.byteLength(body) > 12_000_000) throw new EverflowInventoryError("everflow_inventory_download_limit");
    return new Response(Uint8Array.from(gzipSync(body)), { headers: { ...headers, "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="everflow-source-inventory-${runId}-${Date.now()}.json.gz"` } });
  } catch (error) {
    const code = error instanceof EverflowInventoryError || error instanceof EverflowHealthError ? error.code : "everflow_inventory_unavailable";
    return Response.json({ ok: false, code }, { status: 409, headers });
  }
}

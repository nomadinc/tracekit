import { CommasRefundDetailControls } from "@/components/connections/commas-refund-detail-controls";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { notFound } from "next/navigation";
import { ConnectionDetail, ConnectionScheduleSummary } from "@/components/connections/integration-experience";
import { EverflowHistoricalImport, EverflowManualSync, EverflowNetworkSelector } from "@/components/connections/everflow-admin-controls";
import { ShopifyOnboardingStatus } from "@/components/connections/shopify-onboarding-status";
import { ShopifyWebhookSecret } from "@/components/connections/shopify-webhook-secret";
import { loadConnectionExperience, loadConnectionExperiences } from "@/lib/commerce/integration-experience-server";
import { loadShopifyOnboardingLifecycle } from "@/lib/commerce/shopify-onboarding-lifecycle";

export default async function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const connectionId = (await params).connectionId;
    const connection = await loadConnectionExperience(connectionId);
    const lifecycle = connection.provider === "shopify" ? await loadShopifyOnboardingLifecycle(connectionId) : null;
    const connections = connection.provider === "everflow" ? await loadConnectionExperiences() : [];
    let canInspectRefunds = false;
    if (connectionId === "8030cf89-88f3-433f-99ec-c2083c4e5698" && connection.provider === "commas") {
      try { const resolution = await resolveApplicationSession(); if (resolution.kind === "authenticated" && resolution.session.activeOrganization?.id === "c98d44be-5f7f-41a2-a9d3-ae67a811a872") { requirePermission(resolution.session, "connectors.manage"); requirePermission(resolution.session, "imports.manage"); canInspectRefunds = true; } } catch { canInspectRefunds = false; }
    }
    return <>
      <ConnectionDetail connection={connection} />
      {connection.provider === "everflow" ? <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10"><EverflowNetworkSelector connections={connections} selectedId={connection.id} /><EverflowManualSync connection={connection} /><EverflowHistoricalImport connection={connection} /></div> : null}
      {lifecycle ? <ShopifyOnboardingStatus lifecycle={lifecycle} /> : null}
      {connection.provider === "shopify" ? <ShopifyWebhookSecret connectionId={connectionId} /> : null}
      {canInspectRefunds ? <CommasRefundDetailControls /> : null}
      <ConnectionScheduleSummary connection={connection} />
    </>;
  } catch {
    notFound();
  }
}

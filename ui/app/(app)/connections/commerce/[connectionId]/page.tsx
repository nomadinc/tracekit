import { notFound } from "next/navigation";
import { ConnectionDetail, ConnectionScheduleSummary } from "@/components/connections/integration-experience";
import { EverflowManualSync, EverflowNetworkSelector } from "@/components/connections/everflow-admin-controls";
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
    return <>
      <ConnectionDetail connection={connection} />
      {connection.provider === "everflow" ? <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10"><EverflowNetworkSelector connections={connections} selectedId={connection.id} /><EverflowManualSync connection={connection} /></div> : null}
      {lifecycle ? <ShopifyOnboardingStatus lifecycle={lifecycle} /> : null}
      {connection.provider === "shopify" ? <ShopifyWebhookSecret connectionId={connectionId} /> : null}
      <ConnectionScheduleSummary connection={connection} />
    </>;
  } catch {
    notFound();
  }
}

import { notFound } from "next/navigation";
import { ConnectionDetail, ConnectionScheduleSummary } from "@/components/connections/integration-experience";
import { ShopifyOnboardingStatus } from "@/components/connections/shopify-onboarding-status";
import { loadConnectionExperience } from "@/lib/commerce/integration-experience-server";
import { loadShopifyOnboardingLifecycle } from "@/lib/commerce/shopify-onboarding-lifecycle";

export default async function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const connectionId = (await params).connectionId;
    const connection = await loadConnectionExperience(connectionId);
    const lifecycle = connection.provider === "shopify" ? await loadShopifyOnboardingLifecycle(connectionId) : null;
    return <>
      <ConnectionDetail connection={connection} />
      {lifecycle ? <ShopifyOnboardingStatus lifecycle={lifecycle} /> : null}
      <ConnectionScheduleSummary connection={connection} />
    </>;
  } catch {
    notFound();
  }
}

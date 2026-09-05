import { notFound } from "next/navigation";
import { ConnectionDetail, ConnectionScheduleSummary } from "@/components/connections/integration-experience";
import { ShopifySmokeTest } from "@/components/connections/shopify-smoke-test";
import { Next29ConnectionDetail } from "@/components/connections/next29-connection-detail";
import { loadConnectionExperience } from "@/lib/commerce/integration-experience-server";

export default async function ConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const connection = await loadConnectionExperience((await params).connectionId);
    if (connection.provider === "next29") return <Next29ConnectionDetail connection={connection} />;
    return <>
      <ConnectionDetail connection={connection} />
      {connection.provider === "shopify" ? <ShopifySmokeTest connectionId={connection.id} /> : null}
      <ConnectionScheduleSummary connection={connection} />
    </>;
  } catch {
    notFound();
  }
}

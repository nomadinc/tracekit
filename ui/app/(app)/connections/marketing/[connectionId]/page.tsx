import { notFound } from "next/navigation";
import { MarketingConnectionDetail } from "@/components/connections/marketing-connection-detail";
import { loadMarketingConnectionExperience } from "@/lib/commerce/integration-experience-server";

export default async function MarketingConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const connection = await loadMarketingConnectionExperience((await params).connectionId);
    return <MarketingConnectionDetail connection={connection} />;
  } catch {
    notFound();
  }
}

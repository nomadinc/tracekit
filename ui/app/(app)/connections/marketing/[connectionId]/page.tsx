import { notFound } from "next/navigation";
import { ConnectionDetail } from "@/components/connections/integration-experience";
import { loadMarketingConnectionExperience } from "@/lib/commerce/integration-experience-server";

export default async function MarketingConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const connection = await loadMarketingConnectionExperience((await params).connectionId);
    return <ConnectionDetail connection={connection} />;
  } catch {
    notFound();
  }
}

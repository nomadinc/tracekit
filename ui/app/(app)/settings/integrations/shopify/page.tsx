import { notFound } from "next/navigation";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default function ShopifyIntegrationPage() {
  const integration = getIntegrationDefinition("shopify");

  if (!integration) {
    notFound();
  }

  return <IntegrationWizard integration={integration} />;
}

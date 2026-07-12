import { notFound } from "next/navigation";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default function WowPayIntegrationPage() {
  const integration = getIntegrationDefinition("wowpay");

  if (!integration) {
    notFound();
  }

  return <IntegrationWizard integration={integration} />;
}

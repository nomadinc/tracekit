import { notFound } from "next/navigation";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default function ManualPostbackIntegrationPage() {
  const integration = getIntegrationDefinition("manual-postback");

  if (!integration) {
    notFound();
  }

  return <IntegrationWizard integration={integration} />;
}

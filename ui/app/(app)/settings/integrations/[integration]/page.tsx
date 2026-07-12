import { notFound } from "next/navigation";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ integration: string }>;
}) {
  const { integration: integrationId } = await params;
  const integration = getIntegrationDefinition(integrationId);

  if (!integration) {
    notFound();
  }

  return <IntegrationWizard integration={integration} />;
}

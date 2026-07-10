import { notFound } from "next/navigation";
import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default function IntegrationPage({
  params,
}: {
  params: { integration: string };
}) {
  const integration = getIntegrationDefinition(params.integration);

  if (!integration) {
    notFound();
  }

  return <IntegrationWizard integration={integration} />;
}
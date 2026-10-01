import { notFound, redirect } from "next/navigation";
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

  // OAuth providers must enter through their provider-specific authorization
  // route. Never render an empty/generic credential form for OAuth.
  if (integration.authType === "oauth") {
    if (!integration.connectPath) {
      notFound();
    }
    redirect(integration.connectPath);
  }

  return <IntegrationWizard integration={integration} />;
}

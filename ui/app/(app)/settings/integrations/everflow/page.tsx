import { IntegrationWizard } from "@/components/integrations/integration-wizard";
import { getIntegrationDefinition } from "@/lib/integrations/catalog";

export default function EverflowIntegrationPage() {
  const integration = getIntegrationDefinition("everflow");
  if (!integration) return null;
  return (
    <IntegrationWizard
      integration={{
        ...integration,
        statusPath: "/v1/integrations/everflow/status",
      }}
    />
  );
}

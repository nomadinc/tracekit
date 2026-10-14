import { notFound } from "next/navigation";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { MetaIntegrationPanel } from "@/components/integrations/meta-integration-panel";
export default async function MetaIntegrationPage() {
 const resolution = await resolveApplicationSession();
 if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization || !resolution.session.effectivePermissions.includes("connectors.manage")) notFound();
 return <MetaIntegrationPanel />;
}

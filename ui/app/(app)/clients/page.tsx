import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function ClientsPage() {
  return <ShellPlaceholder title="Clients" purpose="Agency client access remains distinct from the Agency Account. Only assigned Client Organizations are available." permission="organizations.view" variants={["agency"]} managementPermission="organizations.manage" />;
}

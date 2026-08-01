import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function Settings() {
  return <ShellPlaceholder title="Settings" purpose="Organization and Agency configuration is permission-aware. Read-only identities cannot access management actions." permission="organizations.manage" variants={["client", "agency"]} managementPermission="organizations.manage" />;
}

import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function TeamPage() {
  return <ShellPlaceholder title="Team" purpose="Agency membership and permission administration will be implemented after persistent identity is approved." permission="users.view" variants={["agency"]} managementPermission="users.manage_permissions" />;
}

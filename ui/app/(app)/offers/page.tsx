import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function OffersPage() {
  return <ShellPlaceholder title="Offers" purpose="The production destination for strategic Offer Workspaces. Approved concepts remain isolated until their production migration is reviewed." permission="offers.view" variants={["client", "agency"]} managementPermission="offers.manage" />;
}

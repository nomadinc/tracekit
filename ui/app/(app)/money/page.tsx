import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function MoneyPage() {
  return <ShellPlaceholder title="Money" purpose="The production destination for qualified financial outcomes, reconciliation, and financial investigation." permission="financials.view" variants={["client"]} managementPermission="financials.reconcile" />;
}

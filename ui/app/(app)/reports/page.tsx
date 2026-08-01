import { ShellPlaceholder } from "@/components/layout/shell-placeholder";

export default function Reports() {
  return <ShellPlaceholder title="Reports" purpose="Agency reporting remains scoped to the selected assigned Client Organization." permission="financials.view" variants={["agency"]} />;
}

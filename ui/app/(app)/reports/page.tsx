import { ShellPlaceholder } from "@/components/layout/shell-placeholder";
import Link from "next/link";

export default function Reports() {
  return <><div className="p-6"><Link className="text-sm font-medium text-blue-700 underline" href="/reports/commas-attribution">Commas Attribution Quality · Shadow Measurement</Link></div><ShellPlaceholder title="Reports" purpose="Agency reporting remains scoped to the selected assigned Client Organization." permission="financials.view" variants={["agency"]} /></>;
}

import { resolveApplicationSession } from "@/lib/identity/application-session";
import { authorizedDetailedFinancialOrganization } from "@/lib/identity/financial-read-scope";

// Presentation follows the API's existing authority check. The API remains the
// enforcement boundary and rechecks permissions on every request.
export async function DetailedFinancialReportBoundary({ title, children }: { title: string; children: React.ReactNode }) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind === "authenticated" && authorizedDetailedFinancialOrganization(resolution.session, "https://report.invalid/")) {
    return <>{children}</>;
  }
  return <main className="space-y-4"><h1 className="text-3xl font-semibold">{title}</h1><section className="rounded-xl border p-5" role="status"><h2 className="font-semibold">Detailed financial report restricted</h2><p className="mt-2 text-sm">Your current organization access does not permit this report. No report data has been loaded. Unavailable amounts are not zero balances.</p></section></main>;
}

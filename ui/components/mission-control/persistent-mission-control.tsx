import Link from "next/link";
import type { BusinessContext, Organization } from "@/lib/identity/types";
import type { MissionControlPortfolio } from "@/lib/mission-control/production-portfolio";
import { PortfolioKpis } from "./portfolio-kpis";

export function PersistentMissionControl({ organization, context, portfolio }: {
  organization: Organization;
  context: BusinessContext;
  portfolio: MissionControlPortfolio | null;
}) {
  return <div className="space-y-6 p-6">
    <header><p className="tk-label">{organization.name}</p><h2 className="mt-2 text-xl font-semibold">{context.name} · Mission Control</h2>
      <p className="mt-2 text-sm text-slate-500">Portfolio totals cover the active Client Organization. Offer performance requires canonical Offer mappings.</p></header>
    {portfolio ? <PortfolioKpis portfolio={portfolio} /> : <p role="status" className="text-sm text-slate-500">Portfolio financial data is unavailable for this session.</p>}
    <section className="rounded-xl border p-5"><h3 className="font-semibold">Evidence and operational health</h3>
      <p className="mt-2 text-sm text-slate-500">Observed provider products remain evidence until reviewed mappings exist. Unqualified profit, attribution, and Offer performance are not asserted.</p>
      <div className="mt-4 flex gap-5"><Link href="/offers">Offers</Link><Link href="/orders">Orders</Link><Link href="/connections">Connections</Link></div>
    </section>
  </div>;
}

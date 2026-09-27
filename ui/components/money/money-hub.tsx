"use client";

import Link from "next/link";
import { ArrowRight, Landmark, RefreshCcw, ShieldAlert } from "lucide-react";
import { AccessBoundary } from "@/components/identity/access-control";
import { useIdentity } from "@/components/identity/identity-provider";

export function MoneyHub() {
  return (
    <AccessBoundary permission="financials.view" variants={["client", "agency"]}>
      <MoneyHubContent />
    </AccessBoundary>
  );
}

function MoneyHubContent() {
  const { session, organizations } = useIdentity();
  const activeOrganization =
    organizations.find((organization) => organization.id === session.activeOrganizationId) ||
    organizations[0] ||
    null;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.16em]">Financial evidence</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {activeOrganization?.name ? `${activeOrganization.name} Money` : "Money"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Review qualified financial events, reconciliation state, refunds, chargebacks, and the evidence behind financial outcomes. TraceKit does not infer missing Profit inputs here.
          </p>
        </div>
        <span className="self-start rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-blue-100">
          Active client · {activeOrganization?.name || "Unavailable"}
        </span>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Destination
          href="/dashboard/financial-reconciliation"
          icon={<RefreshCcw className="h-5 w-5" />}
          eyebrow="Reconciliation"
          title="Financial Reconciliation"
          description="Review append-only refund, chargeback, fee, reversal, matching, duplicate, currency, and reconciliation evidence."
          action="Open reconciliation"
        />
        <Destination
          href="/dashboard/chargebacks"
          icon={<ShieldAlert className="h-5 w-5" />}
          eyebrow="Disputes"
          title="Chargebacks"
          description="Review dispute and chargeback evidence without flattening reversals or unresolved financial relationships into the original sale."
          action="Open chargebacks"
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 h-5 w-5 text-blue-300" />
          <div>
            <h2 className="text-sm font-semibold">Financial truth boundary</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Revenue, refunds, chargebacks, fees, and reversals remain distinct financial evidence. Profit is shown only where the required cost and reconciliation inputs are qualified.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Destination({
  href,
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-white/10 bg-white/[.035] p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-100">
        {icon}
      </div>
      <p className="mt-5 text-[9px] font-semibold uppercase tracking-[.14em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      <Link href={href} className="tk-brand-link mt-auto inline-flex items-center gap-2 pt-5 text-xs font-semibold">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

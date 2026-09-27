import type { MissionControlPortfolio, PortfolioMetric } from "@/lib/mission-control/production-portfolio";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function display(metric: PortfolioMetric, format: "money" | "count") {
  if (metric.value === null) return "Unavailable";
  return format === "money" ? money.format(metric.value) : Math.round(metric.value).toLocaleString();
}

function MetricCard({
  label,
  metric,
  format,
}: {
  label: string;
  metric: PortfolioMetric;
  format: "money" | "count";
}) {
  const stateLabel =
    metric.state === "available" ? "Verified input" : metric.state === "partial" ? "Partial evidence" : "Not qualified";
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="tk-label">{label}</p>
        <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">{stateLabel}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-100">{display(metric, format)}</p>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">{metric.detail}</p>
    </article>
  );
}

export function PortfolioKpis({ portfolio }: { portfolio: MissionControlPortfolio }) {
  return (
    <section aria-label="Portfolio KPIs">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="tk-brand-eyebrow text-[10px] font-semibold uppercase tracking-[.16em]">Production portfolio</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-100">{portfolio.organizationName} · Last 30 days</h2>
        </div>
        <p className="hidden text-[10px] text-slate-600 sm:block">Canonical commerce + financial evidence</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Revenue" metric={portfolio.metrics.revenue} format="money" />
        <MetricCard label="Profit" metric={portfolio.metrics.profit} format="money" />
        <MetricCard label="Conversions" metric={portfolio.metrics.conversions} format="count" />
        <MetricCard label="Refunds" metric={portfolio.metrics.refunds} format="money" />
        <MetricCard label="Chargebacks" metric={portfolio.metrics.chargebacks} format="money" />
      </div>
    </section>
  );
}

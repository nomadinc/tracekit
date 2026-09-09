import type { ShopifyOnboardingLifecycle } from "@/lib/commerce/shopify-onboarding-lifecycle";

const stateClasses: Record<ShopifyOnboardingLifecycle["state"], string> = {
  setting_up: "border-cyan/20 bg-cyan/5 text-cyan-100",
  syncing_history: "border-amber-400/20 bg-amber-400/5 text-amber-100",
  ready: "border-emerald-400/20 bg-emerald-400/5 text-emerald-100",
  needs_attention: "border-rose-400/20 bg-rose-400/5 text-rose-100",
};

export function ShopifyOnboardingStatus({ lifecycle }: { lifecycle: ShopifyOnboardingLifecycle }) {
  return (
    <section className="mx-auto mt-4 max-w-[1360px] px-5 sm:px-8 lg:px-10" aria-label="Shopify onboarding status">
      <div className={`rounded-2xl border p-5 ${stateClasses[lifecycle.state]}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] opacity-70">Shopify onboarding</p>
            <h2 className="mt-2 text-lg font-semibold">{lifecycle.label}</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-300">{lifecycle.detail}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Schedules" value={`${lifecycle.schedulesReady}/3`} />
            <Metric label="Live" value={`${lifecycle.liveResourcesHealthy}/3`} />
            <Metric label="History" value={`${lifecycle.backfillsComplete}/3`} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {lifecycle.resources.map((resource) => (
            <div key={resource.resource} className="rounded-xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm capitalize">{resource.resource}</strong>
                <span className="text-[10px] uppercase tracking-[.12em] text-slate-400">
                  {resource.backfillStatus === "completed" && resource.incrementalStatus === "completed" ? "Ready" : resource.incrementalStatus === "failed" || resource.backfillStatus === "failed" ? "Attention" : "Syncing"}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-[11px] text-slate-400">
                <p>Schedule · {resource.scheduleReady ? "Enabled" : "Pending"}</p>
                <p>Live sync · {pretty(resource.incrementalStatus)}</p>
                <p>Historical sync · {pretty(resource.backfillStatus)}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-5 text-slate-500">Live orders and refunds always take priority. Historical import runs automatically in bounded batches and resumes without operator action.</p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-20 rounded-xl border border-white/10 bg-black/15 px-3 py-2"><div className="font-semibold text-slate-100">{value}</div><div className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">{label}</div></div>;
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

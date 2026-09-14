import React from "react";

type LatencyMetric = {
  measured: number;
  medianSeconds: number | null;
  p95Seconds: number | null;
  maxSeconds: number | null;
};

export type AttributionQualityLatency = {
  webhookToOrdAvailable: LatencyMetric;
  webhookToJourneyShadow: LatencyMetric;
  liveV2?: {
    webhookToOrdAvailable: LatencyMetric;
    webhookToJourneyShadow: LatencyMetric;
  };
};

/** Live-v2 latency is unavailable in the current SQL projection; its absence is not a render failure. */
export function AttributionQualityLatencySection({ latency }: { latency?: AttributionQualityLatency | null }) {
  if (!latency) return <section className="tk-surface min-w-0 p-4 sm:p-5"><h2 className="text-base font-semibold">Observation latency</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Latency is temporarily unavailable.</p></section>;
  const liveOrd = latency.liveV2?.webhookToOrdAvailable;
  const liveJourney = latency.liveV2?.webhookToJourneyShadow;
  return <section className="tk-surface min-w-0 p-4 sm:p-5"><h2 className="text-base font-semibold">Observation latency</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-slate-200/70 p-3 text-sm dark:border-white/10"><h3 className="font-medium">Webhook → ORD available</h3><p className="mt-1 text-slate-500 dark:text-slate-400">All purchases · median {latency.webhookToOrdAvailable.medianSeconds ?? "—"}s · p95 {latency.webhookToOrdAvailable.p95Seconds ?? "—"}s · max {latency.webhookToOrdAvailable.maxSeconds ?? "—"}s · {latency.webhookToOrdAvailable.measured} measured</p></div>
      <div className="rounded-lg border border-slate-200/70 p-3 text-sm dark:border-white/10"><h3 className="font-medium">Webhook → Journey shadow</h3><p className="mt-1 text-slate-500 dark:text-slate-400">All purchases · median {latency.webhookToJourneyShadow.medianSeconds ?? "—"}s · p95 {latency.webhookToJourneyShadow.p95Seconds ?? "—"}s · max {latency.webhookToJourneyShadow.maxSeconds ?? "—"}s · {latency.webhookToJourneyShadow.measured} measured</p></div>
      <div className="rounded-lg border border-slate-200/70 p-3 text-sm dark:border-white/10"><h3 className="font-medium">Live v2 · ORD available</h3><p className="mt-1 text-slate-500 dark:text-slate-400">{liveOrd ? `Median ${liveOrd.medianSeconds ?? "—"}s · p95 ${liveOrd.p95Seconds ?? "—"}s` : "Unavailable"}</p></div>
      <div className="rounded-lg border border-slate-200/70 p-3 text-sm dark:border-white/10"><h3 className="font-medium">Live v2 · Journey shadow</h3><p className="mt-1 text-slate-500 dark:text-slate-400">{liveJourney ? `Median ${liveJourney.medianSeconds ?? "—"}s · p95 ${liveJourney.p95Seconds ?? "—"}s` : "Unavailable"}</p></div>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">Historical recovery dominates all-cohort latency. Mapping creation timestamps approximate first ORD availability. Historical first exact-match transitions were not persisted.</p>
  </section>;
}

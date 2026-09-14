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
  if (!latency) return <section className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Observation latency</h2><p className="mt-2 text-sm">Latency is temporarily unavailable.</p></section>;
  const liveOrd = latency.liveV2?.webhookToOrdAvailable;
  const liveJourney = latency.liveV2?.webhookToJourneyShadow;
  return <section className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Observation latency</h2>
    <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
      <div>All: webhook → ORD available: median {latency.webhookToOrdAvailable.medianSeconds ?? "—"}s, p95 {latency.webhookToOrdAvailable.p95Seconds ?? "—"}s, max {latency.webhookToOrdAvailable.maxSeconds ?? "—"}s ({latency.webhookToOrdAvailable.measured} measured)</div>
      <div>All: webhook → Journey shadow: median {latency.webhookToJourneyShadow.medianSeconds ?? "—"}s, p95 {latency.webhookToJourneyShadow.p95Seconds ?? "—"}s, max {latency.webhookToJourneyShadow.maxSeconds ?? "—"}s ({latency.webhookToJourneyShadow.measured} measured)</div>
      <div>Live v2: webhook → ORD available: {liveOrd ? `median ${liveOrd.medianSeconds ?? "—"}s, p95 ${liveOrd.p95Seconds ?? "—"}s` : "Unavailable"}</div>
      <div>Live v2: webhook → Journey shadow: {liveJourney ? `median ${liveJourney.medianSeconds ?? "—"}s, p95 ${liveJourney.p95Seconds ?? "—"}s` : "Unavailable"}</div>
    </div>
    <p className="mt-2 text-xs text-slate-500">Historical recovery dominates all-cohort latency. Mapping creation timestamps approximate first ORD availability. Historical first exact-match transitions were not persisted.</p>
  </section>;
}

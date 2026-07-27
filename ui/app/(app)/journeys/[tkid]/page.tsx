// app/(app)/journeys/[tkid]/page.tsx
import Link from "next/link";
import { apiGetJson } from "@/lib/api";
import { EntityHeader } from "@/components/shared/entity-header";
import { LiveRouteRefresh } from "@/components/live/live-route-refresh";

type TimelineEvent = {
  kind: "event";
  ts: string;
  event: string;
  url: string | null;
  referrer: string | null;
  utms: Record<string, any>;
  click_ids: Record<string, string>;
  identity: { email?: string; phone?: string };
  raw: any;
};

type TimelineConversion = {
  kind: "conversion";
  ts: string;
  event: string; // "sale" | "refund" | "chargeback" | ...
  url: string | null;
  referrer: string | null;
  utms: Record<string, any>;
  click_ids: Record<string, string>;
  identity: { email?: string; phone?: string };
  raw: any;
  amount: number | null;
  currency: string | null;
  network: string | null;
  source_system: string | null;
  order_id: string | null;
  transaction_id: string | null;
};

type JourneyResponse = {
  ok: boolean;
  tkid: string;
  count: number;
  timeline: (TimelineEvent | TimelineConversion)[];
};

// --- helpers (keep whatever you already had below; these are placeholders) ---
function computeStats(_timeline: (TimelineEvent | TimelineConversion)[]) {
  return {
    grossSales: 0,
    totalRefunds: 0,
    totalChargebacks: 0,
    netRevenue: 0,
    salesCount: 0,
    refundsCount: 0,
    chargebacksCount: 0,
    currency: "USD",
    firstSeen: undefined as string | undefined,
    lastSeen: undefined as string | undefined,
  };
}

function computeNetworkSummary(_timeline: (TimelineEvent | TimelineConversion)[]) {
  return [] as any[];
}

function computeOrdersFromTimeline(_timeline: (TimelineEvent | TimelineConversion)[]) {
  return [] as any[];
}

// ✅ IMPORTANT: do NOT name this type PageProps (conflicts with Next internal typing)
type Props = {
  params: Promise<{ tkid: string }>;
};

export default async function JourneyDetailPage({ params }: Props) {
  const { tkid } = await params;
  const decodedTkid = decodeURIComponent(tkid);

  let data: JourneyResponse | null = null;
  let error: string | null = null;

  try {
    const json = await apiGetJson<JourneyResponse>(
      `/v1/journey?tkid=${encodeURIComponent(decodedTkid)}`
    );
    if (!json.ok) throw new Error("API returned not ok");
    data = json;
  } catch (e: any) {
    console.error("[JourneyDetail] failed to load", e);
    error = e?.message ?? "Failed to load journey";
  }

  const timeline = data?.timeline ?? [];
  const stats = computeStats(timeline);
  const networkSummary = computeNetworkSummary(timeline);
  const orders = computeOrdersFromTimeline(timeline);

  return (
    <div className="p-6 space-y-4 text-sm text-slate-900 dark:text-slate-100">
      <LiveRouteRefresh workspaceId="default" entity={{ type: "journey", id: decodedTkid }} types={["entity.changed", "metric.changed", "activity.created", "activity.updated"]} />
      <div className="flex justify-end">
        <Link
          href="/journeys"
          className="text-sm underline underline-offset-4 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Back
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink/80">
        <EntityHeader
          entityType="journey"
          title="Customer Journey"
          subtitle={`TKID ${decodedTkid}`}
          statuses={[
            { label: timeline.some((event) => event.kind === "conversion") ? "Converted" : "Browsing", tone: timeline.some((event) => event.kind === "conversion") ? "success" : "info" },
          ]}
          metadata={[
            { label: "Touchpoints", value: timeline.length },
            { label: "Conversions", value: timeline.filter((event) => event.kind === "conversion").length },
            { label: "First seen", value: stats.firstSeen || "Unknown" },
            { label: "Last activity", value: stats.lastSeen || "Unknown" },
          ]}
          identifiers={[{ label: "TKID", value: decodedTkid }]}
          actions={[
            { id: "copy-journey-id", label: "Copy journey ID", kind: "copy", value: decodedTkid, safe: true },
            { id: "copy-journey-link", label: "Copy link", kind: "copy", value: `/journeys/${encodeURIComponent(decodedTkid)}`, safe: true },
          ]}
        />
      </section>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Journey unavailable.</span>{" "}
          <span className="font-mono text-xs opacity-80">{error}</span>
        </div>
      ) : null}

      {/* Keep your existing UI below this point */}
      <div className="rounded-xl border p-4">
        <div className="text-sm font-semibold mb-2">Timeline</div>
        <div className="text-xs text-slate-500">
          Events: {timeline.length}
        </div>
      </div>

      {/* If you already have sections for stats/network/orders, paste them back in */}
    </div>
  );
}

import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { readCommasAttributionQuality } from "@/lib/commerce/attribution-quality-repository";
import { AttributionQualityLatencySection } from "@/lib/commerce/attribution-quality-latency";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/shared/primitives";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const muted = "text-slate-500 dark:text-slate-400";
const section = "tk-surface min-w-0 p-4 sm:p-5";
const tableHead = "bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/[.04] dark:text-slate-400";
const cell = "px-3 py-3 first:pl-4 last:pr-4";
const numeric = `${cell} text-right tabular-nums`;

function Panel({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`${section} ${className}`}>
    <div className="mb-4"><h2 className="text-base font-semibold tracking-tight">{title}</h2>{description ? <p className={`mt-1 text-xs leading-5 ${muted}`}>{description}</p> : null}</div>
    {children}
  </section>;
}

type StatusTone = "success" | "warning" | "critical" | "info" | "neutral";

function StatRow({ label, value, tone }: { label: string; value: ReactNode; tone?: StatusTone }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-200/70 py-2.5 last:border-0 dark:border-white/10">
    <span className={`min-w-0 break-words text-sm ${muted}`}>{label}</span>
    {tone ? <StatusBadge tone={tone}>{value}</StatusBadge> : <strong className="shrink-0 text-sm font-semibold tabular-nums">{value}</strong>}
  </div>;
}

function ComparisonTone({ state }: { state: string }) {
  const tone: StatusTone = state === "exact_match" ? "success" : state === "conflict" ? "warning" : state === "partial_match" ? "info" : "neutral";
  return <StatusBadge tone={tone}>{state.replaceAll("_", " ")}</StatusBadge>;
}

function ReportTable({ headers, children, minWidth }: { headers: string[]; children: ReactNode; minWidth: string }) {
  return <div className="tk-table-wrap max-w-full"><table className={`${minWidth} w-full text-left text-sm`}>
    <thead className={tableHead}><tr>{headers.map((header, index) => <th scope="col" className={`${cell} ${index ? "text-right" : ""}`} key={header}>{header}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-200/70 dark:divide-white/10">{children}</tbody>
  </table></div>;
}

export default async function CommasAttributionQualityPage() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) return <p className="tk-page">Report unavailable.</p>;
  try { requirePermission(resolution.session, "connectors.view"); } catch { return <p className="tk-page">Report unavailable.</p>; }
  let result: Awaited<ReturnType<typeof readCommasAttributionQuality>>;
  try { result = await readCommasAttributionQuality(resolution.session.activeOrganization.id); }
  catch { return <p className="tk-page">Commas attribution quality is temporarily unavailable.</p>; }
  if (result.kind !== "available") return <p className="tk-page">No active Commas connection is available for this organization.</p>;
  const r = result.report;
  const coverage = r.parameters as Record<string, { count: number; percentage: number } | number>;
  const entries = ["affid", "sub1", "sub4", "_ef_transaction_id", "transactionId", "tid", "c1"];
  const funnel = { "Accepted delivery": r.funnel.receivedDeliveries, Evidence: r.funnel.evidence, Observation: r.funnel.observation, "Payment ORD": r.funnel.validOrd, "Exact ORD": r.funnel.exactOrd, "Canonical order": r.funnel.canonicalOrder, "Everflow comparable": r.funnel.everflowComparable, "Journey shadow": r.funnel.journeyShadow };
  const pending = r.ord.unmatchedReasons.transactionNotIngestedYet;
  return <main className="tk-page min-w-0 space-y-6">
    <header className="space-y-3">
      <div className="flex flex-wrap gap-2"><StatusBadge tone="info">Shadow Measurement</StatusBadge><StatusBadge tone="neutral">No Attribution Credit Impact</StatusBadge></div>
      <div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Commas Attribution Quality</h1><p className={`mt-2 max-w-3xl text-sm leading-6 ${muted}`}>Provider-observed checkout evidence, exact ORD identity, and Everflow comparison. This report makes no attribution decision.</p></div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Quality scorecards">
      <KpiCard label="Verified accepted purchases" value={String(r.total)} helper="Provider-observed cohort" />
      <KpiCard label="Exact ORD identity" value={`${r.ord.matchRate}%`} helper={`${r.ord.exact} of ${r.total} purchases`} />
      <KpiCard label="Everflow exact" value={String(r.everflow.exact_match.count)} helper={`${r.everflow.conflict.count} conflicts`} />
      <KpiCard label="Journey shadow" value={String(r.funnel.journeyShadow)} helper="No credit impact" />
    </section>

    <Panel title="Quality funnel" description="Verified accepted purchase events through shadow projection.">
      <ol className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">{Object.entries(funnel).map(([label, value], index) => <li className="min-w-0 rounded-lg border border-slate-200/70 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[.03]" key={label}><span className="tk-label">{String(index + 1).padStart(2, "0")} · {label}</span><strong className="mt-2 block text-lg font-semibold tabular-nums">{value ?? "—"}</strong></li>)}</ol>
      <p className={`mt-3 text-xs leading-5 ${muted}`}>Unsigned or malformed rejected requests are not durably counted and are excluded from this verified-purchase cohort.</p>
    </Panel>

    <Panel title="Unmatched ORD identity" description="Commerce identity is separate from marketing attribution evidence.">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatRow label="Pending identity" value={pending} tone={pending ? "info" : "neutral"} />
        <StatRow label="Unresolved identity" value={r.ord.unmatched - pending} tone={r.ord.unmatched > pending ? "warning" : "neutral"} />
        <StatRow label="Malformed" value={r.ord.malformed} tone={r.ord.malformed ? "warning" : "neutral"} />
        <StatRow label="Ambiguous" value={r.ord.ambiguous} tone={r.ord.ambiguous ? "warning" : "neutral"} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge tone={pending ? "info" : "success"}>Current ingestion lag · {pending}</StatusBadge><span className={`text-xs ${muted}`}>Purchases observed after the latest completed transaction sync await ingestion; mapping gaps after sync remain distinct.</span></div>
      <div className="mt-3 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(r.ord.unmatchedReasons).map(([reason, value]) => <StatRow key={reason} label={reason.replace(/([A-Z])/g, " $1")} value={value} />)}</div>
    </Panel>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Provider-observed parameter coverage"><div>{entries.map(key => { const value = coverage[key] as { count: number; percentage: number }; return <StatRow key={key} label={key} value={`${value.count} · ${value.percentage}%`} />; })}</div></Panel>
      <Panel title="Independent source quality" description="Stored and current Everflow states remain separate.">
        <h3 className="tk-label">Commas aliases</h3><div>{Object.entries(r.aliases).map(([key, value]) => <StatRow key={key} label={key.replaceAll("_", " ")} value={`${value.count} · ${value.percentage}%`} tone={key === "conflict" && value.count ? "warning" : undefined} />)}</div>
        <h3 className="tk-label mt-4">Stored Everflow comparison</h3><div>{Object.entries(r.everflow).map(([key, value]) => <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2.5 last:border-0 dark:border-white/10" key={key}><ComparisonTone state={key} /><strong className="text-sm tabular-nums">{value.count} · {value.percentage}%</strong></div>)}</div>
        <h3 className="tk-label mt-4">Current Everflow comparison</h3><div>{Object.entries(r.currentEverflow).map(([key, value]) => <StatRow key={key} label={key.replaceAll("_", " ")} value={value} tone={key === "conflict" && value ? "warning" : undefined} />)}</div>
        <p className={`mt-3 text-xs leading-5 ${muted}`}>{r.comparisonFreshness.storedNoRecordNowLinked} stored “no record” cases now have an exact current Everflow transaction identity; source observations were not changed.</p>
      </Panel>
    </div>

    <Panel title="Daily quality · UTC">
      <ReportTable minWidth="min-w-[760px]" headers={["Date", "Purchases", "Exact ORD", "TID coverage", "Affiliate coverage", "Alias conflicts", "Everflow exact", "Everflow conflicts"]}>
        {r.daily.map(day => <tr key={day.date}><th scope="row" className={`${cell} whitespace-nowrap font-medium`}>{day.date}</th>{[day.purchases, `${day.ordExactRate}%`, `${day.transactionIdCoverage}%`, `${day.affiliateCoverage}%`, `${day.aliasConflictRate}%`, `${day.everflowExactRate}%`, `${day.everflowConflictRate}%`].map((value, index) => <td className={numeric} key={index}>{value}</td>)}</tr>)}
      </ReportTable>
    </Panel>

    <Panel title="Field-level agreement" description="Current Everflow values are compared by exact observed transaction ID. Missing values are separate from disagreements; stored states can predate later Everflow ingestion.">
      <ReportTable minWidth="min-w-[690px]" headers={["Field", "Comparable", "Agree", "Disagree", "Commas missing", "Everflow missing", "Both missing"]}>
        {Object.entries(r.fieldAgreement).map(([field, value]) => <tr key={field}><th scope="row" className={`${cell} whitespace-nowrap font-medium`}>{field.replace(/([A-Z])/g, " $1")}</th><td className={numeric}>{value.comparable}</td><td className={numeric}>{value.agree}</td><td className={numeric}>{value.disagree ? <StatusBadge tone="warning">{value.disagree}</StatusBadge> : value.disagree}</td><td className={numeric}>{value.commasMissing}</td><td className={numeric}>{value.everflowMissing}</td><td className={numeric}>{value.bothMissing}</td></tr>)}
      </ReportTable>
    </Panel>

    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="No Commas transaction ID" description="Exact order identity does not establish marketing attribution.">
        <div className="flex flex-wrap gap-2"><StatusBadge tone="success">Commerce identity known · {r.noTid.exactOrd}</StatusBadge><StatusBadge tone="neutral">Marketing evidence absent</StatusBadge></div>
        <p className={`mt-3 text-sm ${muted}`}>{r.noTid.purchases} purchases without a Commas transaction ID. Affiliate ID present: {r.noTid.affiliatePresent}; sub1: {r.noTid.sub1Present}; sub4: {r.noTid.sub4Present}.</p>
      </Panel>
      <Panel title="Payment path"><p className={`text-sm ${muted}`}>Unavailable. The normalized order payment type is not a trustworthy processor identifier.</p></Panel>
    </div>

    <Panel title="Conflict review" description="Field names and agreement states only. Source values remain restricted.">
      {r.conflicts.length ? <div className="divide-y divide-slate-200/70 dark:divide-white/10">{r.conflicts.map(conflict => <article className="py-4 first:pt-0 last:pb-0" key={conflict.eventReference}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h3 className="break-all text-sm font-semibold">{conflict.eventReference}</h3><p className={`mt-1 text-xs ${muted}`}>{conflict.eventAt} · {conflict.derivationMode}</p></div><div className="flex flex-wrap gap-2"><ComparisonTone state={conflict.comparisonState} /><StatusBadge tone="neutral">{conflict.ordMatchState} ORD</StatusBadge></div></div>
        <p className="mt-3 text-sm font-medium">{conflict.classification.replaceAll("_", " ")} · {conflict.conflictingFields.join(", ") || "No field detail"}</p>
        <p className={`mt-1 text-xs leading-5 ${muted}`}>Commas aliases: {conflict.conflictingAliases.join(", ") || "agree"}. Transaction identity {conflict.fieldDiagnostics.transactionIdentity}; affiliate ID {conflict.fieldDiagnostics.affiliateId}; sub1 {conflict.fieldDiagnostics.sub1}; sub4 {conflict.fieldDiagnostics.sub4}.</p>
      </article>)}</div> : <p className={`text-sm ${muted}`}>No conflicts in the current cohort.</p>}
    </Panel>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Derivation provenance" description="Live normalization and Evidence reconciliation remain distinct."><StatRow label="Pre-fix Evidence" value={r.provenance.evidenceReconciled} /><StatRow label="Live v2 normalizer" value={r.provenance.liveNormalizer} /><StatRow label="Later reconciled observations" value={r.provenance.laterReconciled} /><p className={`mt-2 text-xs leading-5 ${muted}`}>The immutable Evidence normalizer version identifies the original path; later reconciliation may update derived observations.</p></Panel>
      <Panel title="Transaction ingestion health"><StatRow label="Latest run" value={result.ingestion.latestRun?.status || "none"} /><StatRow label="Completed" value={result.ingestion.latestRun?.completedAt || "pending"} /><StatRow label="Latest represented order" value={result.ingestion.latestOrderAt || "unknown"} /><StatRow label="Numeric mappings" value={result.ingestion.numericMappings} /><StatRow label="ORD mappings" value={result.ingestion.ordMappings} /><StatRow label="Projection gap" value={result.ingestion.ordProjectionGap} tone={result.ingestion.ordProjectionGap ? "warning" : "success"} /></Panel>
    </div>

    <AttributionQualityLatencySection latency={r.latency} />
    <Panel title="Sample maturity" description="Measurement progress only; no attribution decision is made.">
      <div className="mb-4"><StatusBadge tone="info">{r.maturity.status.replaceAll("_", " ")}</StatusBadge></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-slate-200/70 p-3 dark:border-white/10"><p className="tk-label">Clean post-epoch purchases</p><p className="mt-2 text-xl font-semibold tabular-nums">{r.maturity.postCutover ?? 0} <span className={`text-sm font-normal ${muted}`}>/ 500</span></p></div><div className="rounded-lg border border-slate-200/70 p-3 dark:border-white/10"><p className="tk-label">Certified healthy days</p><p className="mt-2 text-xl font-semibold tabular-nums">{r.maturity.healthyDays ?? 0} <span className={`text-sm font-normal ${muted}`}>/ 7</span></p></div></div>
      <p className={`mt-3 text-xs leading-5 ${muted}`}>{r.maturity.sample} total observations · measurement epoch {r.maturity.measurementEpochAt || "not configured"}. Historical days without complete health evidence are not certified.</p>
      <p className="mt-2 text-sm font-medium">Reaching the measurement threshold starts a design review. It does not change attribution credits.</p>
    </Panel>
  </main>;
}

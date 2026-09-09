"use client";

import * as React from "react";
import { AlertTriangle, CircleDot, Link2, RadioTower } from "lucide-react";
import { CopyButton } from "@/components/shared/primitives";
import { formatCustomerTime } from "@/lib/customers";
import {
  categoryLabel,
  flagLabel,
  providerLabel,
  truncationLabels,
  type JourneyAttributionEvidence,
} from "@/lib/journey-attribution-evidence";
import { identifierEvidenceDomId } from "@/lib/journey-risk-signals";
import { Badge, Section } from "./narrative-components";

function Field({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${mono ? "font-mono text-xs" : ""}`}>{value === null || value === undefined || value === "" ? "Not observed" : value}</dd>
    </div>
  );
}

function EvidenceEmptyState() {
  return (
    <div className="rounded-lg border border-dashed bg-slate-50 p-5 text-sm dark:border-white/10 dark:bg-white/5">
      <p className="font-medium">No attribution evidence observed</p>
      <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">This journey is valid, but its events do not contain bounded Attribution Evidence v1 observations.</p>
    </div>
  );
}

export function JourneyAttributionEvidenceSection({ evidence }: { evidence?: JourneyAttributionEvidence | null }) {
  const hasEvidence = Boolean(evidence && (evidence.evidence_event_count || evidence.providers.length || evidence.identifiers.length || evidence.flags.length || evidence.referrers.missing_observed || evidence.referrers.first_observed_client_referrer));
  const capped = evidence?.truncation.truncated ? truncationLabels(evidence.truncation) : [];
  return (
    <div id="journey-attribution-evidence" tabIndex={-1} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
    <Section title="Attribution Evidence" icon={RadioTower}>
      <p className="mb-4 text-sm leading-6 text-slate-600 dark:text-slate-300">Observed acquisition signals across this journey. This is observed attribution evidence, not a fraud determination.</p>
      {!evidence || !hasEvidence ? <EvidenceEmptyState /> : (
        <div className="space-y-5">
          {evidence.truncation.truncated ? (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>Some evidence is omitted because this journey exceeded evidence display limits.{capped.length ? ` Capped: ${capped.join(", ")}.` : ""}</p>
            </div>
          ) : null}

          <section aria-labelledby="evidence-summary-heading">
            <h3 id="evidence-summary-heading" className="text-sm font-semibold">Evidence summary</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {evidence.providers.length ? evidence.providers.map((provider) => (
                <span key={`${provider.provider}:${provider.category}`} className="inline-flex flex-col rounded-lg border bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <span className="text-sm font-medium">{providerLabel(provider.provider)}</span>
                  <span className="text-[11px] text-slate-500">{categoryLabel(provider.category)}</span>
                </span>
              )) : <Badge>No providers observed</Badge>}
              <Badge>{evidence.identifier_count} identifier{evidence.identifier_count === 1 ? "" : "s"}</Badge>
              <Badge>{evidence.evidence_event_count} evidence event{evidence.evidence_event_count === 1 ? "" : "s"}</Badge>
              <Badge>{evidence.truncation.truncated ? "Evidence capped" : "Complete within limits"}</Badge>
            </div>
          </section>

          <section aria-labelledby="identifier-history-heading">
            <h3 id="identifier-history-heading" className="text-sm font-semibold">Identifier history</h3>
            {evidence.identifiers.length ? (
              <div className="mt-3 grid gap-3">
                {evidence.identifiers.map((identifier) => (
                  <article id={identifierEvidenceDomId(identifier)} tabIndex={-1} key={`${identifier.raw_param}:${identifier.provider}:${identifier.category}:${identifier.identifier_type}`} className="group min-w-0 rounded-lg border p-4 transition data-[supporting-evidence=true]:ring-2 data-[supporting-evidence=true]:ring-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="break-all font-mono text-sm font-semibold">{identifier.raw_param}</h4>
                        <p className="mt-1 text-xs text-slate-500">{providerLabel(identifier.provider)} · {categoryLabel(identifier.category)} · {identifier.identifier_type.replace(/_/g, " ")}</p>
                      </div>
                      <Badge tone={identifier.value_changed ? "warn" : "neutral"}>{identifier.value_changed ? "Changed" : "Stable"}</Badge>
                      <span className="hidden rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium group-data-[supporting-evidence=true]:inline-flex dark:border-white/20 dark:bg-ink">Supporting evidence</span>
                    </div>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="First value" value={identifier.first_value} mono />
                      <Field label="Latest value" value={identifier.latest_value} mono />
                      <Field label="First seen" value={formatCustomerTime(identifier.first_seen_at)} />
                      <Field label="Last seen" value={formatCustomerTime(identifier.last_seen_at)} />
                      <Field label="Events" value={identifier.event_count} />
                      <Field label="Distinct values" value={identifier.distinct_value_count} />
                      <Field label="First source" value={identifier.first_source_location} />
                      <Field label="Latest source" value={identifier.latest_source_location} />
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CopyButton value={identifier.first_value} label="Copy first value" />
                      {identifier.latest_value !== identifier.first_value ? <CopyButton value={identifier.latest_value} label="Copy latest value" /> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-slate-500 dark:border-white/10">Providers were observed, but no attribution identifiers were retained.</p>}
          </section>

          <section aria-labelledby="referrer-history-heading">
            <h3 id="referrer-history-heading" className="text-sm font-semibold">Referrer history</h3>
            <dl className="mt-3 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-3 dark:border-white/10">
              <Field label="First observed referrer" value={evidence.referrers.first_observed_client_referrer} />
              <Field label="Latest observed referrer" value={evidence.referrers.latest_observed_client_referrer} />
              <Field label="First external origin" value={evidence.referrers.first_external_origin} />
              <Field label="Latest external origin" value={evidence.referrers.latest_external_origin} />
              <Field label="Distinct external origins" value={evidence.referrers.distinct_external_origins.length ? evidence.referrers.distinct_external_origins.join(", ") : "None observed"} />
              <Field label="Observation state" value={`${evidence.referrers.missing_observed ? "Missing observed" : "No missing referrer observed"} · ${evidence.referrers.changed ? "Origin changed" : "Origin unchanged"}`} />
            </dl>
          </section>

          <section aria-labelledby="evidence-flags-heading">
            <h3 id="evidence-flags-heading" className="text-sm font-semibold">Evidence flags</h3>
            {evidence.flags.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {evidence.flags.map((flag) => <li key={flag} className="flex gap-2 rounded-lg border p-3 text-sm dark:border-white/10"><CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><span>{flagLabel(flag)}</span></li>)}
              </ul>
            ) : <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Link2 className="h-4 w-4" aria-hidden="true" />No descriptive evidence flags were produced.</p>}
          </section>
        </div>
      )}
    </Section>
    </div>
  );
}

"use client";

import * as React from "react";
import { AlertTriangle, CircleDot, Info, ShieldAlert } from "lucide-react";
import { formatCustomerTime } from "@/lib/customers";
import { categoryLabel, providerLabel } from "@/lib/journey-attribution-evidence";
import {
  confidencePresentation,
  identifierEvidenceDomIdFromStableKey,
  riskSignalDescription,
  riskSignalTitle,
  type JourneyRiskEvidenceReference,
  type JourneyRiskSeverity,
  type JourneyRiskSignal,
  type JourneyRiskSignalsV1,
} from "@/lib/journey-risk-signals";
import { Section } from "./narrative-components";

const severityPresentation: Record<JourneyRiskSeverity, { label: string; icon: typeof Info; badge: string; card: string }> = {
  informational: { label: "Informational", icon: Info, badge: "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200", card: "border-slate-200 dark:border-white/10" },
  low: { label: "Low", icon: CircleDot, badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100", card: "border-amber-200/80 dark:border-amber-500/25" },
  medium: { label: "Medium", icon: AlertTriangle, badge: "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-400/50 dark:bg-amber-500/15 dark:text-amber-50", card: "border-amber-300 bg-amber-50/40 dark:border-amber-400/40 dark:bg-amber-500/5" },
  high: { label: "High", icon: AlertTriangle, badge: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100", card: "border-rose-200 bg-rose-50/30 dark:border-rose-500/30 dark:bg-rose-500/5" },
};

function signalFacts(signal: JourneyRiskSignal): Array<[string, React.ReactNode]> {
  if (signal.signal_code === "journey_identifier_value_changed") {
    const rows: Array<[string, React.ReactNode]> = [
      ["Identifier parameter", signal.facts.raw_param],
      ["Provider", signal.facts.provider ? providerLabel(signal.facts.provider) : null],
      ["Category", signal.facts.category ? categoryLabel(signal.facts.category) : null],
      ["Identifier type", signal.facts.identifier_type?.replace(/_/g, " ")],
      ["Distinct values", signal.facts.distinct_value_count],
      ["Event count", signal.facts.event_count],
      ["First observed", signal.facts.first_seen_at ? formatCustomerTime(signal.facts.first_seen_at) : null],
      ["Last observed", signal.facts.last_seen_at ? formatCustomerTime(signal.facts.last_seen_at) : null],
    ];
    return rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  }
  const rows: Array<[string, React.ReactNode]> = [
    ["Provider count", signal.facts.provider_count],
    ["Providers", signal.facts.providers?.map(providerLabel).join(", ")],
    ["Evidence event count", signal.facts.evidence_event_count],
  ];
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function evidenceTarget(reference: JourneyRiskEvidenceReference) {
  return document.getElementById(identifierEvidenceDomIdFromStableKey(reference.stable_key));
}

function focusEvidence(reference: JourneyRiskEvidenceReference, onUnavailable: () => void) {
  const target = evidenceTarget(reference);
  if (!target) {
    onUnavailable();
    return;
  }
  target.dataset.supportingEvidence = "true";
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
  window.setTimeout(() => { delete target.dataset.supportingEvidence; }, 1800);
}

function SignalCard({ signal }: { signal: JourneyRiskSignal }) {
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const effectiveSeverity = signal.signal_code === "multiple_affiliate_networks_observed" ? "informational" : signal.severity;
  const presentation = severityPresentation[effectiveSeverity];
  const Icon = presentation.icon;
  const confidence = confidencePresentation[signal.confidence];
  const facts = signalFacts(signal);
  const multiNetworkContractMismatch = signal.signal_code === "multiple_affiliate_networks_observed" && signal.severity !== "informational";
  const primaryReference = signal.evidence_refs[0];
  const viewPrimaryEvidence = () => {
    setFeedback(null);
    if (signal.signal_code === "multiple_affiliate_networks_observed") {
      const section = document.getElementById("journey-attribution-evidence");
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        section.focus({ preventScroll: true });
        return;
      }
    }
    if (primaryReference) focusEvidence(primaryReference, () => setFeedback("Supporting evidence is not available in the retained journey evidence."));
    else setFeedback("Supporting evidence is not available in the retained journey evidence.");
  };

  return (
    <article data-risk-signal-card className={`min-w-0 rounded-lg border p-4 ${presentation.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h4 className="font-semibold">{riskSignalTitle(signal.signal_code)}</h4>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{riskSignalDescription(signal.signal_code)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.badge}`}>{presentation.label}</span>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">{categoryLabel(signal.category)}</span>
        </div>
      </div>

      {multiNetworkContractMismatch ? (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5" role="status">
          This informational signal returned an unsupported severity and cannot be classified for review.
        </p>
      ) : null}
      {signal.signal_code === "multiple_affiliate_networks_observed" ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">This may reflect forwarding, partner routing, or separate acquisition stages.</p> : null}
      {signal.observed_at ? <p className="mt-3 text-xs text-slate-500">Observed <time dateTime={signal.observed_at}>{formatCustomerTime(signal.observed_at)}</time></p> : null}

      <button type="button" aria-label={`View supporting evidence for ${riskSignalTitle(signal.signal_code)}`} onClick={viewPrimaryEvidence} className="mt-4 inline-flex w-full justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:w-auto dark:border-white/10 dark:hover:bg-white/5">
        View supporting evidence
      </button>
      {feedback ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" role="status">{feedback}</p> : null}

      <details className="mt-4 rounded-md border bg-white/60 p-3 text-sm dark:border-white/10 dark:bg-black/10">
        <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Signal details</summary>
        <div className="mt-4 space-y-4">
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evaluator summary</h5>
            <p className="mt-1 leading-6">{signal.summary}</p>
          </div>
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Explanation</h5>
            <p className="mt-1 leading-6">{signal.explanation}</p>
          </div>
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</h5>
            <p className="mt-1 font-medium">{confidence.label}</p>
            <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">{confidence.explanation}</p>
          </div>
          {facts.length ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
            </dl>
          ) : null}
          {signal.assumptions.length ? <div><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assumptions</h5><ul className="mt-1 list-disc space-y-1 pl-5">{signal.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div> : null}
          <div><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operator guidance</h5><p className="mt-1 leading-6">{signal.operator_guidance}</p></div>
          {signal.evidence_refs.length ? (
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting evidence</h5>
              <div className="mt-2 flex flex-wrap gap-2">
                {signal.evidence_refs.map((reference, index) => (
                  <button key={reference.stable_key} type="button" aria-label={`View supporting identifier group ${index + 1} for ${riskSignalTitle(signal.signal_code)}`} onClick={() => focusEvidence(reference, () => setFeedback("Supporting evidence is not available in the retained journey evidence."))} className="max-w-full rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10 dark:hover:bg-white/5">
                    View identifier group
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-w-0"><h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signal ID</h5><p className="mt-1 break-all font-mono text-xs">{signal.id}</p></div>
        </div>
      </details>
    </article>
  );
}

export function JourneyRiskSignalsSection({ evaluation }: { evaluation?: JourneyRiskSignalsV1 | null }) {
  if (!evaluation) return null;
  const displaySignals = evaluation.evaluation_status === "not_evaluable" ? [] : evaluation.signals;
  const reviewSignals = displaySignals.filter((signal) => signal.signal_code === "journey_identifier_value_changed" && signal.severity !== "informational");
  const contextSignals = displaySignals.filter((signal) => signal.signal_code === "multiple_affiliate_networks_observed" || signal.severity === "informational");
  const completeAndEmpty = evaluation.evaluation_status === "complete" && evaluation.signals.length === 0;
  return (
    <Section title="Risk Signals" icon={ShieldAlert}>
      <section aria-labelledby="journey-risk-signals-heading">
        <h3 id="journey-risk-signals-heading" className="sr-only">Journey risk signals</h3>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Severity indicates review priority, not attribution validity.</p>

        {evaluation.evaluation_status === "partial" ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" role="status">
            Risk evaluation is incomplete because some contributing evidence was truncated. Displayed signals are supported by retained evidence, but missing signals do not establish absence.
          </p>
        ) : null}
        {evaluation.evaluation_status === "not_evaluable" ? (
          <div className="mt-4 rounded-lg border border-dashed bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-white/5">
            <p className="font-medium">This journey could not be evaluated under the current risk ruleset.</p>
            <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">Attribution evidence was missing or used an unsupported contract version.</p>
          </div>
        ) : null}
        {completeAndEmpty ? (
          <div className="mt-4 rounded-lg border border-dashed bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-white/5">
            <p className="font-medium">No review signals were produced by the current ruleset.</p>
            <p className="mt-1 leading-6 text-slate-500 dark:text-slate-400">This reflects the retained journey evidence and is not a statement that the journey is safe or risk-free.</p>
          </div>
        ) : null}

        {reviewSignals.length ? <section className="mt-5" aria-labelledby="review-signals-heading"><h3 id="review-signals-heading" className="text-sm font-semibold">Review signals</h3><div className="mt-3 grid gap-3 xl:grid-cols-2">{reviewSignals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</div></section> : null}
        {contextSignals.length ? <section className="mt-5" aria-labelledby="context-signals-heading"><h3 id="context-signals-heading" className="text-sm font-semibold">Context</h3><div className="mt-3 grid gap-3 xl:grid-cols-2">{contextSignals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</div></section> : null}

        <details className="mt-5 rounded-md border p-3 text-sm dark:border-white/10">
          <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Evaluation details</summary>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Ruleset</dt><dd className="mt-1 break-words">{evaluation.ruleset_version}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Evaluation status</dt><dd className="mt-1">{evaluation.evaluation_status.replace(/_/g, " ")}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Evaluated</dt><dd className="mt-1"><time dateTime={evaluation.evaluated_at}>{formatCustomerTime(evaluation.evaluated_at)}</time></dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence schema</dt><dd className="mt-1">{evaluation.input.evidence_versions.journey_attribution_evidence ?? "Unsupported"}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Truncated</dt><dd className="mt-1">{evaluation.input.truncated ? "Yes" : "No"}</dd></div>
            <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Input digest</dt><dd className="mt-1 break-all font-mono text-xs">{evaluation.input.input_digest}</dd></div>
          </dl>
        </details>
      </section>
    </Section>
  );
}

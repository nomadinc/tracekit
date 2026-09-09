import { cleanText } from "./identity-normalization.ts";

export const RISK_SIGNALS_SCHEMA_VERSION = 1;
export const RISK_SIGNALS_RULESET_VERSION = "core-risk-signals-v1.0.0";

export type RiskSignalSeverity = "informational" | "low" | "medium" | "high";
export type RiskSignalConfidence = "deterministic" | "conditional" | "incomplete";
export type RiskEvaluationStatus = "complete" | "partial" | "not_evaluable";
export type RiskEvidenceReference = { evidence_type: "journey_attribution_identifier_group"; scope_id: string; schema_version: 1; stable_key: string };
export type JourneyRiskSignal = {
  id: string;
  signal_code: "journey_identifier_value_changed" | "multiple_affiliate_networks_observed";
  category: "identifier_integrity" | "affiliate_network_consistency";
  severity: RiskSignalSeverity;
  confidence: RiskSignalConfidence;
  observed_at: string | null;
  summary: string;
  explanation: string;
  assumptions: string[];
  evidence_refs: RiskEvidenceReference[];
  facts: Record<string, unknown>;
  operator_guidance: string;
};
export type JourneyRiskSignalsV1 = {
  schema_version: 1;
  ruleset_version: typeof RISK_SIGNALS_RULESET_VERSION;
  scope: { type: "journey"; id: string; workspace_id: string };
  evaluated_at: string;
  evaluation_status: RiskEvaluationStatus;
  input: { evidence_versions: { journey_attribution_evidence: number | null }; truncated: boolean; input_digest: string };
  signals: JourneyRiskSignal[];
};

type CanonicalIdentifier = {
  raw_param: string;
  provider: string;
  category: string;
  identifier_type: string;
  distinct_value_count: number;
  event_count: number;
  value_changed: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

function boundedText(value: unknown, max = 512) { return cleanText(value).slice(0, max); }
function boundedCount(value: unknown) { const count = Math.floor(Number(value)); return Number.isFinite(count) && count > 0 ? Math.min(count, 1_000_000) : 0; }
function isoOrNull(value: unknown) { const text = cleanText(value); const ms = Date.parse(text); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; }

function canonicalIdentifier(value: unknown): CanonicalIdentifier | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const rawParam = boundedText(row.raw_param, 256);
  if (!rawParam) return null;
  return {
    raw_param: rawParam,
    provider: boundedText(row.provider, 128) || "unknown",
    category: boundedText(row.category, 128) || "unknown",
    identifier_type: boundedText(row.identifier_type, 128) || "unknown",
    distinct_value_count: boundedCount(row.distinct_value_count),
    event_count: boundedCount(row.event_count),
    value_changed: row.value_changed === true,
    first_seen_at: isoOrNull(row.first_seen_at),
    last_seen_at: isoOrNull(row.last_seen_at),
  };
}

function identifierStableKey(identifier: CanonicalIdentifier) {
  return [identifier.raw_param, identifier.provider, identifier.category, identifier.identifier_type].map(encodeURIComponent).join("|");
}
function compareIdentifiers(a: CanonicalIdentifier, b: CanonicalIdentifier) { return identifierStableKey(a).localeCompare(identifierStableKey(b)); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function severityRank(severity: RiskSignalSeverity) { return ({ high: 0, medium: 1, low: 2, informational: 3 })[severity]; }

function truncationState(evidence: Record<string, any>) {
  const value = evidence.truncation && typeof evidence.truncation === "object" ? evidence.truncation : {};
  return {
    any: value.truncated === true,
    relevant: value.events === true || value.identifiers === true || value.distinct_values === true,
    events: value.events === true,
    identifiers: value.identifiers === true,
    distinct_values: value.distinct_values === true,
  };
}

export async function evaluateJourneyRiskSignals(input: { workspace_id: string; journey_id: string; attribution_evidence_v1: unknown; evaluated_at?: string }): Promise<JourneyRiskSignalsV1> {
  const workspaceId = boundedText(input.workspace_id, 256) || "default";
  const journeyId = boundedText(input.journey_id, 256);
  const evidence = input.attribution_evidence_v1 && typeof input.attribution_evidence_v1 === "object" && !Array.isArray(input.attribution_evidence_v1) ? input.attribution_evidence_v1 as Record<string, any> : null;
  const evidenceVersion = evidence ? Number(evidence.schema_version) : null;
  const supported = !evidence || evidenceVersion === 1;
  const identifiers = supported && Array.isArray(evidence?.identifiers) ? evidence.identifiers.map(canonicalIdentifier).filter((row): row is CanonicalIdentifier => Boolean(row)).sort(compareIdentifiers) : [];
  const truncation = evidence ? truncationState(evidence) : { any: false, relevant: false, events: false, identifiers: false, distinct_values: false };
  const evidenceEventCount = supported ? boundedCount(evidence?.evidence_event_count) : 0;

  // Explicit digest input: ruleset, evidence schema, sorted rule-relevant identifier
  // fields, event count, and relevant caps. It excludes evaluated_at, values, PII,
  // raw metadata, and unrelated journey response fields.
  const inputDigest = await sha256(JSON.stringify({
    ruleset_version: RISK_SIGNALS_RULESET_VERSION,
    evidence: {
      schema_version: supported ? evidenceVersion : null,
      identifiers,
      evidence_event_count: evidenceEventCount,
      truncation: { events: truncation.events, identifiers: truncation.identifiers, distinct_values: truncation.distinct_values },
    },
  }));
  const drafts: Array<Omit<JourneyRiskSignal, "id"> & { stable_identity: string }> = [];

  if (supported) {
    for (const identifier of identifiers) {
      if (!identifier.value_changed || identifier.distinct_value_count < 2) continue;
      const stableKey = identifierStableKey(identifier);
      const knownProvider = identifier.provider !== "unknown";
      const strongType = identifier.identifier_type === "transaction_id" || identifier.identifier_type === "click_id";
      drafts.push({
        stable_identity: stableKey,
        signal_code: "journey_identifier_value_changed",
        category: "identifier_integrity",
        severity: knownProvider && strongType && identifier.event_count >= 2 ? "medium" : "low",
        confidence: "deterministic",
        observed_at: identifier.last_seen_at,
        summary: "An attribution identifier changed during the journey.",
        explanation: "The same bounded identifier group contained at least two distinct values.",
        assumptions: ["Raw parameter, provider, category, and identifier type define one identifier group."],
        evidence_refs: [{ evidence_type: "journey_attribution_identifier_group", scope_id: journeyId, schema_version: 1, stable_key: stableKey }],
        facts: { raw_param: identifier.raw_param, provider: identifier.provider, category: identifier.category, identifier_type: identifier.identifier_type, distinct_value_count: identifier.distinct_value_count, event_count: identifier.event_count, first_seen_at: identifier.first_seen_at, last_seen_at: identifier.last_seen_at },
        operator_guidance: "Inspect the contributing events, timestamps, and source locations.",
      });
    }

    const affiliateGroups = identifiers.filter((identifier) => identifier.category === "affiliate_network" && identifier.provider !== "unknown");
    const providers = [...new Set(affiliateGroups.map((identifier) => identifier.provider))].sort();
    if (providers.length >= 2) {
      const references = affiliateGroups.map((identifier) => ({ evidence_type: "journey_attribution_identifier_group" as const, scope_id: journeyId, schema_version: 1 as const, stable_key: identifierStableKey(identifier) })).sort((a, b) => a.stable_key.localeCompare(b.stable_key));
      const observedTimes = affiliateGroups.map((identifier) => identifier.last_seen_at).filter((value): value is string => Boolean(value)).sort();
      drafts.push({
        stable_identity: references.map((reference) => reference.stable_key).join(","),
        signal_code: "multiple_affiliate_networks_observed",
        category: "affiliate_network_consistency",
        severity: "informational",
        confidence: "deterministic",
        observed_at: observedTimes[observedTimes.length - 1] || null,
        summary: "Identifiers from multiple affiliate networks were observed during the journey.",
        explanation: "Retained identifier evidence names at least two distinct known affiliate-network providers.",
        assumptions: ["Provider names and categories use the canonical Journey Attribution Evidence v1 registry."],
        evidence_refs: references,
        facts: { provider_count: providers.length, providers, evidence_event_count: evidenceEventCount },
        operator_guidance: "Inspect whether the networks represent forwarding, partner routing, or separate journey stages.",
      });
    }
  }

  const signals = await Promise.all(drafts.map(async ({ stable_identity, ...signal }) => ({
    ...signal,
    id: `risk_signal_${await sha256([workspaceId, "journey", journeyId, signal.signal_code, RISK_SIGNALS_RULESET_VERSION, stable_identity].join("\u0000"))}`,
  })));
  signals.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.signal_code.localeCompare(b.signal_code) || a.id.localeCompare(b.id));
  return {
    schema_version: RISK_SIGNALS_SCHEMA_VERSION,
    ruleset_version: RISK_SIGNALS_RULESET_VERSION,
    scope: { type: "journey", id: journeyId, workspace_id: workspaceId },
    evaluated_at: isoOrNull(input.evaluated_at) || new Date().toISOString(),
    evaluation_status: supported ? (truncation.relevant ? "partial" : "complete") : "not_evaluable",
    input: { evidence_versions: { journey_attribution_evidence: Number.isFinite(evidenceVersion) ? evidenceVersion : null }, truncated: truncation.any, input_digest: inputDigest },
    signals,
  };
}

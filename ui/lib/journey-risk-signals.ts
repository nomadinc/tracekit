export type JourneyRiskSeverity = "informational" | "low" | "medium" | "high";
export type JourneyRiskConfidence = "deterministic" | "conditional" | "incomplete";
export type JourneyRiskEvaluationStatus = "complete" | "partial" | "not_evaluable";

export type JourneyRiskEvidenceReference = {
  evidence_type: "journey_attribution_identifier_group";
  scope_id: string;
  schema_version: 1;
  stable_key: string;
};

type JourneyRiskSignalBase = {
  id: string;
  category: "identifier_integrity" | "affiliate_network_consistency";
  severity: JourneyRiskSeverity;
  confidence: JourneyRiskConfidence;
  observed_at: string | null;
  summary: string;
  explanation: string;
  assumptions: string[];
  evidence_refs: JourneyRiskEvidenceReference[];
  operator_guidance: string;
};

export type IdentifierValueChangedRiskSignal = JourneyRiskSignalBase & {
  signal_code: "journey_identifier_value_changed";
  category: "identifier_integrity";
  facts: {
    raw_param?: string;
    provider?: string;
    category?: string;
    identifier_type?: string;
    distinct_value_count?: number;
    event_count?: number;
    first_seen_at?: string | null;
    last_seen_at?: string | null;
  };
};

export type MultipleAffiliateNetworksRiskSignal = JourneyRiskSignalBase & {
  signal_code: "multiple_affiliate_networks_observed";
  category: "affiliate_network_consistency";
  facts: {
    provider_count?: number;
    providers?: string[];
    evidence_event_count?: number;
  };
};

export type JourneyRiskSignal = IdentifierValueChangedRiskSignal | MultipleAffiliateNetworksRiskSignal;

export type JourneyRiskSignalsV1 = {
  schema_version: 1;
  ruleset_version: "core-risk-signals-v1.0.0";
  scope: { type: "journey"; id: string; workspace_id: string };
  evaluated_at: string;
  evaluation_status: JourneyRiskEvaluationStatus;
  input: {
    evidence_versions: { journey_attribution_evidence: number | null };
    truncated: boolean;
    input_digest: string;
  };
  signals: JourneyRiskSignal[];
};

export type IdentifierEvidenceIdentity = {
  raw_param: string;
  provider: string;
  category: string;
  identifier_type: string;
};

export function identifierEvidenceStableKey(identifier: IdentifierEvidenceIdentity) {
  return [identifier.raw_param, identifier.provider, identifier.category, identifier.identifier_type]
    .map((value) => encodeURIComponent(value))
    .join("|");
}

export function identifierEvidenceDomIdFromStableKey(stableKey: string) {
  return `journey-attribution-identifier-${encodeURIComponent(stableKey)}`;
}

export function identifierEvidenceDomId(identifier: IdentifierEvidenceIdentity) {
  return identifierEvidenceDomIdFromStableKey(identifierEvidenceStableKey(identifier));
}

export const confidencePresentation: Record<JourneyRiskConfidence, { label: string; explanation: string }> = {
  deterministic: { label: "Deterministic", explanation: "This result follows directly from retained evidence under the current ruleset." },
  conditional: { label: "Conditional", explanation: "This result depends on stated assumptions or incomplete context." },
  incomplete: { label: "Incomplete", explanation: "Available evidence was insufficient for a complete evaluation." },
};

export function riskSignalTitle(code: JourneyRiskSignal["signal_code"]) {
  return code === "journey_identifier_value_changed" ? "Attribution identifier changed" : "Multiple affiliate networks observed";
}

export function riskSignalDescription(code: JourneyRiskSignal["signal_code"]) {
  return code === "journey_identifier_value_changed"
    ? "The same attribution identifier group was observed with more than one value during this journey."
    : "Identifiers from more than one known affiliate network appeared during this journey.";
}

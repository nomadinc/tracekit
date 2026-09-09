export type AttributionEvidenceProvider = {
  provider: string;
  category: string;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
};

export type AttributionEvidenceIdentifier = {
  raw_param: string;
  provider: string;
  category: string;
  identifier_type: string;
  first_seen_at: string;
  last_seen_at: string;
  first_value: string;
  latest_value: string;
  distinct_value_count: number;
  value_changed: boolean;
  first_source_location: string | null;
  latest_source_location: string | null;
  event_count: number;
};

export type AttributionEvidenceReferrers = {
  first_observed_client_referrer: string | null;
  latest_observed_client_referrer: string | null;
  first_external_origin: string | null;
  latest_external_origin: string | null;
  distinct_external_origins: string[];
  missing_observed: boolean;
  changed: boolean;
};

export type AttributionEvidenceTruncation = {
  truncated: boolean;
  events: boolean;
  identifiers: boolean;
  distinct_values: boolean;
  referrer_origins: boolean;
  flags: boolean;
};

export type JourneyAttributionEvidence = {
  schema_version: 1;
  providers: AttributionEvidenceProvider[];
  identifiers: AttributionEvidenceIdentifier[];
  referrers: AttributionEvidenceReferrers;
  flags: string[];
  identifier_count: number;
  evidence_event_count: number;
  truncation: AttributionEvidenceTruncation;
};

export type EventAttributionEvidence = {
  schema_version: 1;
  identifiers: Array<{
    raw_param: string;
    value: string;
    provider: string;
    category: string;
    identifier_type: string;
    source_location: string;
  }>;
  marketing_params: Array<{
    raw_param: string;
    value: string;
    provider: string;
    category: string;
    source_location: string;
  }>;
  referrer: { client: string | null; domain: string | null; origin: string | null; missing: boolean };
  flags: string[];
};

const providerNames: Record<string, string> = {
  everflow: "Everflow",
  meta: "Meta",
  google: "Google",
  tune: "TUNE",
  impact: "Impact",
  microsoft: "Microsoft",
  tiktok: "TikTok",
  unknown: "Unknown Tracker",
};

const categoryNames: Record<string, string> = {
  affiliate_network: "affiliate network",
  paid_media: "paid media",
  tracker: "tracker",
  unknown: "tracker",
};

const flagNames: Record<string, string> = {
  paid_media_and_affiliate_observed: "Paid media and affiliate identifiers observed",
  identifier_value_changed: "Identifier value changed during journey",
  multiple_affiliate_networks_observed: "Multiple affiliate networks observed",
  multiple_trackers_observed: "Multiple tracker identifiers observed",
  external_referrer_changed: "External referrer changed",
  referrer_missing_observed: "Referrer missing on one or more events",
};

export function providerLabel(provider: string) {
  return providerNames[provider.toLowerCase()] || provider.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function categoryLabel(category: string) {
  return categoryNames[category.toLowerCase()] || category.replace(/[_-]+/g, " ");
}

export function flagLabel(flag: string) {
  return flagNames[flag] || flag.replace(/[_-]+/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}

export function truncationLabels(truncation: AttributionEvidenceTruncation) {
  return ([
    ["events", "events"],
    ["identifiers", "identifier groups"],
    ["distinct_values", "distinct values"],
    ["referrer_origins", "referrer origins"],
    ["flags", "flags"],
  ] as const).filter(([key]) => truncation[key]).map(([, label]) => label);
}

export function eventAttributionEvidence(activity: unknown): EventAttributionEvidence | null {
  if (!activity || typeof activity !== "object") return null;
  const technical = (activity as { technical_evidence?: unknown }).technical_evidence;
  if (!technical || typeof technical !== "object") return null;
  const metadata = (technical as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const evidence = (metadata as { attribution_evidence_v1?: unknown }).attribution_evidence_v1;
  if (!evidence || typeof evidence !== "object" || (evidence as { schema_version?: unknown }).schema_version !== 1) return null;
  return evidence as EventAttributionEvidence;
}

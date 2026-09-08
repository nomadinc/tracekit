import { cleanText } from "./identity-normalization.ts";

export const JOURNEY_EVIDENCE_SCHEMA_VERSION = 1;
export const JOURNEY_EVIDENCE_MAX_EVENTS = 5000;
export const JOURNEY_EVIDENCE_MAX_IDENTIFIERS = 100;
export const JOURNEY_EVIDENCE_MAX_DISTINCT_VALUES = 20;
export const JOURNEY_EVIDENCE_MAX_REFERRER_ORIGINS = 20;
export const JOURNEY_EVIDENCE_MAX_FLAGS = 20;

export type JourneyEvidenceEvent = { id: string; event_time: string; metadata?: Record<string, any> | null };

function timestamp(value: unknown) {
  const text = cleanText(value);
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "1970-01-01T00:00:00.000Z";
}

function origin(value: unknown) {
  try { return new URL(cleanText(value)).origin; } catch { return null; }
}

export function aggregateJourneyAttributionEvidence(input: JourneyEvidenceEvent[], options: { source_truncated?: boolean } = {}) {
  const events = [...input].sort((a, b) => timestamp(a.event_time).localeCompare(timestamp(b.event_time)) || cleanText(a.id).localeCompare(cleanText(b.id)));
  const identifiers = new Map<string, any>();
  const providers = new Map<string, { provider: string; category: string; first_seen_at: string; last_seen_at: string; event_ids: Set<string> }>();
  const clients: Array<{ at: string; value: string }> = [];
  const externalOrigins: Array<{ at: string; value: string }> = [];
  const distinctExternalOrigins: string[] = [];
  const distinctExternalSet = new Set<string>();
  let missingObserved = false;
  let valuesTruncated = false;
  let originsTruncated = false;
  let identifiersTruncated = false;

  for (const event of events) {
    const at = timestamp(event.event_time);
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
    const evidence = metadata.attribution_evidence_v1;
    if (!evidence || Number(evidence.schema_version) !== 1) continue;
    const observations = [...(Array.isArray(evidence.identifiers) ? evidence.identifiers : []), ...(Array.isArray(evidence.marketing_params) ? evidence.marketing_params : [])];
    for (const observation of observations) {
      const provider = cleanText(observation?.provider) || "unknown";
      const category = cleanText(observation?.category) || "unknown";
      const providerKey = `${provider}\u0000${category}`;
      const providerState = providers.get(providerKey) || { provider, category, first_seen_at: at, last_seen_at: at, event_ids: new Set<string>() };
      providerState.last_seen_at = at;
      providerState.event_ids.add(cleanText(event.id));
      providers.set(providerKey, providerState);
    }
    for (const observation of Array.isArray(evidence.identifiers) ? evidence.identifiers : []) {
      const rawParam = cleanText(observation?.raw_param);
      const provider = cleanText(observation?.provider) || "unknown";
      const category = cleanText(observation?.category) || "unknown";
      const identifierType = cleanText(observation?.identifier_type) || "unknown";
      const value = cleanText(observation?.value);
      if (!rawParam || !value) continue;
      const key = `${rawParam}\u0000${provider}\u0000${category}\u0000${identifierType}`;
      let state = identifiers.get(key);
      if (!state) {
        if (identifiers.size >= JOURNEY_EVIDENCE_MAX_IDENTIFIERS) { identifiersTruncated = true; continue; }
        state = { raw_param: rawParam, provider, category, identifier_type: identifierType, first_seen_at: at, last_seen_at: at, first_value: value, latest_value: value, first_source_location: cleanText(observation?.source_location) || null, latest_source_location: cleanText(observation?.source_location) || null, event_ids: new Set<string>(), values: new Set<string>(), values_truncated: false };
        identifiers.set(key, state);
      }
      state.last_seen_at = at;
      state.latest_value = value;
      state.latest_source_location = cleanText(observation?.source_location) || null;
      state.event_ids.add(cleanText(event.id));
      if (state.values.size < JOURNEY_EVIDENCE_MAX_DISTINCT_VALUES || state.values.has(value)) state.values.add(value);
      else { state.values_truncated = true; valuesTruncated = true; }
    }
    const referrer = evidence.referrer && typeof evidence.referrer === "object" ? evidence.referrer : {};
    if (referrer.missing === true) missingObserved = true;
    const client = cleanText(referrer.client);
    if (client) clients.push({ at, value: client });
    const referrerOrigin = origin(referrer.origin || client);
    const pageOrigin = origin(metadata.page_url);
    if (referrerOrigin && (!pageOrigin || referrerOrigin !== pageOrigin)) {
      externalOrigins.push({ at, value: referrerOrigin });
      if (!distinctExternalSet.has(referrerOrigin)) {
        if (distinctExternalOrigins.length < JOURNEY_EVIDENCE_MAX_REFERRER_ORIGINS) { distinctExternalSet.add(referrerOrigin); distinctExternalOrigins.push(referrerOrigin); }
        else originsTruncated = true;
      }
    }
  }

  const identifierRows = [...identifiers.values()].map((state) => ({ raw_param: state.raw_param, provider: state.provider, category: state.category, identifier_type: state.identifier_type, first_seen_at: state.first_seen_at, last_seen_at: state.last_seen_at, first_value: state.first_value, latest_value: state.latest_value, distinct_value_count: state.values.size, value_changed: state.values.size > 1 || state.values_truncated, first_source_location: state.first_source_location, latest_source_location: state.latest_source_location, event_count: state.event_ids.size })).sort((a, b) => a.raw_param.localeCompare(b.raw_param) || a.provider.localeCompare(b.provider) || a.category.localeCompare(b.category) || a.identifier_type.localeCompare(b.identifier_type));
  const providerRows = [...providers.values()].map((state) => ({ provider: state.provider, category: state.category, first_seen_at: state.first_seen_at, last_seen_at: state.last_seen_at, event_count: state.event_ids.size })).sort((a, b) => a.provider.localeCompare(b.provider) || a.category.localeCompare(b.category));
  const flagSet = new Set<string>();
  if (identifierRows.some((row) => row.value_changed)) flagSet.add("identifier_value_changed");
  if (new Set(providerRows.filter((row) => row.category === "affiliate_network").map((row) => row.provider)).size > 1) flagSet.add("multiple_affiliate_networks_observed");
  if (new Set(identifierRows.filter((row) => row.category === "tracker").map((row) => `${row.provider}\u0000${row.raw_param}`)).size > 1) flagSet.add("multiple_trackers_observed");
  if (providerRows.some((row) => row.category === "paid_media") && providerRows.some((row) => row.category === "affiliate_network")) flagSet.add("paid_media_and_affiliate_observed");
  if (distinctExternalOrigins.length > 1 || originsTruncated) flagSet.add("external_referrer_changed");
  if (missingObserved) flagSet.add("referrer_missing_observed");
  const allFlags = [...flagSet].sort();
  const flagsTruncated = allFlags.length > JOURNEY_EVIDENCE_MAX_FLAGS;
  return {
    schema_version: JOURNEY_EVIDENCE_SCHEMA_VERSION,
    providers: providerRows,
    identifiers: identifierRows,
    referrers: { first_observed_client_referrer: clients[0]?.value || null, latest_observed_client_referrer: clients[clients.length - 1]?.value || null, first_external_origin: externalOrigins[0]?.value || null, latest_external_origin: externalOrigins[externalOrigins.length - 1]?.value || null, distinct_external_origins: distinctExternalOrigins, missing_observed: missingObserved, changed: distinctExternalOrigins.length > 1 || originsTruncated },
    flags: allFlags.slice(0, JOURNEY_EVIDENCE_MAX_FLAGS),
    identifier_count: identifierRows.length,
    evidence_event_count: events.filter((event) => event.metadata?.attribution_evidence_v1?.schema_version === 1).length,
    truncation: { truncated: Boolean(options.source_truncated || identifiersTruncated || valuesTruncated || originsTruncated || flagsTruncated), events: Boolean(options.source_truncated), identifiers: identifiersTruncated, distinct_values: valuesTruncated, referrer_origins: originsTruncated, flags: flagsTruncated },
  };
}

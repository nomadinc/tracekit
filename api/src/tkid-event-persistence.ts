import type { NormalizedTkidEvent } from "./tkid";

type PersistenceStage =
  | "read_evidence"
  | "read_event"
  | "journey"
  | "browser_session"
  | "checkout_session"
  | "evidence"
  | "event"
  | "state_conflict";

export class TkidEventPersistenceError extends Error {
  readonly stage: PersistenceStage;
  readonly safeCode: string;
  readonly requestId: string;
  constructor(stage: PersistenceStage, safeCode: string, requestId: string) {
    super("tkid_event_persistence_failed");
    this.stage = stage;
    this.safeCode = safeCode;
    this.requestId = requestId;
  }
}

function safeCode(error: unknown) {
  const value = String((error as { code?: unknown })?.code || "database_error");
  return /^[A-Za-z0-9_]{1,80}$/.test(value) ? value.toLowerCase() : "database_error";
}

function failure(stage: PersistenceStage, error: unknown, requestId: string): never {
  throw new TkidEventPersistenceError(stage, safeCode(error), requestId);
}

export function safeTkidPersistenceFailureEvidence(error: unknown) {
  if (error instanceof TkidEventPersistenceError) {
    return {
      action: "tkid.event_persistence_failed",
      persistence_stage: error.stage,
      error_code: error.safeCode,
      request_id: error.requestId,
    };
  }
  return {
    action: "tkid.event_persistence_failed",
    persistence_stage: "unknown",
    error_code: "unclassified_error",
    request_id: null,
  };
}

export function buildTkidEvidenceRow(input: {
  organizationId: string;
  sourceId: string;
  originId: string;
  observedOrigin: string;
  event: NormalizedTkidEvent;
  receivedAt: string;
}) {
  const event = input.event;
  return {
    organization_id: input.organizationId,
    source_id: input.sourceId,
    origin_id: input.originId,
    observed_origin: input.observedOrigin,
    event_id: event.event_id,
    evidence_hash: event.evidence_hash,
    schema_version: event.schema_version,
    bounded_payload: {
      event_id: event.event_id,
      event_name: event.event_name,
      schema_version: event.schema_version,
      occurred_at: event.occurred_at,
      journey_id: event.journey_id,
      browser_session_id: event.browser_session_id,
      checkout_session_id: event.checkout_session_id,
      privacy_mode: event.privacy_mode,
      funnel_step_id: event.funnel_step_id,
      offer_id: event.offer_id,
      offer_version_id: event.offer_version_id,
      cta_id: event.cta_id,
      cta_version: event.cta_version,
      price: event.price,
      terms_version: event.terms_version,
      disclosure_version: event.disclosure_version,
      affirmative_action: event.affirmative_action,
      displayed_descriptor: event.displayed_descriptor,
      descriptor_version: event.descriptor_version,
      milestone: event.milestone,
      duration_bucket: event.duration_bucket,
      action_type: event.action_type,
      error: event.error,
      app_version: event.app_version,
      page_id: event.page_id,
      received_at: event.received_at,
      normalizer_version: event.normalizer_version,
    },
    received_at: input.receivedAt,
  };
}

export function buildTkidEventRow(input: {
  organizationId: string;
  sourceId: string;
  originId: string;
  observedOrigin: string;
  evidenceId: string;
  event: NormalizedTkidEvent;
}) {
  const event = input.event;
  return {
    id: event.event_id,
    organization_id: input.organizationId,
    journey_id: event.journey_id,
    browser_session_id: event.browser_session_id,
    checkout_session_id: event.checkout_session_id || null,
    source_id: input.sourceId,
    evidence_id: input.evidenceId,
    event_name: event.event_name,
    schema_version: event.schema_version,
    normalizer_version: event.normalizer_version,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    funnel_step_id: event.funnel_step_id || null,
    offer_id: event.offer_id || null,
    offer_version_id: event.offer_version_id || null,
    cta_id: event.cta_id || null,
    cta_version: event.cta_version || null,
    price_amount: event.price?.amount || null,
    currency: event.price?.currency || null,
    billing_cadence: event.price?.billing_cadence || null,
    recurring: event.price?.recurring ?? null,
    trial_state: event.price?.trial_state || null,
    terms_version: event.terms_version || null,
    disclosure_version: event.disclosure_version || null,
    affirmative_action: event.affirmative_action ?? null,
    displayed_descriptor: event.displayed_descriptor || null,
    descriptor_version: event.descriptor_version || null,
    milestone: event.milestone || null,
    duration_bucket: event.duration_bucket || null,
    action_type: event.action_type || null,
    error_code: event.error?.code || null,
    error_category: event.error?.category || null,
    app_version: event.app_version || null,
    page_id: event.page_id || null,
    evidence_state: "observed",
    privacy_mode: event.privacy_mode,
    origin_id: input.originId,
    observed_origin: input.observedOrigin,
  };
}

type PersistInput = {
  db: any;
  source: any;
  origin: any;
  canonicalOrigin: string;
  event: NormalizedTkidEvent;
  receivedAt: string;
  requestId: string;
  afterEvidencePersisted?: () => void | Promise<void>;
};

function evidenceMatches(row: any, input: PersistInput) {
  const payload = row?.bounded_payload;
  return row?.organization_id === input.source.organization_id
    && row?.source_id === input.source.id
    && row?.origin_id === input.origin.id
    && row?.evidence_hash === input.event.evidence_hash
    && payload?.journey_id === input.event.journey_id
    && payload?.browser_session_id === input.event.browser_session_id;
}

function eventMatches(row: any, evidence: any, input: PersistInput) {
  return row?.id === input.event.event_id
    && row?.organization_id === input.source.organization_id
    && row?.source_id === input.source.id
    && row?.origin_id === input.origin.id
    && row?.journey_id === input.event.journey_id
    && row?.browser_session_id === input.event.browser_session_id
    && row?.evidence_id === evidence?.id;
}

async function readEvidence(input: PersistInput) {
  const { data, error } = await input.db.from("tkid_event_evidence")
    .select("id,organization_id,source_id,origin_id,event_id,evidence_hash,bounded_payload")
    .eq("organization_id", input.source.organization_id)
    .eq("event_id", input.event.event_id)
    .maybeSingle();
  if (error) failure("read_evidence", error, input.requestId);
  return data;
}

async function readEvent(input: PersistInput) {
  const { data, error } = await input.db.from("tkid_events")
    .select("id,organization_id,source_id,origin_id,journey_id,browser_session_id,evidence_id")
    .eq("id", input.event.event_id)
    .maybeSingle();
  if (error) failure("read_event", error, input.requestId);
  return data;
}

export async function persistTkidEvent(input: PersistInput): Promise<{ state: "persisted" | "resumed" | "duplicate"; evidenceId: string }> {
  // PostgREST cannot make the evidence and event inserts one database transaction.
  // Evidence is immutable, so an evidence-only interruption is a durable reservation
  // checkpoint: a same-identity retry validates and reuses it before inserting the
  // missing event. The proof claim RPC separately guarantees that retrying the event
  // identity cannot consume another unit of capacity.
  let evidence = await readEvidence(input);
  let existingEvent = await readEvent(input);

  if (evidence && !evidenceMatches(evidence, input)) failure("state_conflict", { code: "evidence_conflict" }, input.requestId);
  if (existingEvent && !evidence) failure("state_conflict", { code: "event_without_evidence" }, input.requestId);
  if (existingEvent && !eventMatches(existingEvent, evidence, input)) failure("state_conflict", { code: "event_evidence_conflict" }, input.requestId);
  if (existingEvent) return { state: "duplicate", evidenceId: evidence.id };

  const event = input.event;
  const expiresAt = new Date(Date.parse(event.occurred_at) + 2 * 60 * 60 * 1000).toISOString();
  const sessionExpires = new Date(Date.parse(event.occurred_at) + 30 * 60 * 1000).toISOString();
  const { error: journeyError } = await input.db.from("tkid_journeys").upsert({
    id: event.journey_id,
    account_id: input.source.account_id,
    organization_id: input.source.organization_id,
    business_context_id: input.source.business_context_id,
    source_id: input.source.id,
    started_origin_id: input.origin.id,
    started_origin: input.canonicalOrigin,
    started_at: event.occurred_at,
    expires_at: expiresAt,
    privacy_mode: event.privacy_mode,
    source_version: "tkid-sdk-v1",
    normalizer_version: event.normalizer_version,
  }, { onConflict: "organization_id,id", ignoreDuplicates: true });
  if (journeyError) failure("journey", journeyError, input.requestId);

  const { error: sessionError } = await input.db.from("tkid_browser_sessions").upsert({
    id: event.browser_session_id,
    organization_id: input.source.organization_id,
    journey_id: event.journey_id,
    source_id: input.source.id,
    started_at: event.occurred_at,
    last_seen_at: event.occurred_at,
    expires_at: sessionExpires,
  }, { onConflict: "organization_id,id", ignoreDuplicates: true });
  if (sessionError) failure("browser_session", sessionError, input.requestId);

  if (event.checkout_session_id) {
    const { error } = await input.db.from("tkid_checkout_sessions").upsert({
      id: event.checkout_session_id,
      organization_id: input.source.organization_id,
      journey_id: event.journey_id,
      browser_session_id: event.browser_session_id,
      source_id: input.source.id,
      started_at: event.occurred_at,
      state: event.event_name === "checkout_submitted" ? "submitted" : "started",
    }, { onConflict: "organization_id,id", ignoreDuplicates: true });
    if (error) failure("checkout_session", error, input.requestId);
  }

  const wasInterrupted = Boolean(evidence);
  if (!evidence) {
    const row = buildTkidEvidenceRow({
      organizationId: input.source.organization_id,
      sourceId: input.source.id,
      originId: input.origin.id,
      observedOrigin: input.canonicalOrigin,
      event,
      receivedAt: input.receivedAt,
    });
    const inserted = await input.db.from("tkid_event_evidence").insert(row).select("id,organization_id,source_id,origin_id,event_id,evidence_hash,bounded_payload").single();
    if (inserted.error) {
      if (String(inserted.error.code) !== "23505") failure("evidence", inserted.error, input.requestId);
      evidence = await readEvidence(input);
      if (!evidence || !evidenceMatches(evidence, input)) failure("state_conflict", { code: "evidence_conflict" }, input.requestId);
    } else evidence = inserted.data;
    await input.afterEvidencePersisted?.();
  }

  const eventRow = buildTkidEventRow({
    organizationId: input.source.organization_id,
    sourceId: input.source.id,
    originId: input.origin.id,
    observedOrigin: input.canonicalOrigin,
    evidenceId: evidence.id,
    event,
  });
  const insertedEvent = await input.db.from("tkid_events").insert(eventRow);
  if (insertedEvent.error) {
    if (String(insertedEvent.error.code) !== "23505") failure("event", insertedEvent.error, input.requestId);
    existingEvent = await readEvent(input);
    if (!existingEvent || !eventMatches(existingEvent, evidence, input)) failure("state_conflict", { code: "event_evidence_conflict" }, input.requestId);
    return { state: "duplicate", evidenceId: evidence.id };
  }
  return { state: wasInterrupted ? "resumed" : "persisted", evidenceId: evidence.id };
}

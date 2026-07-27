export const DOMAIN_EVENTS_STREAM_ROUTE = "/v1/events/stream";
export const DOMAIN_EVENTS_PROJECTION_REPLAY_ROUTE = "/v1/events/projections/replay";
export const DOMAIN_EVENTS_INTERNAL_RUN_ROUTE = "/v1/internal/events/projections/run";
export const DOMAIN_EVENTS_INTERNAL_REPLAY_ROUTE = "/v1/internal/events/projections/replay";
export const DOMAIN_EVENTS_INTERNAL_STATUS_ROUTE = "/v1/internal/events/projections/status";
export const DOMAIN_EVENTS_ENGINE_VERSION = "domain_events_v1";
export const DOMAIN_EVENTS_WORKSPACE_PROJECTOR = "workspace_live_projection_v1";
export const WORKSPACE_UPDATE_EVENT = "workspace.update";
export const DOMAIN_EVENTS_DEFAULT_REPLAY_LIMIT = 100;
export const DOMAIN_EVENTS_MAX_REPLAY_LIMIT = 250;
export const DOMAIN_EVENTS_DEFAULT_LEASE_MS = 120000;
export const DOMAIN_EVENTS_DEFAULT_POISON_THRESHOLD = 5;

export const REGISTERED_DOMAIN_EVENT_CONSUMERS = [
  DOMAIN_EVENTS_WORKSPACE_PROJECTOR,
] as const;

export type DomainEventSeverity = "info" | "success" | "warning" | "critical";
export type DomainEventActor = {
  type: "user" | "system" | "connector" | "api";
  id?: string;
  displayName?: string;
};
export type EntityReference = {
  type: string;
  id: string;
  displayName?: string;
  relationship?: string;
};
export type DomainEventInput = {
  workspaceId: string;
  type: string;
  version?: number;
  occurredAt?: string;
  actor?: DomainEventActor;
  subject: EntityReference;
  relatedEntities?: EntityReference[];
  source: {
    system: string;
    connectorId?: string;
    ingestionId?: string;
  };
  severity?: DomainEventSeverity;
  payload?: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  deduplicationKey?: string;
};

export type DomainEventRow = {
  event_position: number;
  id: string;
  workspace_id: string;
  type: string;
  version: number;
  occurred_at: string;
  recorded_at: string;
  actor: Record<string, any>;
  subject_type: string;
  subject_id: string;
  subject_display_name: string | null;
  subject: EntityReference;
  related_entities: EntityReference[];
  source: Record<string, any>;
  severity: DomainEventSeverity;
  payload: Record<string, any>;
  correlation_id: string | null;
  causation_id: string | null;
  trace_id: string | null;
  deduplication_key: string | null;
  created_at: string;
};

export type WorkspaceUpdateType =
  | "entity.changed"
  | "metric.changed"
  | "work_item.changed"
  | "notification.created"
  | "health.changed"
  | "activity.created"
  | "activity.updated";

export type WorkspaceUpdateRow = {
  update_position: number;
  id: string;
  workspace_id: string;
  domain_event_id: string | null;
  domain_event_position: number | null;
  type: WorkspaceUpdateType;
  occurred_at: string;
  entity_type: string | null;
  entity_id: string | null;
  changed_fields: string[];
  metric: Record<string, any> | null;
  activity_group_id: string | null;
  severity: DomainEventSeverity;
  payload: Record<string, any>;
  created_at: string;
};

export type ActivityGroupRow = {
  id: string;
  workspace_id: string;
  group_type: string;
  status: "active" | "completed" | "attention_required";
  correlation_id: string | null;
  primary_entity_type: string;
  primary_entity_id: string;
  primary_entity_display_name: string | null;
  related_entities: EntityReference[];
  first_occurred_at: string;
  last_occurred_at: string;
  severity: DomainEventSeverity;
  title: string;
  summary: string;
  event_count: number;
  action: Record<string, any> | null;
  requires_action: boolean;
  metadata: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

export type DomainEventRouteMatch =
  | { kind: "stream" }
  | { kind: "replay_projections" }
  | { kind: "internal_run_projections" }
  | { kind: "internal_replay_projections" }
  | { kind: "internal_projection_status" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export type DomainEventProjectionReplayResult = {
  ok: boolean;
  workspace_id: string;
  consumer_name: string;
  started_after_position: number;
  last_event_position: number;
  events_seen: number;
  events_projected: number;
  events_failed: number;
  failures: Array<{ event_id: string; event_position: number; type: string; message: string }>;
  has_more: boolean;
  locked?: boolean;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  poison_events?: number;
  metrics?: Record<string, unknown>;
};

export type DomainEventProjectionRunResult = {
  ok: boolean;
  workspaces_seen: number;
  consumers_seen: number;
  events_seen: number;
  events_projected: number;
  events_failed: number;
  has_more: boolean;
  results: DomainEventProjectionReplayResult[];
  duration_ms: number;
};

const DOMAIN_EVENT_SELECT = [
  "event_position",
  "id",
  "workspace_id",
  "type",
  "version",
  "occurred_at",
  "recorded_at",
  "actor",
  "subject_type",
  "subject_id",
  "subject_display_name",
  "subject",
  "related_entities",
  "source",
  "severity",
  "payload",
  "correlation_id",
  "causation_id",
  "trace_id",
  "deduplication_key",
  "created_at",
].join(",");

const WORKSPACE_UPDATE_SELECT = [
  "update_position",
  "id",
  "workspace_id",
  "domain_event_id",
  "domain_event_position",
  "type",
  "occurred_at",
  "entity_type",
  "entity_id",
  "changed_fields",
  "metric",
  "activity_group_id",
  "severity",
  "payload",
  "created_at",
].join(",");

const ACTIVITY_GROUP_SELECT = [
  "id",
  "workspace_id",
  "group_type",
  "status",
  "correlation_id",
  "primary_entity_type",
  "primary_entity_id",
  "primary_entity_display_name",
  "related_entities",
  "first_occurred_at",
  "last_occurred_at",
  "severity",
  "title",
  "summary",
  "event_count",
  "action",
  "requires_action",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const EVENT_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const PROHIBITED_KEY_RE = /(authorization|bearer|token|secret|password|credential|access[_-]?key|api[_-]?key|card|pan|cvv)/i;
const CONTACT_KEY_RE = /(email|phone|telephone|mobile)/i;
const VALID_SEVERITIES = new Set(["info", "success", "warning", "critical"]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function stableIdPart(value: unknown) {
  return text(value).replace(/[^a-zA-Z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function safeVersion(value: unknown) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function safeTime(value: unknown, fallback = new Date().toISOString()) {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

function normalizeConsumerName(value: unknown) {
  const candidate = text(value) || DOMAIN_EVENTS_WORKSPACE_PROJECTOR;
  return (REGISTERED_DOMAIN_EVENT_CONSUMERS as readonly string[]).includes(candidate)
    ? candidate
    : null;
}

export function isRegisteredDomainEventConsumer(value: unknown) {
  return Boolean(normalizeConsumerName(value));
}

function replayLimit(value: unknown) {
  return Math.max(1, Math.min(DOMAIN_EVENTS_MAX_REPLAY_LIMIT, Number(value || DOMAIN_EVENTS_DEFAULT_REPLAY_LIMIT) || DOMAIN_EVENTS_DEFAULT_REPLAY_LIMIT));
}

function safeErrorSummary(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown");
  return text(raw)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted:contact]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted:contact]")
    .replace(/(authorization|bearer|token|secret|password|credential|access[_-]?key|api[_-]?key|card|pan|cvv)[^,\s]*/gi, "$1:[redacted]")
    .slice(0, 1000) || "unknown";
}

function retryDelayMs(attempt: number) {
  const bounded = Math.max(1, Math.min(10, Number(attempt || 1)));
  return Math.min(3600000, 30000 * 2 ** (bounded - 1));
}

function addMs(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

function amountText(value: unknown) {
  const valueText = text(value);
  if (!valueText) return null;
  const n = Number(valueText);
  return Number.isFinite(n) ? valueText : null;
}

function entity(type: string, id: unknown, relationship?: string, displayName?: unknown): EntityReference | null {
  const normalizedId = text(id);
  if (!normalizedId) return null;
  return {
    type,
    id: normalizedId,
    displayName: text(displayName) || undefined,
    relationship,
  };
}

function compactEntities(...items: Array<EntityReference | null | undefined>) {
  return uniqueEntities(items.filter(Boolean) as EntityReference[]);
}

export function purchaseCorrelationId(args: { workspace_id?: unknown; platform?: unknown; purchase_id?: unknown; order_id?: unknown; conversion_event_id?: unknown }) {
  const platform = stableIdPart(args.platform || "tracekit").toLowerCase();
  const id = stableIdPart(args.purchase_id || args.order_id || args.conversion_event_id);
  return `purchase:${stableIdPart(args.workspace_id || "default")}:${platform}:${id}`;
}

export function buildPurchaseDomainEventsFromJourneyEvent(event: Record<string, any>): DomainEventInput[] {
  const workspaceId = text(event.workspace_id) || "default";
  const eventType = text(event.event_type).toLowerCase();
  if (eventType !== "purchase" && eventType !== "upsell" && eventType !== "subscription_started" && eventType !== "subscription_renewed") return [];
  const sourcePlatform = text(event.source_platform) || "journey_events";
  const sourceRecordId = text(event.source_record_id || event.id);
  const purchaseId = text(event.platform_order_id || sourceRecordId || event.id);
  if (!purchaseId) return [];
  const correlationId = purchaseCorrelationId({
    workspace_id: workspaceId,
    platform: sourcePlatform,
    purchase_id: purchaseId,
  });
  const relatedEntities = compactEntities(
    entity("journey_event", event.id, "source_event"),
    entity("journey", event.journey_id, "journey"),
    entity("person", event.person_id, "customer"),
    entity("platform_order", event.platform_order_id, "platform_order"),
  );
  const payload = {
    source_event_id: text(event.id) || null,
    source_platform: sourcePlatform,
    source_connector: text(event.source_connector) || null,
    source_record_id: sourceRecordId || null,
    platform_order_id: text(event.platform_order_id) || null,
    person_id: text(event.person_id) || null,
    journey_id: text(event.journey_id) || null,
    amount: amountText(event.amount),
    currency: text(event.currency).toUpperCase() || null,
    attribution_state: "pending",
    identity_state: text(event.person_id) ? "matched" : "anonymous",
    source_timestamp: safeTime(event.event_time || event.created_at),
  };
  const subject = {
    type: "purchase",
    id: purchaseId,
    displayName: text(event.platform_order_id || sourceRecordId) || `Purchase ${purchaseId}`,
  };
  return [
    {
      workspaceId,
      type: "purchase.received",
      occurredAt: safeTime(event.event_time || event.created_at),
      subject,
      relatedEntities,
      source: { system: "journey_events", connectorId: text(event.source_connector) || undefined },
      severity: "info",
      correlationId,
      deduplicationKey: `purchase.received:${workspaceId}:${sourcePlatform}:${purchaseId}`,
      payload,
    },
    {
      workspaceId,
      type: "purchase.completed",
      occurredAt: safeTime(event.event_time || event.created_at),
      subject,
      relatedEntities,
      source: { system: "journey_events", connectorId: text(event.source_connector) || undefined },
      severity: "success",
      correlationId,
      causationId: `purchase.received:${workspaceId}:${sourcePlatform}:${purchaseId}`,
      deduplicationKey: `purchase.completed:${workspaceId}:${sourcePlatform}:${purchaseId}:v1`,
      payload: {
        ...payload,
        completion_rule: "journey_event_purchase",
      },
    },
  ];
}

export function buildFinancialAdjustmentDomainEventFromJourneyEvent(event: Record<string, any>): DomainEventInput | null {
  const workspaceId = text(event.workspace_id) || "default";
  const eventType = text(event.event_type).toLowerCase();
  if (eventType !== "refund" && eventType !== "chargeback") return null;
  const sourcePlatform = text(event.source_platform) || "journey_events";
  const sourceRecordId = text(event.source_record_id || event.id);
  const purchaseId = text(event.platform_order_id || event.order_id || sourceRecordId || event.id);
  const adjustmentId = text(event.id || sourceRecordId || purchaseId);
  if (!adjustmentId) return null;
  const type = eventType === "refund" ? "refund.received" : "chargeback.received";
  const label = eventType === "refund" ? "Refund" : "Chargeback";
  return {
    workspaceId,
    type,
    occurredAt: safeTime(event.event_time || event.created_at),
    subject: {
      type: eventType,
      id: adjustmentId,
      displayName: `${label} ${text(event.platform_order_id || sourceRecordId || adjustmentId)}`,
    },
    relatedEntities: compactEntities(
      entity("purchase", purchaseId, "related_purchase"),
      entity("journey_event", event.id, "source_event"),
      entity("journey", event.journey_id, "journey"),
      entity("person", event.person_id, "customer"),
      entity("platform_order", event.platform_order_id, "platform_order"),
    ),
    source: { system: "journey_events", connectorId: text(event.source_connector) || undefined },
    severity: "warning",
    correlationId: purchaseCorrelationId({
      workspace_id: workspaceId,
      platform: sourcePlatform,
      purchase_id: purchaseId,
    }),
    deduplicationKey: `${type}:${workspaceId}:${sourcePlatform}:${sourceRecordId || adjustmentId}`,
    payload: {
      schema_version: 1,
      source_event_id: text(event.id) || null,
      source_platform: sourcePlatform,
      source_connector: text(event.source_connector) || null,
      source_record_id: sourceRecordId || null,
      purchase_id: purchaseId,
      platform_order_id: text(event.platform_order_id) || null,
      person_id: text(event.person_id) || null,
      journey_id: text(event.journey_id) || null,
      amount: amountText(event.amount),
      currency: text(event.currency).toUpperCase() || null,
      append_only: true,
      reason: text(event.reason || event.status) || eventType,
    },
  };
}

export function buildAttributionPendingDomainEventFromJourneyEvent(event: Record<string, any>): DomainEventInput | null {
  const workspaceId = text(event.workspace_id) || "default";
  const eventType = text(event.event_type).toLowerCase();
  if (eventType !== "purchase" && eventType !== "upsell" && eventType !== "subscription_started" && eventType !== "subscription_renewed") return null;
  const sourcePlatform = text(event.source_platform) || "journey_events";
  const sourceRecordId = text(event.source_record_id || event.id);
  const purchaseId = text(event.platform_order_id || sourceRecordId || event.id);
  if (!purchaseId) return null;
  return {
    workspaceId,
    type: "attribution.pending",
    occurredAt: safeTime(event.event_time || event.created_at),
    subject: {
      type: "attribution",
      id: `${purchaseId}:pending`,
      displayName: "Attribution pending",
    },
    relatedEntities: compactEntities(
      entity("purchase", purchaseId, "conversion"),
      entity("journey_event", event.id, "conversion_event"),
      entity("journey", event.journey_id, "journey"),
      entity("person", event.person_id, "customer"),
    ),
    source: { system: "attribution_engine" },
    severity: "info",
    correlationId: purchaseCorrelationId({
      workspace_id: workspaceId,
      platform: sourcePlatform,
      purchase_id: purchaseId,
    }),
    deduplicationKey: `attribution.pending:${workspaceId}:${sourcePlatform}:${purchaseId}`,
    payload: {
      conversion_event_id: text(event.id) || null,
      source_platform: sourcePlatform,
      source_record_id: sourceRecordId || null,
      purchase_id: purchaseId,
      person_id: text(event.person_id) || null,
      journey_id: text(event.journey_id) || null,
      reason: "purchase_retained",
    },
  };
}

export function buildAttributionDomainEvent(credit: Record<string, any>, args: { changed?: boolean } = {}): DomainEventInput {
  const workspaceId = text(credit.workspace_id) || "default";
  const conversionId = text(credit.conversion_event_id);
  const model = text(credit.model) || "unknown";
  const modelVersion = text(credit.model_version) || "v1";
  const touchpointId = text(credit.touchpoint_event_id) || "unattributed";
  const eventType = args.changed ? "attribution.changed" : "attribution.generated";
  return {
    workspaceId,
    type: eventType,
    occurredAt: safeTime(credit.calculated_at || credit.updated_at || credit.created_at),
    subject: {
      type: "attribution",
      id: `${conversionId || "conversion"}:${model}:${touchpointId}`,
      displayName: `${model.replace(/_/g, " ")} attribution`,
    },
    relatedEntities: compactEntities(
      entity("purchase", conversionId, "conversion"),
      entity("journey", credit.journey_id, "journey"),
      entity("person", credit.person_id, "customer"),
      entity("journey_event", credit.touchpoint_event_id, "winning_touchpoint"),
      entity("affiliate", credit.affiliate_id, "affiliate"),
    ),
    source: { system: "attribution_engine" },
    severity: credit.status === "attributed" ? "success" : "warning",
    correlationId: purchaseCorrelationId({ workspace_id: workspaceId, platform: "journey_events", conversion_event_id: conversionId }),
    deduplicationKey: `${eventType}:${workspaceId}:${conversionId}:${model}:${modelVersion}:${touchpointId}:${text(credit.status) || "unknown"}`,
    payload: {
      model,
      model_version: modelVersion,
      status: text(credit.status) || null,
      conversion_event_id: conversionId || null,
      touchpoint_event_id: text(credit.touchpoint_event_id) || null,
      affiliate_id: text(credit.affiliate_id) || null,
      credit_amount: amountText(credit.credit_amount),
      currency: text(credit.currency).toUpperCase() || null,
      reason: text(credit.reason) || null,
      changed: Boolean(args.changed),
    },
  };
}

export function buildIdentityOutcomeDomainEvent(result: Record<string, any>, args: {
  workspace_id?: unknown;
  source_platform?: unknown;
  source_record_type?: unknown;
  source_record_id?: unknown;
  connector_job_id?: unknown;
  occurred_at?: unknown;
}): DomainEventInput | null {
  const workspaceId = text(args.workspace_id) || "default";
  const sourceRecordId = text(args.source_record_id);
  const personId = text(result.person_id);
  const action = text(result.action);
  const reviewRequired = Boolean(result.review_required);
  const eventType = reviewRequired
    ? "identity.conflict_detected"
    : action === "created_person"
      ? "identity.created"
      : personId
        ? "identity.matched"
        : "";
  if (!eventType) return null;
  const subject = personId
    ? { type: "person", id: personId, displayName: `Person ${personId}` }
    : { type: text(args.source_record_type) || "source_record", id: sourceRecordId || "unknown", displayName: "Identity review" };
  return {
    workspaceId,
    type: eventType,
    occurredAt: safeTime(args.occurred_at),
    subject,
    relatedEntities: compactEntities(
      entity(text(args.source_record_type) || "source_record", sourceRecordId, "source_record"),
      entity("connector_job", args.connector_job_id, "connector_job"),
    ),
    source: {
      system: "identity_engine",
      connectorId: text(args.source_platform) || undefined,
      ingestionId: text(args.connector_job_id) || undefined,
    },
    severity: reviewRequired ? "warning" : action === "created_person" ? "success" : "info",
    correlationId: sourceRecordId ? `identity:${workspaceId}:${stableIdPart(args.source_platform || "source")}:${stableIdPart(sourceRecordId)}` : undefined,
    deduplicationKey: `${eventType}:${workspaceId}:${text(args.source_platform) || "source"}:${sourceRecordId || personId || "unknown"}:${personId || "review"}`,
    payload: {
      action,
      review_required: reviewRequired,
      person_id: personId || null,
      source_platform: text(args.source_platform) || null,
      source_record_type: text(args.source_record_type) || null,
      source_record_id: sourceRecordId || null,
      matched_identifier_count: Array.isArray(result.matched_identifiers) ? result.matched_identifiers.length : 0,
      attached_identifier_count: Array.isArray(result.attached_identifiers) ? result.attached_identifiers.length : 0,
      conflict_count: Array.isArray(result.conflicts) ? result.conflicts.length : 0,
      confidence: result.confidence ?? null,
      match_reason: text(result.match_reason) || null,
    },
  };
}

export function buildCommissionDomainEvent(commission: Record<string, any>, args: { event_type?: "commission.created" | "commission.adjusted" | "commission.reversed" | "commission.pending" } = {}): DomainEventInput {
  const workspaceId = text(commission.workspace_id) || "default";
  const commissionId = text(commission.commission_event_id || commission.id);
  const eventType = args.event_type || "commission.created";
  const conversionId = text(commission.conversion_event_id);
  return {
    workspaceId,
    type: eventType,
    occurredAt: safeTime(commission.generated_at || commission.updated_at || commission.created_at),
    subject: {
      type: "commission",
      id: commissionId,
      displayName: text(commission.affiliate_id) ? `Commission for ${commission.affiliate_id}` : "Commission",
    },
    relatedEntities: compactEntities(
      entity("purchase", conversionId, "conversion"),
      entity("attribution", commission.journey_attribution_credit_id, "attribution_credit"),
      entity("journey", commission.journey_id, "journey"),
      entity("person", commission.person_id, "customer"),
      entity("affiliate", commission.affiliate_id, "affiliate"),
      entity("publisher", commission.publisher_id, "publisher"),
    ),
    source: { system: "payout_engine" },
    severity: eventType === "commission.reversed" ? "warning" : "success",
    correlationId: purchaseCorrelationId({ workspace_id: workspaceId, platform: "journey_events", conversion_event_id: conversionId }),
    deduplicationKey: `${eventType}:${workspaceId}:${commissionId}`,
    payload: {
      commission_event_id: commissionId,
      conversion_event_id: conversionId || null,
      attribution_credit_id: text(commission.journey_attribution_credit_id) || null,
      affiliate_id: text(commission.affiliate_id) || null,
      publisher_id: text(commission.publisher_id) || null,
      model: text(commission.model) || null,
      model_version: text(commission.model_version) || null,
      status: text(commission.status) || null,
      credit_amount: amountText(commission.credit_amount),
      commission_rate: amountText(commission.commission_rate),
      commission_amount: amountText(commission.commission_amount),
      currency: text(commission.currency).toUpperCase() || null,
    },
  };
}

export function buildConnectorIncidentDomainEvent(args: {
  workspace_id?: unknown;
  connector_id?: unknown;
  connector_type?: unknown;
  incident_id?: unknown;
  status?: "failed" | "recovered";
  error_category?: unknown;
  safe_summary?: unknown;
  affected_record_count?: unknown;
  occurred_at?: unknown;
  source_system?: unknown;
  job_id?: unknown;
  task_id?: unknown;
}): DomainEventInput | null {
  const workspaceId = text(args.workspace_id) || "default";
  const connectorId = text(args.connector_id || args.connector_type);
  if (!connectorId) return null;
  const status = args.status === "recovered" ? "recovered" : "failed";
  const type = status === "recovered" ? "connector.recovered" : "connector.delivery_failed";
  const incidentId = text(args.incident_id) || `connector_incident:${workspaceId}:${connectorId}`;
  const occurredAt = safeTime(args.occurred_at);
  return {
    workspaceId,
    type,
    occurredAt,
    actor: { type: "system" },
    subject: {
      type: "connector",
      id: connectorId,
      displayName: connectorId,
    },
    relatedEntities: compactEntities(
      entity("connector_incident", incidentId, "incident"),
      entity("import_job", args.job_id, "related_job"),
      entity("connector_task", args.task_id, "related_task"),
    ),
    source: { system: text(args.source_system) || "connector_runtime", connectorId },
    severity: status === "recovered" ? "success" : "warning",
    correlationId: incidentId,
    deduplicationKey: `${type}:${workspaceId}:${connectorId}:${text(args.job_id || "")}:${text(args.task_id || "") || text(args.error_category || "incident")}`,
    payload: {
      schema_version: 1,
      incident_id: incidentId,
      connector_id: connectorId,
      connector_type: text(args.connector_type) || null,
      status,
      error_category: text(args.error_category) || null,
      safe_summary: safeErrorSummary(args.safe_summary),
      affected_record_count: Number(args.affected_record_count || 0) || 0,
      job_id: text(args.job_id) || null,
      task_id: text(args.task_id) || null,
    },
  };
}

export function buildReconciliationDomainEvent(args: {
  workspace_id?: unknown;
  type?: "reconciliation.matched" | "reconciliation.unmatched" | "reconciliation.discrepancy_detected" | "reconciliation.resolved";
  case_id?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  category?: unknown;
  status?: unknown;
  connector_id?: unknown;
  platform?: unknown;
  safe_summary?: unknown;
  occurred_at?: unknown;
  work_item_id?: unknown;
  expected_value?: unknown;
  observed_value?: unknown;
  currency?: unknown;
}): DomainEventInput | null {
  const workspaceId = text(args.workspace_id) || "default";
  const type = text(args.type || "reconciliation.matched") as DomainEventInput["type"];
  if (!type.startsWith("reconciliation.")) return null;
  const entityType = text(args.entity_type) || "order";
  const entityId = text(args.entity_id || args.case_id);
  if (!entityId) return null;
  const caseId = text(args.case_id) || `reconciliation:${workspaceId}:${entityType}:${entityId}:${text(args.category || type)}`;
  const resolved = type === "reconciliation.resolved" || type === "reconciliation.matched";
  return {
    workspaceId,
    type,
    occurredAt: safeTime(args.occurred_at),
    actor: { type: "system" },
    subject: {
      type: "reconciliation_case",
      id: caseId,
      displayName: text(args.safe_summary) || "Reconciliation case",
    },
    relatedEntities: compactEntities(
      entity(entityType, entityId, "affected_entity"),
      entity("connector", args.connector_id || args.platform, "related_connector"),
      entity("work_item", args.work_item_id, "related_work_item"),
    ),
    source: { system: "reconciliation", connectorId: text(args.connector_id || args.platform) || undefined },
    severity: resolved ? "success" : "warning",
    correlationId: caseId,
    deduplicationKey: `${type}:${workspaceId}:${caseId}:${text(args.status || "current")}`,
    payload: {
      schema_version: 1,
      reconciliation_case_id: caseId,
      entity_type: entityType,
      entity_id: entityId,
      discrepancy_category: text(args.category) || null,
      status: text(args.status) || null,
      connector_id: text(args.connector_id) || null,
      platform: text(args.platform) || null,
      safe_summary: safeErrorSummary(args.safe_summary),
      expected_value: text(args.expected_value) || null,
      observed_value: text(args.observed_value) || null,
      currency: text(args.currency).toUpperCase() || null,
      work_item_id: text(args.work_item_id) || null,
    },
  };
}

function uniqueEntities(entities: EntityReference[]) {
  const seen = new Set<string>();
  const out: EntityReference[] = [];
  for (const entity of entities) {
    const type = stableIdPart(entity.type).toLowerCase();
    const id = text(entity.id);
    if (!type || !id) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type,
      id,
      displayName: text(entity.displayName) || undefined,
      relationship: text(entity.relationship) || undefined,
    });
  }
  return out;
}

function ensureEntity(entity: EntityReference, label: string): EntityReference {
  const type = stableIdPart(entity?.type).toLowerCase();
  const id = text(entity?.id);
  if (!type || type === "unknown" || !id) {
    throw Object.assign(new Error(`${label} requires type and id.`), { code: "invalid_domain_event" });
  }
  return {
    type,
    id,
    displayName: text(entity.displayName) || undefined,
    relationship: text(entity.relationship) || undefined,
  };
}

function redactedValueForKey(key: string) {
  if (PROHIBITED_KEY_RE.test(key)) return "[redacted]";
  if (CONTACT_KEY_RE.test(key)) return "[redacted:contact]";
  return null;
}

export function redactDomainEventPayload(value: unknown, key = "", depth = 0): any {
  const redacted = redactedValueForKey(key);
  if (redacted !== null) return redacted;
  if (depth > 8) return "[redacted:max_depth]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactDomainEventPayload(item, key, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactDomainEventPayload(childValue, childKey, depth + 1);
    }
    return out;
  }
  return value;
}

export function normalizeDomainEventInput(input: DomainEventInput) {
  const workspaceId = text(input.workspaceId);
  if (!workspaceId) throw Object.assign(new Error("Domain event requires workspaceId."), { code: "invalid_domain_event" });
  const type = text(input.type).toLowerCase();
  if (!EVENT_TYPE_RE.test(type)) {
    throw Object.assign(new Error(`Invalid domain event type: ${input.type}`), { code: "invalid_domain_event" });
  }
  const subject = ensureEntity(input.subject, "Domain event subject");
  const sourceSystem = text(input.source?.system);
  if (!sourceSystem) throw Object.assign(new Error("Domain event source.system is required."), { code: "invalid_domain_event" });
  const severity = text(input.severity || "info").toLowerCase();
  if (!VALID_SEVERITIES.has(severity)) {
    throw Object.assign(new Error(`Invalid domain event severity: ${input.severity}`), { code: "invalid_domain_event" });
  }
  const occurredAt = safeTime(input.occurredAt);
  const payload = redactDomainEventPayload({
    schema_version: safeVersion((input.payload as any)?.schema_version || (input.payload as any)?.schemaVersion || 1),
    ...(input.payload || {}),
  });
  return {
    workspaceId,
    type,
    version: safeVersion(input.version),
    occurredAt,
    actor: redactDomainEventPayload(input.actor || { type: "system" }) as DomainEventActor,
    subject,
    relatedEntities: uniqueEntities(input.relatedEntities || []),
    source: redactDomainEventPayload({
      system: sourceSystem,
      connectorId: text(input.source?.connectorId) || undefined,
      ingestionId: text(input.source?.ingestionId) || undefined,
    }),
    severity: severity as DomainEventSeverity,
    payload,
    correlationId: text(input.correlationId) || null,
    causationId: text(input.causationId) || null,
    traceId: text(input.traceId) || null,
    deduplicationKey: text(input.deduplicationKey) || null,
  };
}

function isDuplicateError(error: any) {
  const textValue = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(textValue);
}

async function maybeSingle<T>(query: any, label: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message || JSON.stringify(error)}`);
  return (Array.isArray(data) ? data[0] : data) || null;
}

async function selectExistingDomainEvent(supabase: any, workspaceId: string, deduplicationKey: string) {
  return maybeSingle<DomainEventRow>(
    supabase
      .from("domain_events")
      .select(DOMAIN_EVENT_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("deduplication_key", deduplicationKey)
      .maybeSingle(),
    "Domain event duplicate lookup",
  );
}

export async function publishDomainEvent(supabase: any, input: DomainEventInput, options: { project_inline?: boolean } = {}) {
  const normalized = normalizeDomainEventInput(input);
  const row = {
    workspace_id: normalized.workspaceId,
    type: normalized.type,
    version: normalized.version,
    occurred_at: normalized.occurredAt,
    actor: normalized.actor,
    subject_type: normalized.subject.type,
    subject_id: normalized.subject.id,
    subject_display_name: normalized.subject.displayName || null,
    subject: normalized.subject,
    related_entities: normalized.relatedEntities,
    source: normalized.source,
    severity: normalized.severity,
    payload: normalized.payload,
    correlation_id: normalized.correlationId,
    causation_id: normalized.causationId,
    trace_id: normalized.traceId,
    deduplication_key: normalized.deduplicationKey,
  };

  let event: DomainEventRow | null = null;
  const inserted = await supabase.from("domain_events").insert(row).select(DOMAIN_EVENT_SELECT).maybeSingle();
  if (inserted.error) {
    if (normalized.deduplicationKey && isDuplicateError(inserted.error)) {
      event = await selectExistingDomainEvent(supabase, normalized.workspaceId, normalized.deduplicationKey);
      console.log("[TraceKit] duplicate domain event prevented", {
        workspace_id: normalized.workspaceId,
        type: normalized.type,
        deduplication_key: normalized.deduplicationKey,
      });
    } else {
      throw new Error(`Domain event publish failed: ${inserted.error.message || JSON.stringify(inserted.error)}`);
    }
  } else {
    event = (Array.isArray(inserted.data) ? inserted.data[0] : inserted.data) as DomainEventRow;
    console.log("[TraceKit] domain event published", {
      workspace_id: event.workspace_id,
      type: event.type,
      event_position: event.event_position,
    });
  }
  if (!event) throw new Error("Domain event publish did not return an event.");
  if (options.project_inline === false) {
    return {
      ok: true,
      event,
      cursor: event.event_position,
      workspace_updates: [],
      activity_group: null,
      projection_deferred: true,
    };
  }
  const projection = await projectDomainEvent(supabase, event).catch((error: any) => {
    console.error("[TraceKit] domain event projection failed", {
      workspace_id: event?.workspace_id,
      event_id: event?.id,
      type: event?.type,
      message: error?.message || String(error),
    });
    return { workspace_updates: [], activity_group: null, projection_error: error?.message || String(error) };
  });
  return {
    ok: true,
    event,
    cursor: event.event_position,
    ...projection,
  };
}

export async function publishDomainEventOutbox(supabase: any, input: DomainEventInput) {
  return publishDomainEvent(supabase, input, { project_inline: false });
}

function changedFieldsFromPayload(payload: Record<string, any>) {
  const raw = Array.isArray(payload.changed_fields) ? payload.changed_fields : Array.isArray(payload.changedFields) ? payload.changedFields : [];
  return raw.map((item) => text(item)).filter(Boolean).slice(0, 40);
}

function workspaceUpdateTypeForEvent(event: DomainEventRow): WorkspaceUpdateType {
  if (event.type.startsWith("work_item.")) return "work_item.changed";
  if (event.type === "notification.created") return "notification.created";
  if (event.type.startsWith("health.")) return "health.changed";
  if (event.type.startsWith("commission.") || event.type.startsWith("purchase.") || event.type.startsWith("refund.") || event.type.startsWith("chargeback.")) return "metric.changed";
  return "entity.changed";
}

function safeWorkspaceUpdatePayload(event: DomainEventRow, activityGroup: ActivityGroupRow | null) {
  return {
    schema_version: 1,
    domain_event_type: event.type,
    subject_display_name: event.subject_display_name || null,
    related_entities: uniqueEntities(event.related_entities || []),
    activity_title: activityGroup?.title || null,
    activity_summary: activityGroup?.summary || null,
    action: activityGroup?.action || null,
    source_system: text(event.source?.system) || "tracekit",
  };
}

function metricForEvent(event: DomainEventRow) {
  if (event.type.startsWith("work_item.")) return { key: "operations.work_items", invalidated: true };
  if (event.type.startsWith("health.")) return { key: "workspace.health", invalidated: true };
  if (event.type.startsWith("notification.")) return { key: "workspace.notifications", invalidated: true };
  if (event.type.startsWith("purchase.") || event.type.startsWith("refund.") || event.type.startsWith("chargeback.")) {
    return { key: "revenue", invalidated: true, currency: text(event.payload?.currency) || undefined };
  }
  if (event.type.startsWith("attribution.")) return { key: "attribution", invalidated: true };
  if (event.type.startsWith("commission.")) return { key: "commissions", invalidated: true, currency: text(event.payload?.currency) || undefined };
  return null;
}

async function upsertWorkspaceUpdate(supabase: any, row: Record<string, any>) {
  const result = await supabase
    .from("workspace_updates")
    .upsert(row, { onConflict: "id" })
    .select(WORKSPACE_UPDATE_SELECT)
    .maybeSingle();
  if (result.error) throw new Error(`Workspace update projection failed: ${result.error.message || JSON.stringify(result.error)}`);
  return (Array.isArray(result.data) ? result.data[0] : result.data) as WorkspaceUpdateRow;
}

function activityGroupKey(event: DomainEventRow) {
  return text(event.correlation_id) || `${event.subject_type}:${event.subject_id}`;
}

function activityGroupId(event: DomainEventRow) {
  return `activity_group:${stableIdPart(event.workspace_id)}:${stableIdPart(activityGroupKey(event)).slice(0, 360)}`;
}

function mergeEntityLists(existing: EntityReference[], next: EntityReference[]) {
  return uniqueEntities([...(existing || []), ...(next || [])]);
}

function severityRank(severity: string) {
  if (severity === "critical") return 4;
  if (severity === "warning") return 3;
  if (severity === "success") return 2;
  return 1;
}

function maxSeverity(a: DomainEventSeverity, b: DomainEventSeverity): DomainEventSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function narrativeForActivity(args: {
  event: DomainEventRow;
  eventTypes: string[];
  existing?: ActivityGroupRow | null;
  eventCount: number;
}) {
  const { event, eventTypes, eventCount } = args;
  const types = new Set(eventTypes);
  const subjectName = event.subject_display_name || `${event.subject_type} ${event.subject_id}`;

  if (types.has("purchase.completed") && types.has("attribution.generated") && types.has("commission.created")) {
    return {
      group_type: "purchase_flow",
      status: "completed" as const,
      title: `${subjectName} processed successfully`,
      summary: "Purchase, attribution, and commission processing completed successfully. No action is required.",
      requires_action: false,
      action: null,
    };
  }
  if (types.has("purchase.completed") && types.has("attribution.pending")) {
    return {
      group_type: "purchase_flow",
      status: "active" as const,
      title: `${subjectName} is waiting for attribution`,
      summary: "A purchase was received and is waiting for attribution. No action is required yet.",
      requires_action: false,
      action: null,
    };
  }
  if (types.has("connector.delivery_failed")) {
    return {
      group_type: "connector_failure",
      status: "attention_required" as const,
      title: "Connector delivery is failing",
      summary: eventCount > 1 ? `A connector failure is affecting ${eventCount} related event(s). Review the connector.` : "A connector failed to deliver data. Review the connector.",
      requires_action: true,
      action: { label: "Review connector", targetType: "connector", targetId: event.subject_id, route: "/settings/integrations" },
    };
  }
  if (types.has("identity.conflict_detected") || (types.has("work_item.created") && event.subject_type === "work_item")) {
    return {
      group_type: "identity_or_work_item_review",
      status: event.type === "work_item.resolved" ? "completed" as const : "attention_required" as const,
      title: event.type === "work_item.resolved" ? `${subjectName} resolved` : `${subjectName} requires review`,
      summary: event.type === "work_item.resolved" ? "The related Work Item was closed." : "TraceKit created or updated a Work Item for review.",
      requires_action: event.type !== "work_item.resolved",
      action: event.type === "work_item.resolved" ? null : { label: "Open Work Item", targetType: "work_item", targetId: event.subject_id, route: `/operations?work_item_id=${encodeURIComponent(event.subject_id)}` },
    };
  }
  if (types.has("reconciliation.discrepancy_detected") && (types.has("reconciliation.resolved") || types.has("work_item.resolved"))) {
    return {
      group_type: "reconciliation",
      status: "completed" as const,
      title: "Order discrepancy resolved",
      summary: "The discrepancy was resolved and the related workflow can be closed.",
      requires_action: false,
      action: null,
    };
  }
  return {
    group_type: event.subject_type,
    status: event.type.endsWith(".resolved") ? "completed" as const : "active" as const,
    title: subjectName,
    summary: `${event.type.replace(/\./g, " ")} recorded by TraceKit.`,
    requires_action: event.severity === "critical" || event.severity === "warning",
    action: event.subject_type === "work_item" ? { label: "Open Work Item", targetType: "work_item", targetId: event.subject_id, route: `/operations?work_item_id=${encodeURIComponent(event.subject_id)}` } : null,
  };
}

async function upsertActivityGroupForEvent(supabase: any, event: DomainEventRow) {
  const id = activityGroupId(event);
  const existing = await maybeSingle<ActivityGroupRow>(
    supabase.from("activity_groups").select(ACTIVITY_GROUP_SELECT).eq("workspace_id", event.workspace_id).eq("id", id).maybeSingle(),
    "Activity group lookup",
  );
  const existingLink = await maybeSingle<any>(
    supabase.from("activity_group_events").select("id").eq("activity_group_id", id).eq("domain_event_id", event.id).maybeSingle(),
    "Activity group event lookup",
  );
  if (existing && existingLink) {
    return {
      group: existing,
      created: Number(existing.event_count || 0) <= 1,
      activity_update_type: Number(existing.event_count || 0) <= 1 ? "activity.created" as const : "activity.updated" as const,
    };
  }
  const previousTypes = Array.isArray(existing?.metadata?.event_types) ? existing!.metadata.event_types.map((item: any) => text(item)).filter(Boolean) : [];
  const eventTypes = Array.from(new Set([...previousTypes, event.type]));
  const eventCount = existingLink ? Number(existing?.event_count || 1) : Number(existing?.event_count || 0) + 1;
  const narrative = narrativeForActivity({ event, eventTypes, existing, eventCount });
  const relatedEntities = mergeEntityLists(existing?.related_entities || [], [event.subject, ...(event.related_entities || [])]);
  const row = {
    id,
    workspace_id: event.workspace_id,
    group_type: narrative.group_type,
    status: narrative.status,
    correlation_id: event.correlation_id,
    primary_entity_type: existing?.primary_entity_type || event.subject_type,
    primary_entity_id: existing?.primary_entity_id || event.subject_id,
    primary_entity_display_name: existing?.primary_entity_display_name || event.subject_display_name || null,
    related_entities: relatedEntities,
    first_occurred_at: existing?.first_occurred_at || event.occurred_at,
    last_occurred_at: event.occurred_at,
    severity: maxSeverity(existing?.severity || event.severity, event.severity),
    title: narrative.title,
    summary: narrative.summary,
    event_count: eventCount,
    action: narrative.action,
    requires_action: narrative.requires_action,
    metadata: {
      ...(existing?.metadata || {}),
      schema_version: 1,
      event_types: eventTypes,
      updated_by_domain_event_id: event.id,
    },
    updated_at: new Date().toISOString(),
  };
  const upserted = await supabase.from("activity_groups").upsert(row, { onConflict: "id" }).select(ACTIVITY_GROUP_SELECT).maybeSingle();
  if (upserted.error) throw new Error(`Activity group projection failed: ${upserted.error.message || JSON.stringify(upserted.error)}`);
  if (!existingLink) {
    const link = await supabase.from("activity_group_events").insert({
      workspace_id: event.workspace_id,
      activity_group_id: id,
      domain_event_id: event.id,
      domain_event_position: event.event_position,
    });
    if (link.error && !isDuplicateError(link.error)) throw new Error(`Activity group link failed: ${link.error.message || JSON.stringify(link.error)}`);
  }
  return {
    group: (Array.isArray(upserted.data) ? upserted.data[0] : upserted.data) as ActivityGroupRow,
    created: !existing,
    activity_update_type: !existing ? "activity.created" as const : "activity.updated" as const,
  };
}

export async function projectDomainEvent(supabase: any, event: DomainEventRow) {
  const activity = await upsertActivityGroupForEvent(supabase, event);
  const updates: WorkspaceUpdateRow[] = [];
  const updateType = workspaceUpdateTypeForEvent(event);
  updates.push(await upsertWorkspaceUpdate(supabase, {
    id: `workspace_update:${event.id}:${updateType}`,
    workspace_id: event.workspace_id,
    domain_event_id: event.id,
    domain_event_position: event.event_position,
    type: updateType,
    occurred_at: event.occurred_at,
    entity_type: event.subject_type,
    entity_id: event.subject_id,
    changed_fields: changedFieldsFromPayload(event.payload),
    metric: metricForEvent(event),
    activity_group_id: activity.group.id,
    severity: event.severity,
    payload: safeWorkspaceUpdatePayload(event, activity.group),
  }));
  updates.push(await upsertWorkspaceUpdate(supabase, {
    id: `workspace_update:${event.id}:${activity.activity_update_type}`,
    workspace_id: event.workspace_id,
    domain_event_id: event.id,
    domain_event_position: event.event_position,
    type: activity.activity_update_type,
    occurred_at: event.occurred_at,
    entity_type: activity.group.primary_entity_type,
    entity_id: activity.group.primary_entity_id,
    changed_fields: ["activity_group"],
    metric: null,
    activity_group_id: activity.group.id,
    severity: activity.group.severity,
    payload: {
      schema_version: 1,
      title: activity.group.title,
      summary: activity.group.summary,
      status: activity.group.status,
      requires_action: activity.group.requires_action,
      action: activity.group.action,
    },
  }));
  console.log("[TraceKit] domain event projected", {
    workspace_id: event.workspace_id,
    event_id: event.id,
    updates: updates.length,
    activity_group_id: activity.group.id,
  });
  return { workspace_updates: updates, activity_group: activity.group };
}

async function readDomainEventConsumerState(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
}) {
  return maybeSingle<any>(
    supabase
      .from("domain_event_consumer_state")
      .select("consumer_name,workspace_id,last_event_position,last_processed_at,last_error,updated_at,lease_owner,lease_expires_at,last_run_at,last_successful_run_at,last_failed_at,consecutive_failures,metadata")
      .eq("workspace_id", args.workspace_id)
      .eq("consumer_name", args.consumer_name)
      .maybeSingle(),
    "Domain event consumer state lookup",
  );
}

async function claimDomainEventConsumer(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
  runner_id?: string | null;
  lease_ms?: number | null;
}) {
  const runnerId = text(args.runner_id) || `runner:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  const leaseMs = Math.max(10000, Math.min(900000, Number(args.lease_ms || DOMAIN_EVENTS_DEFAULT_LEASE_MS) || DOMAIN_EVENTS_DEFAULT_LEASE_MS));
  const now = nowIso();
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
  if (typeof supabase.rpc === "function") {
    const { data, error } = await supabase.rpc("claim_domain_event_consumer", {
      p_workspace_id: args.workspace_id,
      p_consumer_name: args.consumer_name,
      p_runner_id: runnerId,
      p_lease_expires_at: leaseExpiresAt,
      p_now: now,
    });
    if (error) throw new Error(`Domain event consumer claim failed: ${error.message || JSON.stringify(error)}`);
    const row = Array.isArray(data) ? data[0] : data;
    return { claimed: Boolean(row?.claimed), state: row || null, runner_id: runnerId, lease_expires_at: leaseExpiresAt };
  }

  const state = await readDomainEventConsumerState(supabase, args);
  const existingLease = Date.parse(text(state?.lease_expires_at));
  const activeLease = text(state?.lease_owner) && Number.isFinite(existingLease) && existingLease > Date.now() && text(state?.lease_owner) !== runnerId;
  if (activeLease) return { claimed: false, state, runner_id: runnerId, lease_expires_at: state?.lease_expires_at || null };
  const result = await supabase
    .from("domain_event_consumer_state")
    .upsert({
      consumer_name: args.consumer_name,
      workspace_id: args.workspace_id,
      last_event_position: Math.max(0, Number(state?.last_event_position || 0)),
      last_processed_at: state?.last_processed_at || null,
      last_error: state?.last_error || null,
      lease_owner: runnerId,
      lease_expires_at: leaseExpiresAt,
      last_run_at: now,
      updated_at: now,
      consecutive_failures: Number(state?.consecutive_failures || 0),
      metadata: state?.metadata || {},
    }, { onConflict: "consumer_name,workspace_id" })
    .select("consumer_name,workspace_id,last_event_position,last_processed_at,last_error,updated_at,lease_owner,lease_expires_at,last_run_at,last_successful_run_at,last_failed_at,consecutive_failures,metadata")
    .maybeSingle();
  if (result.error) throw new Error(`Domain event consumer claim failed: ${result.error.message || JSON.stringify(result.error)}`);
  return { claimed: true, state: result.data || null, runner_id: runnerId, lease_expires_at: leaseExpiresAt };
}

async function writeDomainEventConsumerState(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
  last_event_position: number;
  last_error?: string | null;
  runner_id?: string | null;
  release_lease?: boolean;
  success?: boolean;
}) {
  const now = nowIso();
  const row: Record<string, any> = {
    consumer_name: args.consumer_name,
    workspace_id: args.workspace_id,
    last_event_position: Math.max(0, Number(args.last_event_position || 0)),
    last_processed_at: now,
    last_error: args.last_error || null,
    updated_at: now,
  };
  if (!args.last_error) row.consecutive_failures = 0;
  if (args.success) row.last_successful_run_at = now;
  if (args.last_error) row.last_failed_at = now;
  if (args.release_lease) {
    row.lease_owner = null;
    row.lease_expires_at = null;
  }
  const result = await supabase
    .from("domain_event_consumer_state")
    .upsert(row, { onConflict: "consumer_name,workspace_id" })
    .select("consumer_name,workspace_id,last_event_position,last_processed_at,last_error,updated_at,lease_owner,lease_expires_at,last_run_at,last_successful_run_at,last_failed_at,consecutive_failures,metadata")
    .maybeSingle();
  if (result.error) throw new Error(`Domain event consumer state update failed: ${result.error.message || JSON.stringify(result.error)}`);
  return result.data || null;
}

async function recordProjectionFailure(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
  event: DomainEventRow;
  error: unknown;
  poison_threshold?: number;
}) {
  const now = nowIso();
  let lookup = supabase
    .from("domain_event_projection_failures")
    .select("id,attempt_count,status,first_failed_at")
    .eq("workspace_id", args.workspace_id)
    .eq("consumer_name", args.consumer_name)
    .eq("event_id", args.event.id);
  if (typeof lookup.in === "function") lookup = lookup.in("status", ["open", "retrying", "poison"]);
  const existing = await maybeSingle<any>(
    lookup.maybeSingle(),
    "Domain event projection failure lookup",
  ).catch(() => null);
  const attempt = Number(existing?.attempt_count || 0) + 1;
  const threshold = Math.max(1, Number(args.poison_threshold || DOMAIN_EVENTS_DEFAULT_POISON_THRESHOLD) || DOMAIN_EVENTS_DEFAULT_POISON_THRESHOLD);
  const status = attempt >= threshold ? "poison" : "retrying";
  const row = {
    id: existing?.id || undefined,
    workspace_id: args.workspace_id,
    consumer_name: args.consumer_name,
    event_id: args.event.id,
    event_position: Number(args.event.event_position),
    attempt_count: attempt,
    first_failed_at: existing?.first_failed_at || now,
    last_failed_at: now,
    next_retry_at: status === "poison" ? null : addMs(retryDelayMs(attempt)),
    status,
    error_code: "projection_failed",
    safe_error_summary: safeErrorSummary(args.error),
    updated_at: now,
  };
  const result = await supabase
    .from("domain_event_projection_failures")
    .upsert(row, { onConflict: "id" })
    .select("id,workspace_id,consumer_name,event_id,event_position,attempt_count,status,safe_error_summary,next_retry_at")
    .maybeSingle();
  if (result.error) throw new Error(`Domain event projection failure update failed: ${result.error.message || JSON.stringify(result.error)}`);
  return result.data || row;
}

async function resolveProjectionFailure(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
  event: DomainEventRow;
}) {
  const existing = await maybeSingle<any>(
    supabase
      .from("domain_event_projection_failures")
      .select("id,status")
      .eq("workspace_id", args.workspace_id)
      .eq("consumer_name", args.consumer_name)
      .eq("event_id", args.event.id)
      .maybeSingle(),
    "Domain event projection failure lookup",
  ).catch(() => null);
  if (!existing || existing.status === "resolved") return null;
  const result = await supabase
    .from("domain_event_projection_failures")
    .upsert({
      ...existing,
      status: "resolved",
      resolved_at: nowIso(),
      resolution_note: "Projection replay succeeded.",
      updated_at: nowIso(),
    }, { onConflict: "id" })
    .select("id,status,resolved_at")
    .maybeSingle();
  if (result.error) throw new Error(`Domain event projection failure resolution failed: ${result.error.message || JSON.stringify(result.error)}`);
  return result.data || null;
}

export async function projectDomainEventsBatch(supabase: any, args: {
  workspace_id?: string | null;
  consumer_name?: string | null;
  from_position?: number | string | null;
  limit?: number;
  continue_on_error?: boolean;
  allow_rewind?: boolean;
  runner_id?: string | null;
  lease_ms?: number | null;
  poison_threshold?: number | null;
} = {}): Promise<DomainEventProjectionReplayResult> {
  const workspaceId = text(args.workspace_id) || "default";
  const consumerName = normalizeConsumerName(args.consumer_name);
  if (!consumerName) {
    const error: any = new Error("Unknown domain event consumer.");
    error.code = "invalid_consumer_name";
    error.status = 400;
    throw error;
  }
  const limit = replayLimit(args.limit);
  const claim = await claimDomainEventConsumer(supabase, {
    workspace_id: workspaceId,
    consumer_name: consumerName,
    runner_id: args.runner_id,
    lease_ms: args.lease_ms,
  });
  if (!claim.claimed) {
    const cursor = Math.max(0, Number(claim.state?.last_event_position || 0));
    return {
      ok: false,
      workspace_id: workspaceId,
      consumer_name: consumerName,
      started_after_position: cursor,
      last_event_position: cursor,
      events_seen: 0,
      events_projected: 0,
      events_failed: 0,
      failures: [],
      has_more: true,
      locked: true,
      lease_owner: text(claim.state?.lease_owner) || null,
      lease_expires_at: text(claim.state?.lease_expires_at) || null,
    };
  }
  const state = claim.state || await readDomainEventConsumerState(supabase, { workspace_id: workspaceId, consumer_name: consumerName });
  const explicitPosition = args.from_position === undefined || args.from_position === null || text(args.from_position) === ""
    ? null
    : parseWorkspaceUpdateCursor(args.from_position);
  const persistedPosition = Math.max(0, Number(state?.last_event_position || 0));
  if (explicitPosition !== null && explicitPosition < persistedPosition && !args.allow_rewind) {
    await writeDomainEventConsumerState(supabase, {
      workspace_id: workspaceId,
      consumer_name: consumerName,
      last_event_position: persistedPosition,
      release_lease: true,
      runner_id: claim.runner_id,
    });
    const error: any = new Error("Rewinding a domain event consumer requires privileged repair replay.");
    error.code = "replay_rewind_forbidden";
    error.status = 403;
    throw error;
  }
  const startedAfterPosition = explicitPosition ?? persistedPosition;
  const { data, error } = await supabase
    .from("domain_events")
    .select(DOMAIN_EVENT_SELECT)
    .eq("workspace_id", workspaceId)
    .gt("event_position", startedAfterPosition)
    .order("event_position", { ascending: true })
    .limit(limit + 1);
  if (error) throw new Error(`Domain event projection replay scan failed: ${error.message || JSON.stringify(error)}`);
  const rows = ((data || []) as DomainEventRow[]).slice(0, limit);
  const hasMore = (data || []).length > limit;
  let lastEventPosition = startedAfterPosition;
  let eventsProjected = 0;
  let poisonEvents = 0;
  const started = Date.now();
  const failures: DomainEventProjectionReplayResult["failures"] = [];
  try {
    for (const event of rows) {
      try {
        await projectDomainEvent(supabase, event);
        await resolveProjectionFailure(supabase, { workspace_id: workspaceId, consumer_name: consumerName, event }).catch(() => null);
        if (failures.length === 0) lastEventPosition = Number(event.event_position);
        eventsProjected += 1;
        await writeDomainEventConsumerState(supabase, {
          workspace_id: workspaceId,
          consumer_name: consumerName,
          last_event_position: lastEventPosition,
          last_error: failures.length ? JSON.stringify({ projector_error: "Earlier events failed in this run.", failed_count: failures.length }) : null,
          runner_id: claim.runner_id,
          success: failures.length === 0,
        });
      } catch (error: any) {
        const failureRecord = await recordProjectionFailure(supabase, {
          workspace_id: workspaceId,
          consumer_name: consumerName,
          event,
          error,
          poison_threshold: Number(args.poison_threshold || DOMAIN_EVENTS_DEFAULT_POISON_THRESHOLD),
        });
        if (failureRecord?.status === "poison") poisonEvents += 1;
        const failure = {
          event_id: event.id,
          event_position: Number(event.event_position),
          type: event.type,
          message: safeErrorSummary(error),
        };
        failures.push(failure);
        const lastError = JSON.stringify({
          projector_error: failure.message,
          event_id: failure.event_id,
          event_position: failure.event_position,
          type: failure.type,
          failure_id: failureRecord?.id || null,
          failure_status: failureRecord?.status || null,
        });
        await writeDomainEventConsumerState(supabase, {
          workspace_id: workspaceId,
          consumer_name: consumerName,
          last_event_position: lastEventPosition,
          last_error: lastError,
          runner_id: claim.runner_id,
        });
        if (!args.continue_on_error) break;
      }
    }
  } finally {
    await writeDomainEventConsumerState(supabase, {
      workspace_id: workspaceId,
      consumer_name: consumerName,
      last_event_position: lastEventPosition,
      last_error: failures.length ? JSON.stringify({ projector_error: "Projection replay completed with failures.", failed_count: failures.length }) : null,
      release_lease: true,
      runner_id: claim.runner_id,
      success: failures.length === 0,
    });
  }
  return {
    ok: failures.length === 0,
    workspace_id: workspaceId,
    consumer_name: consumerName,
    started_after_position: startedAfterPosition,
    last_event_position: lastEventPosition,
    events_seen: rows.length,
    events_projected: eventsProjected,
    events_failed: failures.length,
    failures,
    has_more: hasMore,
    poison_events: poisonEvents,
    metrics: {
      cursor_model: "last_successful_contiguous",
      duration_ms: Date.now() - started,
      projection_attempts: rows.length,
      projection_successes: eventsProjected,
      projection_failures: failures.length,
      lease_owner: claim.runner_id,
    },
  };
}

async function listDomainEventWorkspaces(supabase: any, limit: number) {
  const { data, error } = await supabase
    .from("domain_events")
    .select("workspace_id,event_position")
    .order("event_position", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit * 50)));
  if (error) throw new Error(`Domain event workspace scan failed: ${error.message || JSON.stringify(error)}`);
  return Array.from(new Set(((data || []) as any[]).map((row) => text(row.workspace_id)).filter(Boolean))).slice(0, limit);
}

export async function runScheduledDomainEventProjectionReplay(supabase: any, args: {
  workspaces?: string[];
  batch_size?: number;
  max_workspaces?: number;
  max_events?: number;
  runner_id?: string | null;
} = {}): Promise<DomainEventProjectionRunResult> {
  const started = Date.now();
  const maxWorkspaces = Math.max(1, Math.min(50, Number(args.max_workspaces || 10) || 10));
  const maxEvents = Math.max(1, Math.min(1000, Number(args.max_events || 250) || 250));
  const batchSize = Math.max(1, Math.min(replayLimit(args.batch_size), maxEvents));
  const requestedWorkspaces = (args.workspaces || []).map((item) => text(item)).filter(Boolean).slice(0, maxWorkspaces);
  const workspaceIds = requestedWorkspaces.length ? requestedWorkspaces : await listDomainEventWorkspaces(supabase, maxWorkspaces);
  const results: DomainEventProjectionReplayResult[] = [];
  let remaining = maxEvents;
  const runnerId = text(args.runner_id) || `scheduled:${nowIso()}`;
  for (const workspaceId of workspaceIds) {
    for (const consumerName of REGISTERED_DOMAIN_EVENT_CONSUMERS) {
      if (remaining <= 0) break;
      const result = await projectDomainEventsBatch(supabase, {
        workspace_id: workspaceId,
        consumer_name: consumerName,
        limit: Math.min(batchSize, remaining),
        continue_on_error: true,
        runner_id: `${runnerId}:${workspaceId}:${consumerName}`,
      });
      results.push(result);
      remaining -= result.events_seen;
    }
  }
  return {
    ok: results.every((result) => result.ok || result.locked),
    workspaces_seen: workspaceIds.length,
    consumers_seen: results.length,
    events_seen: results.reduce((sum, result) => sum + result.events_seen, 0),
    events_projected: results.reduce((sum, result) => sum + result.events_projected, 0),
    events_failed: results.reduce((sum, result) => sum + result.events_failed, 0),
    has_more: results.some((result) => result.has_more),
    results,
    duration_ms: Date.now() - started,
  };
}

export async function getDomainEventProjectionStatus(supabase: any, args: {
  workspace_id?: string | null;
  consumer_name?: string | null;
  limit?: number;
} = {}) {
  const workspaceId = text(args.workspace_id) || "default";
  const consumerName = normalizeConsumerName(args.consumer_name);
  const consumers = consumerName ? [consumerName] : [...REGISTERED_DOMAIN_EVENT_CONSUMERS];
  const rows: any[] = [];
  for (const consumer of consumers) {
    const state = await readDomainEventConsumerState(supabase, { workspace_id: workspaceId, consumer_name: consumer }).catch(() => null);
    const lastPosition = Math.max(0, Number(state?.last_event_position || 0));
    const pending = await maybeSingle<any>(
      supabase
        .from("domain_events")
        .select("event_position,recorded_at")
        .eq("workspace_id", workspaceId)
        .gt("event_position", lastPosition)
        .order("event_position", { ascending: true })
        .limit(1)
        .maybeSingle(),
      "Domain event oldest pending lookup",
    ).catch(() => null);
    const failures = await supabase
      .from("domain_event_projection_failures")
      .select("id,event_id,event_position,attempt_count,status,safe_error_summary,last_failed_at,next_retry_at")
      .eq("workspace_id", workspaceId)
      .eq("consumer_name", consumer)
      .order("last_failed_at", { ascending: false })
      .limit(Math.max(1, Math.min(50, Number(args.limit || 10) || 10)));
    const activeFailures = ((failures.data || []) as any[]).filter((failure) => failure.status !== "resolved");
    rows.push({
      consumer_name: consumer,
      workspace_id: workspaceId,
      last_event_position: lastPosition,
      oldest_pending_event_position: pending?.event_position || null,
      oldest_pending_event_age_ms: pending?.recorded_at ? Math.max(0, Date.now() - Date.parse(pending.recorded_at)) : null,
      active_failure_count: activeFailures.length,
      failures: activeFailures,
      last_successful_run_at: state?.last_successful_run_at || null,
      last_run_at: state?.last_run_at || null,
      lease_owner: state?.lease_owner || null,
      lease_expires_at: state?.lease_expires_at || null,
      cursor_model: "last_successful_contiguous",
    });
  }
  return { ok: true, workspace_id: workspaceId, consumers: rows };
}

export async function auditDomainEventProjectionReplay(supabase: any, args: {
  workspace_id: string;
  consumer_name: string;
  action: "routine_run" | "manual_replay";
  requested_from_position?: number | null;
  reason?: string | null;
  actor?: string | null;
  result?: Record<string, unknown> | null;
}) {
  const row = {
    workspace_id: text(args.workspace_id) || "default",
    consumer_name: normalizeConsumerName(args.consumer_name) || DOMAIN_EVENTS_WORKSPACE_PROJECTOR,
    action: args.action,
    requested_from_position: args.requested_from_position ?? null,
    reason: text(args.reason).slice(0, 500) || null,
    actor: text(args.actor).slice(0, 200) || null,
    result: redactDomainEventPayload(args.result || {}),
    created_at: nowIso(),
  };
  const { error } = await supabase.from("domain_event_projection_audit").insert(row);
  if (error) throw new Error(`Domain event projection audit insert failed: ${error.message || JSON.stringify(error)}`);
  return row;
}

export function matchDomainEventRoute(method: string, path: string): DomainEventRouteMatch | null {
  const normalizedPath = text(path).replace(/\/+$/, "") || "/";
  if (normalizedPath === DOMAIN_EVENTS_STREAM_ROUTE) {
    if (method.toUpperCase() === "GET") return { kind: "stream" };
    return { kind: "method_not_allowed", path: DOMAIN_EVENTS_STREAM_ROUTE, allowed_methods: ["GET"] };
  }
  if (normalizedPath === DOMAIN_EVENTS_PROJECTION_REPLAY_ROUTE) {
    if (method.toUpperCase() === "POST") return { kind: "replay_projections" };
    return { kind: "method_not_allowed", path: DOMAIN_EVENTS_PROJECTION_REPLAY_ROUTE, allowed_methods: ["POST"] };
  }
  if (normalizedPath === DOMAIN_EVENTS_INTERNAL_RUN_ROUTE) {
    if (method.toUpperCase() === "POST") return { kind: "internal_run_projections" };
    return { kind: "method_not_allowed", path: DOMAIN_EVENTS_INTERNAL_RUN_ROUTE, allowed_methods: ["POST"] };
  }
  if (normalizedPath === DOMAIN_EVENTS_INTERNAL_REPLAY_ROUTE) {
    if (method.toUpperCase() === "POST") return { kind: "internal_replay_projections" };
    return { kind: "method_not_allowed", path: DOMAIN_EVENTS_INTERNAL_REPLAY_ROUTE, allowed_methods: ["POST"] };
  }
  if (normalizedPath === DOMAIN_EVENTS_INTERNAL_STATUS_ROUTE) {
    if (method.toUpperCase() === "GET") return { kind: "internal_projection_status" };
    return { kind: "method_not_allowed", path: DOMAIN_EVENTS_INTERNAL_STATUS_ROUTE, allowed_methods: ["GET"] };
  }
  return null;
}

export function parseWorkspaceUpdateCursor(value: unknown) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function listWorkspaceUpdates(supabase: any, args: {
  workspace_id: string;
  after_cursor?: number | string | null;
  limit?: number;
}) {
  const workspaceId = text(args.workspace_id) || "default";
  const after = parseWorkspaceUpdateCursor(args.after_cursor);
  const limit = Math.max(1, Math.min(250, Number(args.limit || 100) || 100));
  const { data, error } = await supabase
    .from("workspace_updates")
    .select(WORKSPACE_UPDATE_SELECT)
    .eq("workspace_id", workspaceId)
    .gt("update_position", after)
    .order("update_position", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Workspace update replay failed: ${error.message || JSON.stringify(error)}`);
  return (data || []) as WorkspaceUpdateRow[];
}

export function workspaceUpdateEnvelope(update: WorkspaceUpdateRow) {
  return {
    id: update.id,
    cursor: String(update.update_position),
    workspaceId: update.workspace_id,
    type: update.type,
    occurredAt: update.occurred_at,
    entity: update.entity_type && update.entity_id ? { type: update.entity_type, id: update.entity_id } : undefined,
    changedFields: update.changed_fields || [],
    metric: update.metric || undefined,
    activityGroupId: update.activity_group_id || undefined,
    severity: update.severity,
    payload: update.payload || {},
  };
}

export function formatSseMessage(args: { id?: string | number; event?: string; data?: unknown; comment?: string }) {
  if (args.comment) return `: ${args.comment}\n\n`;
  const lines: string[] = [];
  if (args.id !== undefined) lines.push(`id: ${String(args.id)}`);
  if (args.event) lines.push(`event: ${args.event}`);
  if (args.data !== undefined) lines.push(`data: ${JSON.stringify(args.data)}`);
  return `${lines.join("\n")}\n\n`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWorkspaceEventStream(supabase: any, args: {
  workspace_id: string;
  last_event_id?: string | null;
  signal?: AbortSignal;
  poll_ms?: number;
}) {
  const workspaceId = text(args.workspace_id) || "default";
  const signal = args.signal;
  const encoder = new TextEncoder();
  const pollMs = Math.max(1000, Number(args.poll_ms || 5000) || 5000);
  const headers = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no",
    "access-control-allow-origin": "*",
  };
  let cursor = parseWorkspaceUpdateCursor(args.last_event_id);
  const stream = new ReadableStream({
    async start(controller) {
      const write = (message: string) => controller.enqueue(encoder.encode(message));
      console.log("[TraceKit] workspace event stream connected", { workspace_id: workspaceId, cursor });
      try {
        write(formatSseMessage({
          event: "workspace.connected",
          data: { ok: true, workspaceId, cursor: String(cursor), engine: DOMAIN_EVENTS_ENGINE_VERSION },
        }));
        while (!signal?.aborted) {
          const updates = await listWorkspaceUpdates(supabase, { workspace_id: workspaceId, after_cursor: cursor, limit: 100 });
          for (const update of updates) {
            cursor = Number(update.update_position);
            write(formatSseMessage({ id: cursor, event: WORKSPACE_UPDATE_EVENT, data: workspaceUpdateEnvelope(update) }));
          }
          if (!updates.length) write(formatSseMessage({ comment: `heartbeat ${new Date().toISOString()}` }));
          await delay(pollMs);
        }
      } catch (error: any) {
        console.error("[TraceKit] workspace event stream error", {
          workspace_id: workspaceId,
          cursor,
          message: error?.message || String(error),
        });
        write(formatSseMessage({ event: "workspace.error", data: { ok: false, error: "stream_error" } }));
      } finally {
        console.log("[TraceKit] workspace event stream disconnected", { workspace_id: workspaceId, cursor });
        try {
          controller.close();
        } catch {
          // The browser may have already closed the connection.
        }
      }
    },
    cancel() {
      console.log("[TraceKit] workspace event stream cancelled", { workspace_id: workspaceId, cursor });
    },
  });
  return new Response(stream, { headers });
}

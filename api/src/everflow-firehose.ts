export const EVERFLOW_FIREHOSE_BASE_PATH = "/v1/everflow/firehose";
export const EVERFLOW_FIREHOSE_PATHS = {
  "/v1/everflow/firehose/clicks": "click",
  "/v1/everflow/firehose/conversions": "conversion",
  "/v1/everflow/firehose/conversion-updates": "conversion_update",
} as const satisfies Record<string, EverflowFirehoseEventType>;
export const EVERFLOW_FIREHOSE_MAX_BODY_BYTES = 256 * 1024;
export const EVERFLOW_FIREHOSE_ROUTING_TIMEOUT_MS = 5_000;

export type EverflowFirehoseEventType = "click" | "conversion" | "conversion_update";

export type EverflowFirehoseEnvelope = {
  schema_version: 1;
  provider: "everflow";
  transport: "firehose";
  received_at: string;
  event_type: EverflowFirehoseEventType;
  network_id: string;
  payload: Record<string, unknown>;
};

type FirehoseEnv = {
  EVERFLOW_FIREHOSE_SECRET?: string;
  everflow_firehose?: Queue<EverflowFirehoseEnvelope>;
};

type Scope = { organization_id: string; account_id: string; connection_id: string; provider_account_id: string };
export type EverflowNetworkResolution =
  | { status: "resolved"; scope: Scope }
  | { status: "unknown_network" }
  | { status: "ambiguous_network" };
export type FirehoseDependencies = {
  recordMetric?(metric: string, scope?: Partial<Scope>, at?: string): Promise<void> | void;
  defer?(work: Promise<unknown>): void;
  now?: () => Date;
};

export type FirehoseConsumerDependencies = {
  resolveNetwork?(networkId: string): Promise<EverflowNetworkResolution>;
  routingTimeoutMs?: number;
};

const encoder = new TextEncoder();
const clean = (value: unknown, max = 512) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};
const number = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const bool = (value: unknown) => value === true || value === 1 || value === "1" || value === "true"
  ? true : value === false || value === 0 || value === "0" || value === "false" ? false : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function response(status: number, error?: string, details: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(error ? { ok: false, error, ...details } : { ok: true, accepted: true }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export class EverflowRoutingUnavailableError extends Error {
  constructor() {
    super("everflow_routing_unavailable");
    this.name = "EverflowRoutingUnavailableError";
  }
}

async function resolveFirehoseScope(db: FirehoseDatabase, deps: FirehoseConsumerDependencies, networkId: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutMs = deps.routingTimeoutMs ?? EVERFLOW_FIREHOSE_ROUTING_TIMEOUT_MS;
  try {
    return await Promise.race([
      (deps.resolveNetwork || ((value) => resolveEverflowNetwork(db, value)))(networkId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EverflowRoutingUnavailableError()), timeoutMs);
      }),
    ]);
  } catch {
    // A rejection at this boundary means routing could not be determined. A
    // successful lookup returning null remains the distinct unknown-network case.
    throw new EverflowRoutingUnavailableError();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function constantTimeSecretEqual(expected: string, supplied: string) {
  const a = encoder.encode(expected), b = encoder.encode(supplied);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) mismatch |= (a[i % Math.max(a.length, 1)] || 0) ^ (b[i % Math.max(b.length, 1)] || 0);
  return mismatch === 0;
}

export function firehoseEventTypeForPath(pathname: string): EverflowFirehoseEventType | null {
  return EVERFLOW_FIREHOSE_PATHS[pathname as keyof typeof EVERFLOW_FIREHOSE_PATHS] || null;
}

function validatePayload(eventType: EverflowFirehoseEventType, payload: Record<string, unknown>) {
  const networkId = clean(payload.network_id, 128);
  if (!networkId) return { error: "network_id_required" as const };
  if (eventType === "click") {
    const identity = clean(payload.transaction_id, 256);
    const timestamp = number(payload.unix_timestamp);
    if (!identity || !timestamp || timestamp <= 0) return { error: "invalid_click" as const };
    return { networkId, identity };
  }
  const identity = clean(payload.conversion_id, 256);
  const transactionId = clean(payload.transaction_id, 256);
  const timestamp = number(payload.conversion_timestamp) || (clean(payload.date, 64) && Date.parse(String(payload.date)) / 1000);
  if (!identity || !transactionId || !timestamp || timestamp <= 0) return { error: "invalid_conversion" as const };
  if (eventType === "conversion_update" && payload.update_timestamp != null && (!number(payload.update_timestamp) || Number(payload.update_timestamp) <= 0)) {
    return { error: "invalid_update_timestamp" as const };
  }
  return { networkId, identity };
}

function boundedObject(value: unknown, depth = 0): unknown {
  if (depth > 3) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 2048);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => boundedObject(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100)
    .filter(([key]) => !/(?:^|_)(?:secret|token|password|authorization|api_key|apikey)(?:$|_)/i.test(key))
    .map(([key, item]) => [key.slice(0, 128), boundedObject(item, depth + 1)]));
}

export function privacySafePayload(payload: Record<string, unknown>) {
  const safe = boundedObject(payload) as Record<string, unknown>;
  for (const key of ["user_ip", "session_user_ip", "conversion_user_ip", "http_user_agent", "user_agent", "geolocation", "device_info", "redirect_url", "raw_query_string"]) delete safe[key];
  if (safe.query_parameters && typeof safe.query_parameters === "object") {
    safe.query_parameters = Object.fromEntries(Object.entries(record(safe.query_parameters)).slice(0, 50)
      .filter(([key]) => !/(?:^|_)(?:secret|token|password|authorization|api_key|apikey)(?:$|_)/i.test(key))
      .map(([key, value]) => [key.slice(0, 128), clean(value, 512)]));
  }
  return safe;
}

export async function handleEverflowFirehose(req: Request, eventType: EverflowFirehoseEventType, env: FirehoseEnv, deps: FirehoseDependencies) {
  const metric = (name: string, scope?: Partial<Scope>, at?: string) => {
    const work = Promise.resolve(deps.recordMetric?.(name, scope, at)).catch(() => undefined);
    if (deps.defer) deps.defer(work); else void work;
  };
  if (req.method !== "POST") return response(405, "method_not_allowed");
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) return response(415, "unsupported_media_type");
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > EVERFLOW_FIREHOSE_MAX_BODY_BYTES) return response(413, "payload_too_large");
  const expected = String(env.EVERFLOW_FIREHOSE_SECRET || "");
  const authorization = req.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !supplied || !constantTimeSecretEqual(expected, supplied)) {
    metric("rejected_auth");
    return response(401, "unauthorized");
  }
  metric("authenticated");
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    metric("malformed_payload");
    return response(400, "malformed_json");
  }
  if (encoder.encode(raw).byteLength > EVERFLOW_FIREHOSE_MAX_BODY_BYTES) return response(413, "payload_too_large");
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    payload = parsed;
  } catch {
    metric("malformed_payload");
    return response(400, "malformed_json");
  }
  const validation = validatePayload(eventType, payload);
  if ("error" in validation) return response(422, validation.error);
  if (!env.everflow_firehose) return response(503, "queue_unavailable");
  const receivedAt = (deps.now?.() || new Date()).toISOString();
  const envelope: EverflowFirehoseEnvelope = {
    schema_version: 1, provider: "everflow", transport: "firehose", received_at: receivedAt,
    event_type: eventType, network_id: validation.networkId,
    payload: privacySafePayload(payload),
  };
  metric("received", undefined, receivedAt);
  try {
    await env.everflow_firehose.send(envelope);
    metric("queued", undefined, receivedAt);
    return response(202);
  } catch {
    metric("queue_failure", undefined, receivedAt);
    return response(503, "queue_publication_failed");
  }
}

export type FirehoseDatabase = {
  from(table: string): any;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

export async function resolveEverflowNetwork(db: FirehoseDatabase, networkId: string): Promise<EverflowNetworkResolution> {
  const { data, error } = await db.from("commerce_provider_accounts")
    .select("id,organization_id,connection_id,commerce_provider_connections!inner(account_id,provider,status)")
    .eq("provider_account_external_id", networkId).eq("status", "active")
    .eq("commerce_provider_connections.provider", "everflow").eq("commerce_provider_connections.status", "connected").limit(2);
  if (error) throw new Error("everflow_network_lookup_failed");
  if (!Array.isArray(data) || data.length === 0) return { status: "unknown_network" };
  if (data.length !== 1) return { status: "ambiguous_network" };
  const connection = Array.isArray(data[0].commerce_provider_connections) ? data[0].commerce_provider_connections[0] : data[0].commerce_provider_connections;
  if (!connection?.account_id) return { status: "ambiguous_network" };
  return { status: "resolved", scope: { account_id: String(connection.account_id), organization_id: String(data[0].organization_id), connection_id: String(data[0].connection_id), provider_account_id: String(data[0].id) } };
}

export async function recordFirehoseMetric(db: FirehoseDatabase, metric: string, scope: Partial<Scope> = {}, at?: string) {
  const { error } = await db.rpc("record_everflow_firehose_metric_v1", {
    p_metric: metric, p_organization_id: scope.organization_id || null, p_connection_id: scope.connection_id || null,
    p_provider_account_id: scope.provider_account_id || null, p_observed_at: at || new Date().toISOString(),
  });
  if (error) throw new Error("everflow_metric_write_failed");
}

export async function processEverflowFirehoseEnvelope(db: FirehoseDatabase, envelope: EverflowFirehoseEnvelope, deps: FirehoseConsumerDependencies = {}) {
  if (envelope.schema_version !== 1 || envelope.provider !== "everflow" || envelope.transport !== "firehose") throw new Error("invalid_everflow_firehose_envelope");
  const payload = record(envelope.payload);
  const validation = validatePayload(envelope.event_type, payload);
  if ("error" in validation || validation.networkId !== envelope.network_id) throw new Error("invalid_everflow_firehose_envelope");
  const resolution = await resolveFirehoseScope(db, deps, envelope.network_id);
  if (resolution.status !== "resolved") return resolution;
  const scope = resolution.scope;
  const { data, error } = await db.rpc("ingest_everflow_firehose_event_v1", {
    p_organization_id: scope.organization_id, p_account_id: scope.account_id, p_connection_id: scope.connection_id,
    p_provider_account_id: scope.provider_account_id, p_network_id: envelope.network_id, p_event_type: envelope.event_type,
    p_received_at: envelope.received_at, p_payload: envelope.payload,
  });
  if (error) throw new Error(String(error.message || "everflow_firehose_persistence_failed").slice(0, 160));
  return { status: "processed" as const, scope, data };
}

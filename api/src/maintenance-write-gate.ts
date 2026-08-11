export const MAINTENANCE_WRITE_GATE_ENV = "TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED";
export const MAINTENANCE_RETRY_AFTER_SECONDS = 60;

export type MaintenanceWriteClass =
  | "read_only"
  | "http_mutation"
  | "scheduled_producer"
  | "queue_producer"
  | "queue_consumer"
  | "queue_continuation"
  | "queue_follow_on"
  | "webhook_ingress"
  | "admin_inspection";

type MaintenanceEnv = { TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED?: string };

export function isMaintenanceWriteGateEnabled(env: MaintenanceEnv) {
  const value = String(env.TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED ?? "").trim().toLowerCase();
  return value === "true" || value === "1";
}

const GET_WRITE_PATHS = [
  /^\/v1\/tkid\/relay\/(?:out|return)\//,
  /^\/v1\/integrations\/[^/]+\/(?:callback|oauth\/callback)(?:\/|$)/,
];

export function classifyHttpMaintenanceRequest(method: string, pathname: string): MaintenanceWriteClass {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const path = pathname || "/";
  if (GET_WRITE_PATHS.some((pattern) => pattern.test(path))) return "http_mutation";
  if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) return "read_only";
  if (/\/(?:webhooks?|ingest)(?:\/|$)/i.test(path)) return "webhook_ingress";
  return "http_mutation";
}

export function maintenanceWriteAllowed(env: MaintenanceEnv, action: MaintenanceWriteClass) {
  if (!isMaintenanceWriteGateEnabled(env)) return true;
  return action === "read_only" || action === "admin_inspection" || action === "queue_consumer" || action === "queue_continuation";
}

export function maintenanceRequiresAdminAuthorization(action: MaintenanceWriteClass) {
  return action === "http_mutation";
}

export function maintenanceBlockedResponse(action: MaintenanceWriteClass) {
  console.warn("[TraceKit] maintenance write blocked", {
    event: "maintenance.write_blocked",
    source_category: action,
    timestamp: new Date().toISOString(),
  });
  return new Response(JSON.stringify({
    error: "maintenance_mode",
    message: "TraceKit is temporarily unavailable for writes.",
  }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "retry-after": String(MAINTENANCE_RETRY_AFTER_SECONDS),
    },
  });
}

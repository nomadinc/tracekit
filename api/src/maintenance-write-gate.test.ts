import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHttpMaintenanceRequest,
  isMaintenanceWriteGateEnabled,
  maintenanceBlockedResponse,
  maintenanceRequiresAdminAuthorization,
  maintenanceWriteAllowed,
} from "./maintenance-write-gate.ts";

test("maintenance gate defaults off and parses only explicit approved values", () => {
  assert.equal(isMaintenanceWriteGateEnabled({}), false);
  assert.equal(isMaintenanceWriteGateEnabled({ TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED: "false" }), false);
  assert.equal(isMaintenanceWriteGateEnabled({ TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED: "enabled" }), false);
  assert.equal(isMaintenanceWriteGateEnabled({ TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED: "true" }), true);
  assert.equal(isMaintenanceWriteGateEnabled({ TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED: "1" }), true);
});

test("maintenance disposition preserves reads and consumer drain but blocks producers", () => {
  const on = { TRACEKIT_MAINTENANCE_WRITE_GATE_ENABLED: "true" };
  assert.equal(maintenanceWriteAllowed(on, "read_only"), true);
  assert.equal(maintenanceWriteAllowed(on, "admin_inspection"), true);
  assert.equal(maintenanceWriteAllowed(on, "queue_consumer"), true);
  assert.equal(maintenanceWriteAllowed(on, "queue_continuation"), true);
  assert.equal(maintenanceWriteAllowed(on, "http_mutation"), false);
  assert.equal(maintenanceWriteAllowed(on, "scheduled_producer"), false);
  assert.equal(maintenanceWriteAllowed(on, "queue_producer"), false);
  assert.equal(maintenanceWriteAllowed(on, "queue_follow_on"), false);
});

test("HTTP classifier blocks mutations, webhook ingress, and GET relay lifecycle writes", () => {
  assert.equal(classifyHttpMaintenanceRequest("GET", "/v1/health"), "read_only");
  assert.equal(classifyHttpMaintenanceRequest("POST", "/v1/integrations/wowboost/run-now"), "http_mutation");
  assert.equal(classifyHttpMaintenanceRequest("POST", "/v1/integrations/everflow/webhook"), "webhook_ingress");
  assert.equal(classifyHttpMaintenanceRequest("GET", "/v1/tkid/relay/return/flow"), "http_mutation");
});

test("protected mutations authenticate before maintenance while public ingress stays generic", () => {
  assert.equal(maintenanceRequiresAdminAuthorization("http_mutation"), true);
  assert.equal(maintenanceRequiresAdminAuthorization("webhook_ingress"), false);
  assert.equal(maintenanceRequiresAdminAuthorization("read_only"), false);
});

test("maintenance response is bounded, retryable, and contains no request data", async () => {
  const response = maintenanceBlockedResponse("http_mutation");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), {
    error: "maintenance_mode",
    message: "TraceKit is temporarily unavailable for writes.",
  });
});

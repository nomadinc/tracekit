import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("Worker applies the maintenance gate before HTTP mutation routing", () => {
  const fetchStart = worker.indexOf("async fetch(req: Request");
  const routerCall = worker.indexOf("return await router(req, env)", fetchStart);
  const gate = worker.indexOf("classifyHttpMaintenanceRequest(req.method, path)", fetchStart);
  assert.ok(fetchStart >= 0 && gate > fetchStart && gate < routerCall);
  assert.match(worker.slice(gate, routerCall), /maintenanceRequiresAdminAuthorization\(maintenanceClass\)[\s\S]*adminAuthError\(req, env\)/);
  assert.match(worker.slice(gate, routerCall), /maintenanceBlockedResponse\(maintenanceClass\)/);
});

test("scheduled handler exits before every producer and direct write", () => {
  const scheduled = worker.slice(worker.indexOf("async scheduled("));
  const gate = scheduled.indexOf("isMaintenanceWriteGateEnabled(env)");
  const firstScheduledWork = scheduled.indexOf("runCommerceCron(");
  assert.ok(gate >= 0 && gate < firstScheduledWork);
  assert.match(scheduled.slice(gate, firstScheduledWork), /return;/);
});

test("Queue consumer remains active and maintenance allows bounded continuations only", () => {
  const queueStart = worker.indexOf("async queue(batch: MessageBatch<any>");
  const scheduledStart = worker.indexOf("async scheduled(", queueStart);
  const queue = worker.slice(queueStart, scheduledStart);
  assert.doesNotMatch(queue.slice(0, 500), /isMaintenanceWriteGateEnabled\(env\)[\s\S]*return;/);
  assert.match(queue, /maintenanceWriteAllowed\(env, "queue_continuation"\)/);
  assert.match(queue, /maintenanceWriteAllowed\(env, "queue_follow_on"\)/);
  assert.doesNotMatch(queue, /MESSAGE BODY/);
});

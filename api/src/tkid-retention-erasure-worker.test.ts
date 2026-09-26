import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

test("retention executor is explicitly deployment-gated and disabled by default", () => {
  assert.match(worker, /TRACEKIT_TKID_ERASURE_EXECUTOR_ENABLED\?: string/);
  assert.match(worker, /TRACEKIT_TKID_ERASURE_EXECUTOR_ENABLED!=="true"/);
  assert.match(config, /TRACEKIT_TKID_ERASURE_EXECUTOR_ENABLED = "false"/);
});

test("scheduled execution uses bounded database scheduling and leased claims", () => {
  const executor = worker.slice(worker.indexOf("async function runTkidPrivacyExecutor"), worker.indexOf("function relayOpaque"));
  assert.match(executor, /schedule_tkid_retention_v1/);
  assert.match(executor, /claim_tkid_erasure_run_v1/);
  assert.match(executor, /for\(let i=0;i<25;i\+\+\)/);
  assert.match(executor, /\.limit\(100\)/);
  assert.match(executor, /erase_tkid_erasure_object_v1/);
  assert.match(executor, /complete_tkid_erasure_run_v2/);
  assert.match(executor, /fail_tkid_erasure_run_v1/);
  assert.match(worker, /ctx\.waitUntil\(runTkidPrivacyExecutor\(env\)/);
});

test("object-level failure is fail-closed and does not complete the run", () => {
  const executor = worker.slice(worker.indexOf("async function runTkidPrivacyExecutor"), worker.indexOf("function relayOpaque"));
  assert.match(executor, /error\|\|erased!==true/);
  assert.match(executor, /erasure_object_failed/);
});

test("worker evidence and logs remain bounded and tenant-generic", () => {
  const executor = worker.slice(worker.indexOf("async function runTkidPrivacyExecutor"), worker.indexOf("function relayOpaque"));
  assert.doesNotMatch(executor, /object_reference|bounded_payload|buyecowatt|b784b15c|b0d5abc3/);
  assert.match(executor, /scheduled:[\s\S]*completed:[\s\S]*failed:/);
});

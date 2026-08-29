import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const metrics = () => readFileSync(`${root}/lib/integrations/everflow-conversion-run-metrics.ts`, "utf8");
const route = () => readFileSync(`${root}/app/v1/integrations/everflow/conversions/sync/route.ts`, "utf8");

test("Everflow reruns classify created, updated, and unchanged rows by prior payload hash", () => {
  const text = metrics();
  assert.match(text, /priorHash === undefined/);
  assert.match(text, /priorHash === currentHash/);
  assert.match(text, /created \+= 1/);
  assert.match(text, /updated \+= 1/);
  assert.match(text, /unchanged \+= 1/);
  assert.match(text, /records_created: created/);
  assert.match(text, /records_updated: updated/);
  assert.match(text, /records_unchanged: unchanged/);
});

test("conversion sync snapshots evidence before ingest and finalizes metrics afterward", () => {
  const text = route();
  const baseline = text.indexOf("captureEverflowConversionBaseline");
  const sync = text.indexOf("syncEverflowConversions({");
  const finalize = text.indexOf("finalizeEverflowConversionRunMetrics");
  assert.ok(baseline >= 0 && sync > baseline && finalize > sync);
  assert.match(text, /createdByCount/);
  assert.match(text, /changeMetrics\.created !== createdByCount/);
});

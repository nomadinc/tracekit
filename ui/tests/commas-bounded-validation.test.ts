import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertRuntimeSafe, parseBoundedArgs, selectBoundedTransactions } from "../lib/commerce/commas-bounded-validation";

const safe = { schedulerEnv: "false", killSwitchEnv: "disabled", productionControlState: "disabled", scheduleEnabled: false, scheduleActivationState: "disabled", connectionPaused: false, activationMode: "shadow", activeRunCount: 0 };

test("rejects zero transactions and accepts exactly ten", () => {
  assert.throws(() => parseBoundedArgs([]), /explicit transaction selection/);
  assert.equal(parseBoundedArgs(["--max-transactions", "10", "--confirm-production-shadow-validation"]).maxTransactions, 10);
});

test("rejects eleven and deduplicates repeated IDs deterministically", () => {
  assert.throws(() => parseBoundedArgs(["--max-transactions", "11"]), /between 1 and 10/);
  const parsed = parseBoundedArgs(["--transaction-id", "a", "--transaction-id", "a", "--transaction-id", "b"]);
  assert.deepEqual(parsed.transactionIds, ["a", "b"]);
  assert.throws(() => parseBoundedArgs(Array.from({ length: 11 }, (_, index) => ["--transaction-id", String(index)]).flat()), /At most 10/);
});

test("confirmation is parsed and unsafe scheduler/continuous states block", () => {
  assert.equal(parseBoundedArgs(["--max-transactions", "1"]).confirmed, false);
  assert.throws(() => assertRuntimeSafe({ ...safe, schedulerEnv: "true" }), /SCHEDULER_ENABLED/);
  assert.throws(() => assertRuntimeSafe({ ...safe, productionControlState: "enabled" }), /control is enabled/);
  assert.throws(() => assertRuntimeSafe({ ...safe, activeRunCount: 1 }), /concurrent/);
  assert.throws(() => assertRuntimeSafe({ ...safe, activationMode: "live" }), /Repository activation/);
});

test("selection never exceeds the hard bound and does not imply page two", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  const args = parseBoundedArgs(["--max-transactions", "5"]);
  assert.deepEqual(selectBoundedTransactions(items, args).map((item) => item.id), ["0", "1", "2", "3", "4"]);
  const ids = parseBoundedArgs(["--transaction-id", "42", "--transaction-id", "7"]);
  assert.deepEqual(selectBoundedTransactions(items, ids).map((item) => item.id), ["42", "7"]);
});

test("preflight flag itself is write-blocking input", () => {
  assert.equal(parseBoundedArgs(["--max-transactions", "2", "--preflight"]).preflight, true);
});

test("preflight returns before every provider transaction method", () => {
  const source = readFileSync(fileURLToPath(new URL("../scripts/run-commas-bounded-validation.ts", import.meta.url)), "utf8");
  const preflight = source.indexOf("if (args.preflight)");
  assert.notEqual(preflight, -1);
  const providerPhase = source.indexOf("const secret", preflight);
  assert.ok(providerPhase > preflight);
  const preflightBlock = source.slice(preflight, providerPhase);
  assert.doesNotMatch(preflightBlock, /getTransaction|listTransactions|new CommasClient|credential\(/);
});

test("persistence plan is idempotent and never advances historical checkpoints", () => {
  const source = readFileSync(fileURLToPath(new URL("../scripts/run-commas-bounded-validation.ts", import.meta.url)), "utf8");
  assert.match(source, /resolution=ignore-duplicates/);
  assert.match(source, /historical_checkpoint_advanced: false/);
  assert.doesNotMatch(source, /commerce_sync_checkpoints/);
  assert.doesNotMatch(source, /page=eq\.2/);
});

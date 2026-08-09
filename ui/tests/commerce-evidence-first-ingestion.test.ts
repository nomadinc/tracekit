import assert from "node:assert/strict";
import test from "node:test";
import { runEvidenceFirstPage } from "../lib/commerce/evidence-first-ingestion";

test("Evidence failure prevents normalization and Checkpoint completion", async () => {
  const calls: string[] = [];
  await assert.rejects(() => runEvidenceFirstPage({
    async persistEvidence() { calls.push("evidence"); throw new Error("synthetic storage failure"); },
    async normalizeFromEvidence() { calls.push("normalize"); return 1; },
    async completeCheckpoint() { calls.push("complete"); },
    async failCheckpoint(code) { calls.push(`failed:${code}`); },
  }), /failed safely/);
  assert.deepEqual(calls, ["evidence", "failed:evidence_first_page_failed"]);
});

test("normalization failure preserves Evidence and leaves the Checkpoint failed for replay", async () => {
  const calls: string[] = [];
  const evidence = { reference: "synthetic-evidence" };
  await assert.rejects(() => runEvidenceFirstPage({
    async persistEvidence() { calls.push("evidence"); return evidence; },
    async normalizeFromEvidence(value) { assert.equal(value, evidence); calls.push("normalize"); throw new Error("synthetic normalization failure"); },
    async completeCheckpoint() { calls.push("complete"); },
    async failCheckpoint() { calls.push("failed"); },
  }), /failed safely/);
  assert.deepEqual(calls, ["evidence", "normalize", "failed"]);
});

test("Checkpoint completes only after Evidence and transactional normalization", async () => {
  const calls: string[] = [];
  const result = await runEvidenceFirstPage({
    async persistEvidence() { calls.push("evidence"); return "verified-reference"; },
    async normalizeFromEvidence(reference) { calls.push(`normalize:${reference}`); return { records: 2 }; },
    async completeCheckpoint(value) { calls.push(`complete:${value.records}`); },
    async failCheckpoint() { calls.push("failed"); },
  });
  assert.deepEqual(result, { records: 2 });
  assert.deepEqual(calls, ["evidence", "normalize:verified-reference", "complete:2"]);
});

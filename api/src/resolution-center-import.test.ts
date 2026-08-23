import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import { parseResolutionCenterWorkbook, RESOLUTION_CENTER_HEADERS } from "./connectors/commas/resolution-center-import.ts";

test("Resolution Center parser validates schema and creates stable non-provider row identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracekit-resolution-")); const file = join(directory, "synthetic.xlsx");
  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file }); const sheet = workbook.addWorksheet("Disputes"); sheet.addRow([...RESOLUTION_CENTER_HEADERS]).commit();
    sheet.addRow(["Open", "Needs response", new Date("2026-01-03T00:00:00Z"), new Date("2025-12-20T00:00:00Z"), "Synthetic Person", "SYNTHETIC@EXAMPLE.INVALID", "fraud", "", 49.95, 15, "card", "Synthetic Product"]).commit();
    sheet.addRow(["Open", "Needs response", "not-a-date", new Date("2025-12-20T00:00:00Z"), "Synthetic Person", "bad-email", "fraud", "", 49.95, 15, "card", "Synthetic Product"]).commit();
    sheet.commit(); await workbook.commit();
    const rows: Array<{ sourceId: string; normalizedEmail: string }> = []; const rejected: string[][] = [];
    const summary = await parseResolutionCenterWorkbook({ filePath: file, onAccepted: (row) => rows.push(row), onRejected: (finding) => rejected.push(finding.codes), maxRows: 10 });
    assert.equal(summary.accepted, 1); assert.equal(summary.rejected, 1); assert.equal(rows[0].normalizedEmail, "synthetic@example.invalid"); assert.match(rows[0].sourceId, /^[a-f0-9]{64}$/); assert.ok(rejected[0].includes("invalid_dispute_date"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Resolution Center parser fails closed on unexpected headers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tracekit-resolution-")); const file = join(directory, "synthetic.xlsx");
  try { const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file }); const sheet = workbook.addWorksheet("Disputes"); sheet.addRow(["Unexpected"]).commit(); sheet.commit(); await workbook.commit(); await assert.rejects(() => parseResolutionCenterWorkbook({ filePath: file, onAccepted: () => {} }), /headers/); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test("historical importer validates before mutation and uses secret-key-compatible Supabase auth", () => {
  const source = readFileSync(new URL("../../ui/scripts/import-commas-historical-disputes.ts", import.meta.url), "utf8");
  assert.match(source, /parseResolutionCenterWorkbook/);
  assert.match(source, /onRejected/);
  assert.match(source, /supabaseAuthHeaders\(key\)/);
  assert.match(source, /priorImport/);
  assert.match(source, /historical_disputes_duplicate/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{key\}`/);
  assert.ok(source.indexOf("parseResolutionCenterWorkbook") < source.indexOf("putImmutable"));
});

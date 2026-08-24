// @ts-ignore The API Worker tsconfig intentionally omits Node ambient types; this module runs only in the offline Node import command.
import { createHash } from "node:crypto";
// @ts-ignore The API Worker tsconfig intentionally omits Node ambient types; this module runs only in the offline Node import command.
import { createReadStream } from "node:fs";
import ExcelJS from "exceljs";

export const RESOLUTION_CENTER_HEADERS = [
  "State", "Status", "Dispute Date", "Transaction Date", "Customer Name", "Customer Email",
  "Dispute Reason", "Dispute Closed Date", "Amount", "Dispute Fee", "Payment Method", "Product",
] as const;

export type HistoricalDisputeRow = {
  sourceId: string;
  rowNumber: number;
  state: string;
  status: string;
  disputeDate: string;
  transactionDate: string;
  customerName: string | null;
  normalizedEmail: string;
  reason: string;
  closedDate: string | null;
  amount: string;
  fee: string | null;
  paymentMethod: string | null;
  product: string;
};

export type WorkbookImportSummary = { workbookHash: string; accepted: number; rejected: number; headers: string[] };

export type WorkbookShape = { workbookHash: string; worksheetNames: string[]; headers: string[]; totalDataRows: number };

export async function inspectResolutionCenterWorkbook(filePath: string): Promise<WorkbookShape> {
  const workbookHash = await hashFile(filePath);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore" });
  const worksheetNames: string[] = [];
  let headers: string[] = [];
  let totalDataRows = 0;
  for await (const worksheet of reader) {
    // ExcelJS exposes `name` at runtime on streamed worksheets, but its
    // WorksheetReader declaration omits that runtime field.
    const worksheetName = (worksheet as unknown as { name?: unknown }).name;
    worksheetNames.push(typeof worksheetName === "string" ? worksheetName : `Sheet${worksheetNames.length + 1}`);
    for await (const row of worksheet) {
      const values = row.values as unknown[];
      if (row.number === 1) headers = values.slice(1).map(textValue);
      else if (values.slice(1).some((value) => textValue(value) !== "")) totalDataRows += 1;
    }
  }
  return { workbookHash, worksheetNames, headers, totalDataRows };
}

export async function parseResolutionCenterWorkbook(input: {
  filePath: string;
  onAccepted: (row: HistoricalDisputeRow) => Promise<void> | void;
  onRejected?: (finding: { rowNumber: number; codes: string[] }) => Promise<void> | void;
  maxRows?: number;
}): Promise<WorkbookImportSummary> {
  const workbookHash = await hashFile(input.filePath);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input.filePath, { worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore" });
  let accepted = 0; let rejected = 0; let headers: string[] = []; let worksheets = 0;
  for await (const worksheet of reader) {
    worksheets += 1;
    if (worksheets > 1) throw new Error("Resolution Center import must contain exactly one worksheet.");
    for await (const row of worksheet) {
      if (row.number === 1) {
        headers = rowValues(row).map(textValue);
        if (headers.length !== RESOLUTION_CENTER_HEADERS.length || headers.some((value, index) => value !== RESOLUTION_CENTER_HEADERS[index])) throw new Error("Resolution Center workbook headers do not match the approved schema.");
        continue;
      }
      if (input.maxRows && accepted + rejected >= input.maxRows) throw new Error("Resolution Center import exceeded its configured row bound.");
      const values = rowValues(row);
      if (values.every((value) => value == null || textValue(value) === "")) continue;
      const result = normalizeRow(values, row.number, workbookHash);
      if ("codes" in result) { rejected += 1; await input.onRejected?.({ rowNumber: row.number, codes: result.codes }); }
      else { accepted += 1; await input.onAccepted(result); }
    }
  }
  if (worksheets !== 1 || headers.length === 0) throw new Error("Resolution Center workbook contains no importable worksheet.");
  return { workbookHash, accepted, rejected, headers };
}

function normalizeRow(values: unknown[], rowNumber: number, workbookHash: string): HistoricalDisputeRow | { codes: string[] } {
  const state = textValue(values[0]); const status = textValue(values[1]); const disputeDate = dateValue(values[2]); const transactionDate = dateValue(values[3]);
  const customerName = nullableText(values[4]); const normalizedEmail = textValue(values[5]).trim().toLowerCase(); const reason = textValue(values[6]); const closedDate = nullableDate(values[7]);
  const amount = decimalValue(values[8]); const fee = nullableDecimal(values[9]); const paymentMethod = nullableText(values[10]); const product = textValue(values[11]);
  const codes: string[] = [];
  if (!state) codes.push("missing_state"); if (!status) codes.push("missing_status"); if (!disputeDate) codes.push("invalid_dispute_date"); if (!transactionDate) codes.push("invalid_transaction_date");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) codes.push("invalid_customer_email"); if (!reason) codes.push("missing_reason"); if (amount === null) codes.push("invalid_amount"); if (!product) codes.push("missing_product");
  if (codes.length || !disputeDate || !transactionDate || amount === null) return { codes };
  const normalized = { state, status, disputeDate, transactionDate, customerName, normalizedEmail, reason, closedDate, amount, fee, paymentMethod, product };
  // The workbook hash identifies the import; the row number preserves the
  // original workbook identity independently of mutable display fields.
  const sourceId = createHash("sha256").update(`${workbookHash}\0row:${rowNumber}`).digest("hex");
  return { sourceId, rowNumber, ...normalized };
}

function rowValues(row: ExcelJS.Row) { const values = row.values as unknown[]; return values.slice(1, RESOLUTION_CENTER_HEADERS.length + 1); }
function textValue(value: unknown) { if (value && typeof value === "object" && "text" in value) return String((value as { text: unknown }).text).trim(); return value == null ? "" : String(value).trim(); }
function nullableText(value: unknown) { const text = textValue(value); return text || null; }
function dateValue(value: unknown) { if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString(); const text = textValue(value); if (!text) return null; const parsed = new Date(text); return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString(); }
function nullableDate(value: unknown) { return textValue(value) ? dateValue(value) : null; }
function decimalValue(value: unknown) { const raw = textValue(value).replace(/[$,\s]/g, ""); const text = /^\(.*\)$/.test(raw) ? `-${raw.slice(1, -1)}` : raw; if (!/^-?\d+(\.\d+)?$/.test(text)) return null; const number = Number(text); return Number.isFinite(number) ? number.toFixed(2) : null; }
function nullableDecimal(value: unknown) { return textValue(value) ? decimalValue(value) : null; }
async function hashFile(filePath: string) { const hash = createHash("sha256"); for await (const chunk of createReadStream(filePath)) hash.update(chunk); return hash.digest("hex"); }

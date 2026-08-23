import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewReport } from "../scripts/import-commas-historical-disputes.ts";

test("historical dispute preview reports parser results without currency aggregation", () => {
  const report = buildPreviewReport({
    summary: { workbookHash: "a".repeat(64), accepted: 2, rejected: 1, headers: Array.from({ length: 12 }, () => "header") },
    rows: [
      { sourceId: "1", rowNumber: 2, state: "open", status: "needs_response", disputeDate: "2026-01-03T00:00:00.000Z", transactionDate: "2026-01-01T00:00:00.000Z", customerName: "redacted", normalizedEmail: "redacted@example.com", reason: "fraud", closedDate: null, amount: "10.00", fee: "1.00", paymentMethod: "card", product: "Product A" },
      { sourceId: "2", rowNumber: 3, state: "closed", status: "won", disputeDate: "2026-02-03T00:00:00.000Z", transactionDate: "2026-02-01T00:00:00.000Z", customerName: null, normalizedEmail: "redacted@example.com", reason: "other", closedDate: "2026-02-04T00:00:00.000Z", amount: "20.00", fee: null, paymentMethod: null, product: "Product A" },
    ],
    rejected: [{ rowNumber: 4, codes: ["invalid_amount", "missing_reason"] }],
    duplicateWorkbook: false,
  });
  assert.equal(report.writes, 0);
  assert.equal(report.providerRequests, 0);
  assert.deepEqual(report.rejectionCounts, { invalid_amount: 1, missing_reason: 1 });
  assert.deepEqual(report.productCounts, { "Product A": 2 });
  assert.deepEqual(report.currencies.present, []);
  assert.equal(report.disputedAmountsWithoutCurrency.safeToAggregate, false);
});

export interface SanitizedNmiActionFixture {
  type: string;
  date?: string;
  amount?: string;
  requestedAmount?: string;
  responseCode?: string;
  responseText?: string;
  processorResponseCode?: string;
  processorResponseText?: string;
  batchId?: string;
  processorBatchId?: string;
}

export interface SanitizedNmiTransactionFixture {
  transactionId: string;
  originalTransactionId?: string;
  condition: string;
  currency?: string;
  actions: SanitizedNmiActionFixture[];
}

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizedNmiTransactionXml(fixture: SanitizedNmiTransactionFixture) {
  const tag = (name: string, value: string | undefined) => value === undefined ? "" : `<${name}>${xml(value)}</${name}>`;
  return `<transaction>${tag("transaction_id", fixture.transactionId)}${tag("original_transaction_id", fixture.originalTransactionId)}${tag("condition", fixture.condition)}${tag("currency", fixture.currency ?? "USD")}<actions>${fixture.actions.map((action) => `<action>${tag("action_type", action.type)}${tag("date", action.date)}${tag("amount", action.amount)}${tag("requested_amount", action.requestedAmount)}${tag("response_code", action.responseCode)}${tag("response_text", action.responseText)}${tag("processor_response_code", action.processorResponseCode)}${tag("processor_response_text", action.processorResponseText)}${tag("batch_id", action.batchId)}${tag("processor_batch_id", action.processorBatchId)}</action>`).join("")}</actions></transaction>`;
}

export const SUCCESS_ACTION: SanitizedNmiActionFixture = Object.freeze({
  type: "refund",
  date: "20260105072435",
  amount: "-64.38",
  responseCode: "100",
  responseText: "APPROVED",
  processorResponseCode: "00",
  processorResponseText: "APPROVED",
});

export const FAILED_ACTION: SanitizedNmiActionFixture = Object.freeze({
  type: "refund",
  date: "20260115172205",
  amount: "-67.88",
  responseCode: "200",
  responseText: "DECLINED",
  processorResponseCode: "1",
  processorResponseText: "DECLINED",
});

export function fullRefundFixture(overrides: Partial<SanitizedNmiTransactionFixture> = {}) {
  return sanitizedNmiTransactionXml({
    transactionId: "refund-full-001",
    originalTransactionId: "sale-full-001",
    condition: "complete",
    currency: "USD",
    actions: [SUCCESS_ACTION, { type: "settle", date: "20260105231141", amount: "-64.38", responseCode: "100", responseText: "APPROVED" }],
    ...overrides,
  });
}

export function partialRefundFixture(overrides: Partial<SanitizedNmiTransactionFixture> = {}) {
  return sanitizedNmiTransactionXml({
    transactionId: "refund-partial-001",
    originalTransactionId: "sale-partial-001",
    condition: "complete",
    currency: "USD",
    actions: [{ ...SUCCESS_ACTION, date: "20260106155751", amount: "30.99" }],
    ...overrides,
  });
}

export function failedRefundFixture(overrides: Partial<SanitizedNmiTransactionFixture> = {}) {
  return sanitizedNmiTransactionXml({
    transactionId: "refund-failed-001",
    originalTransactionId: "sale-failed-001",
    condition: "failed",
    currency: "USD",
    actions: [FAILED_ACTION],
    ...overrides,
  });
}

export function returnReferenceRefundFixture(responseText = "RETURN DFYCXZ", overrides: Partial<SanitizedNmiTransactionFixture> = {}) {
  return sanitizedNmiTransactionXml({
    transactionId: "refund-return-001",
    originalTransactionId: "sale-return-001",
    condition: "complete",
    currency: "USD",
    actions: [
      { type: "refund", date: "20260110143508", amount: "-59.48", responseCode: "100", responseText, processorResponseCode: "0", processorResponseText: responseText, batchId: "0" },
      { type: "settle", date: "20260110231147", amount: "-59.48", responseCode: "100", responseText: "CLOSE___1551.24", processorResponseCode: "0", batchId: "867721287", processorBatchId: "8" },
    ],
    ...overrides,
  });
}

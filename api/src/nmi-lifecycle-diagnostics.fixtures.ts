type Action = {
  type: string;
  date?: string;
  amount: string;
  requestedAmount?: string;
  responseCode: string;
  responseText: string;
  processorResponseCode?: string;
  processorResponseText?: string;
  batchId?: string;
  processorBatchId?: string;
};

function actionXml(action: Action) {
  return `<action><action_type>${action.type}</action_type><date>${action.date || "20260501011438"}</date><amount>${action.amount}</amount><requested_amount>${action.requestedAmount || action.amount}</requested_amount><response_code>${action.responseCode}</response_code><response_text>${action.responseText}</response_text><processor_response_code>${action.processorResponseCode || "0"}</processor_response_code><processor_response_text>${action.processorResponseText || action.responseText}</processor_response_text><batch_id>${action.batchId || "SAFE-BATCH"}</batch_id><processor_batch_id>${action.processorBatchId || "SAFE-PROCESSOR-BATCH"}</processor_batch_id></action>`;
}

export function diagnosticTransactionFixture(args: {
  transactionId: string;
  originalTransactionId?: string;
  transactionType?: string;
  condition?: string;
  currency?: string;
  actions: Action[];
}) {
  return `<transaction><transaction_id>${args.transactionId}</transaction_id><order_id>SAFE-${args.transactionId}</order_id>${args.originalTransactionId ? `<original_transaction_id>${args.originalTransactionId}</original_transaction_id>` : ""}<transaction_type>${args.transactionType || "cc"}</transaction_type><condition>${args.condition || "complete"}</condition><currency>${args.currency || "USD"}</currency><actions>${args.actions.map(actionXml).join("")}</actions></transaction>`;
}

/** Sanitized observed shape. It is evidence for diagnostic mechanics, not lifecycle semantics. */
export const blackboxNegativeSettleA = () => diagnosticTransactionFixture({ transactionId: "12006746129", originalTransactionId: "12002859492", actions: [{ type: "settle", amount: "-82.94", responseCode: "100", responseText: "ACCEPTED", batchId: "SHARED-BATCH", processorBatchId: "SHARED-PROCESSOR-BATCH" }] });
export const blackboxNegativeSettleB = () => diagnosticTransactionFixture({ transactionId: "12006747797", originalTransactionId: "12003016116", actions: [{ type: "settle", amount: "-64.94", responseCode: "100", responseText: "ACCEPTED", batchId: "SHARED-BATCH", processorBatchId: "SHARED-PROCESSOR-BATCH" }] });
export const normalPositiveSettle = () => diagnosticTransactionFixture({ transactionId: "SAFE-POSITIVE-SETTLE", actions: [{ type: "settle", amount: "64.94", responseCode: "100", responseText: "ACCEPTED" }] });
export const successfulReturnRefund = () => diagnosticTransactionFixture({ transactionId: "SAFE-RETURN-REFUND", originalTransactionId: "SAFE-SALE", actions: [{ type: "refund", amount: "-10.00", responseCode: "100", responseText: "RETURN ABC123", processorResponseText: "RETURN ABC123" }, { type: "settle", amount: "-10.00", responseCode: "100", responseText: "CLOSE______10.00-" }] });
export const suspectedFraudSale = () => diagnosticTransactionFixture({ transactionId: "SAFE-FRAUD-DECLINE", condition: "failed", actions: [{ type: "sale", amount: "10.00", responseCode: "253", responseText: "Pick up card - SF", processorResponseCode: "59", processorResponseText: "SUSPECTED FRAUD" }] });
export const normalCloseSettlement = () => diagnosticTransactionFixture({ transactionId: "SAFE-CLOSE", actions: [{ type: "sale", amount: "10.00", responseCode: "100", responseText: "APPROVED" }, { type: "settle", amount: "10.00", responseCode: "100", responseText: "CLOSE______10.00" }] });

// Synthetic/unverified-provider-shape fixtures below test diagnostic mechanics only.
export const syntheticChargeback = () => diagnosticTransactionFixture({ transactionId: "SYNTHETIC-CHARGEBACK", actions: [{ type: "adjustment", amount: "-10.00", responseCode: "100", responseText: "chargeback dispute" }] });
export const syntheticRepresentment = () => diagnosticTransactionFixture({ transactionId: "SYNTHETIC-REPRESENTMENT", actions: [{ type: "adjustment", amount: "10.00", responseCode: "100", responseText: "chargeback representment recovered" }] });
export const syntheticAchReturn = () => diagnosticTransactionFixture({ transactionId: "SYNTHETIC-ACH-RETURN", transactionType: "ach", actions: [{ type: "return", amount: "-10.00", responseCode: "100", responseText: "ACH return R01 insufficient funds" }] });
export const syntheticVoid = () => diagnosticTransactionFixture({ transactionId: "SYNTHETIC-VOID", actions: [{ type: "void", amount: "-10.00", responseCode: "100", responseText: "void accepted" }] });

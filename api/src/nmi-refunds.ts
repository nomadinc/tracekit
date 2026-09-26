export type NmiRefundClassification =
  | "REFUND_SUCCEEDED"
  | "REFUND_FAILED"
  | "REFUND_PENDING"
  | "REFUND_AMBIGUOUS";

export type NmiResponseEvidenceClassification =
  | "CERTIFIED_SUCCESS"
  | "CERTIFIED_FAILURE"
  | "NONTERMINAL"
  | "UNKNOWN";

export interface NmiRefundActionEvidence {
  readonly index: number;
  readonly rawXml: string;
  readonly actionTypeRaw: string | null;
  readonly actionType: string | null;
  readonly dateRaw: string | null;
  readonly occurredAt: string | null;
  readonly amountRaw: string | null;
  readonly amount: number | null;
  readonly requestedAmountRaw: string | null;
  readonly requestedAmount: number | null;
  readonly responseCodeRaw: string | null;
  readonly responseCode: string | null;
  readonly responseTextRaw: string | null;
  readonly responseText: string | null;
  readonly processorResponseCodeRaw: string | null;
  readonly processorResponseCode: string | null;
  readonly processorResponseTextRaw: string | null;
  readonly processorResponseText: string | null;
  readonly batchIdRaw: string | null;
  readonly batchId: string | null;
  readonly processorBatchIdRaw: string | null;
  readonly processorBatchId: string | null;
}

export interface NmiRefundEvidence {
  readonly providerAccount: string;
  readonly refundTransactionId: string | null;
  readonly originalTransactionId: string | null;
  readonly transactionConditionRaw: string | null;
  readonly transactionCondition: string | null;
  readonly currencyRaw: string | null;
  readonly currency: string | null;
  readonly actions: readonly NmiRefundActionEvidence[];
  readonly refundActions: readonly NmiRefundActionEvidence[];
  readonly refundActionCount: number;
  readonly settleActions: readonly NmiRefundActionEvidence[];
  readonly settleEvidencePresent: boolean;
  readonly sourceXml: string;
  readonly sourceXmlHash: string;
  readonly sourceEventId: string | null;
}

export interface NmiRefundDecision {
  readonly classification: NmiRefundClassification;
  readonly responseEvidence: NmiResponseEvidenceClassification;
  readonly attemptedAmount: number | null;
  readonly effectiveAmount: number;
  readonly eventCreationEligible: boolean;
  readonly occurredAt: string | null;
  readonly currency: string | null;
  readonly diagnostics: readonly string[];
}

const XML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
});

function decodeXml(value: string) {
  return value.replace(/&(amp|apos|gt|lt|quot);/gi, (_, entity: string) => XML_ENTITIES[entity.toLowerCase()] ?? _);
}

export function nmiXmlValue(block: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(block);
  return match ? decodeXml(match[1].trim()) : null;
}

export function nmiXmlBlocks(xml: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) blocks.push(match[1]);
  return blocks;
}

function normalizedText(value: string | null) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizedLower(value: string | null) {
  return normalizedText(value)?.toLowerCase() ?? null;
}

function normalizedUpper(value: string | null) {
  return normalizedText(value)?.toUpperCase() ?? null;
}

export function parseNmiAmount(value: string | null): number | null {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNmiTimestamp(value: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{14}$/.test(raw)) return null;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}.000Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === iso ? iso : null;
}

function readAction(block: string, index: number): NmiRefundActionEvidence {
  const actionTypeRaw = nmiXmlValue(block, "action_type");
  const dateRaw = nmiXmlValue(block, "date");
  const amountRaw = nmiXmlValue(block, "amount");
  const requestedAmountRaw = nmiXmlValue(block, "requested_amount");
  const responseCodeRaw = nmiXmlValue(block, "response_code");
  const responseTextRaw = nmiXmlValue(block, "response_text");
  const processorResponseCodeRaw = nmiXmlValue(block, "processor_response_code");
  const processorResponseTextRaw = nmiXmlValue(block, "processor_response_text");
  const batchIdRaw = nmiXmlValue(block, "batch_id");
  const processorBatchIdRaw = nmiXmlValue(block, "processor_batch_id");
  return Object.freeze({
    index,
    rawXml: block,
    actionTypeRaw,
    actionType: normalizedLower(actionTypeRaw),
    dateRaw,
    occurredAt: parseNmiTimestamp(dateRaw),
    amountRaw,
    amount: parseNmiAmount(amountRaw),
    requestedAmountRaw,
    requestedAmount: parseNmiAmount(requestedAmountRaw),
    responseCodeRaw,
    responseCode: normalizedUpper(responseCodeRaw),
    responseTextRaw,
    responseText: normalizedUpper(responseTextRaw),
    processorResponseCodeRaw,
    processorResponseCode: normalizedUpper(processorResponseCodeRaw),
    processorResponseTextRaw,
    processorResponseText: normalizedUpper(processorResponseTextRaw),
    batchIdRaw,
    batchId: normalizedText(batchIdRaw),
    processorBatchIdRaw,
    processorBatchId: normalizedText(processorBatchIdRaw),
  });
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function nmiRefundSourceEventId(providerAccount: string, transactionId: string | null) {
  const account = normalizedLower(providerAccount);
  const transaction = normalizedText(transactionId);
  return account && transaction ? `nmi_refund:${account}:${transaction}` : null;
}

export async function parseNmiRefundEvidence(providerAccount: string, transactionXml: string): Promise<NmiRefundEvidence> {
  const actions = Object.freeze(nmiXmlBlocks(transactionXml, "action").map(readAction));
  const refundActions = Object.freeze(actions.filter((action) => action.actionType === "refund"));
  const settleActions = Object.freeze(actions.filter((action) => action.actionType === "settle"));
  const refundTransactionId = normalizedText(nmiXmlValue(transactionXml, "transaction_id"));
  const currencyRaw = nmiXmlValue(transactionXml, "currency");
  const evidence: NmiRefundEvidence = {
    providerAccount: normalizedLower(providerAccount) ?? "",
    refundTransactionId,
    originalTransactionId: normalizedText(nmiXmlValue(transactionXml, "original_transaction_id")),
    transactionConditionRaw: nmiXmlValue(transactionXml, "condition"),
    transactionCondition: normalizedLower(nmiXmlValue(transactionXml, "condition")),
    currencyRaw,
    currency: normalizedUpper(currencyRaw),
    actions,
    refundActions,
    refundActionCount: refundActions.length,
    settleActions,
    settleEvidencePresent: settleActions.length > 0,
    sourceXml: transactionXml,
    sourceXmlHash: await sha256Hex(transactionXml),
    sourceEventId: nmiRefundSourceEventId(providerAccount, refundTransactionId),
  };
  return Object.freeze(evidence);
}

const PENDING_CONDITIONS = new Set(["pending", "pendingsettlement", "pending_settlement", "in_progress"]);

function isProcessorSuccess(action: NmiRefundActionEvidence) {
  const code = action.processorResponseCode;
  const text = action.processorResponseText;
  if (!code || !["0", "00"].includes(code)) return false;
  if (text && /DECLIN|FAIL|ERROR|INVALID/.test(text)) return false;
  return true;
}

function isCertifiedReturnReferenceSuccess(evidence: NmiRefundEvidence, refund: NmiRefundActionEvidence) {
  if (!refund.responseText || !/^RETURN [A-Z0-9]{6}$/.test(refund.responseText)) return false;
  if (refund.responseCode !== "100" || refund.processorResponseCode !== "0" || refund.processorResponseText !== refund.responseText) return false;
  if (evidence.settleActions.length !== 1) return false;
  const settle = evidence.settleActions[0];
  if (settle.responseCode !== "100" || settle.processorResponseCode !== "0") return false;
  if (refund.amount == null || settle.amount == null || settle.amount !== refund.amount) return false;
  if (!refund.occurredAt || !settle.occurredAt || settle.occurredAt < refund.occurredAt) return false;
  return true;
}

export function classifyNmiRefund(evidence: NmiRefundEvidence): NmiRefundDecision {
  const diagnostics: string[] = [];
  if (!evidence.sourceEventId) diagnostics.push("missing_source_identity");
  if (evidence.refundActionCount !== 1) {
    diagnostics.push(evidence.refundActionCount > 1 ? "multiple_refund_actions" : "refund_action_missing");
    return Object.freeze({ classification: "REFUND_AMBIGUOUS", responseEvidence: "UNKNOWN", attemptedAmount: null, effectiveAmount: 0, eventCreationEligible: false, occurredAt: null, currency: evidence.currency, diagnostics: Object.freeze(diagnostics) });
  }

  const action = evidence.refundActions[0];
  const attemptedAmount = action.amount ?? action.requestedAmount;
  if (attemptedAmount == null || attemptedAmount === 0) diagnostics.push("invalid_amount");
  if (!evidence.currency || !/^[A-Z]{3}$/.test(evidence.currency)) diagnostics.push("invalid_currency");
  if (!action.occurredAt) diagnostics.push("invalid_timestamp");

  const approvedSuccessResponse = action.responseCode === "100" && action.responseText === "APPROVED" && isProcessorSuccess(action);
  const returnReferenceSuccess = isCertifiedReturnReferenceSuccess(evidence, action);
  const successResponse = approvedSuccessResponse || returnReferenceSuccess;
  const failedResponse = (
    (action.responseCode === "200" && action.responseText === "DECLINED") ||
    (action.responseCode === "220" && action.responseText === "INVALID CARD #")
  );
  const validEconomics = attemptedAmount != null && attemptedAmount !== 0 && Boolean(evidence.currency && /^[A-Z]{3}$/.test(evidence.currency)) && Boolean(action.occurredAt);

  if (evidence.transactionCondition === "complete" && successResponse && validEconomics && evidence.sourceEventId) {
    return Object.freeze({ classification: "REFUND_SUCCEEDED", responseEvidence: "CERTIFIED_SUCCESS", attemptedAmount: Math.abs(attemptedAmount!), effectiveAmount: -Math.abs(attemptedAmount!), eventCreationEligible: true, occurredAt: action.occurredAt, currency: evidence.currency, diagnostics: Object.freeze(diagnostics) });
  }
  if (evidence.transactionCondition === "failed" && failedResponse) {
    return Object.freeze({ classification: "REFUND_FAILED", responseEvidence: "CERTIFIED_FAILURE", attemptedAmount: attemptedAmount == null ? null : Math.abs(attemptedAmount), effectiveAmount: 0, eventCreationEligible: false, occurredAt: action.occurredAt, currency: evidence.currency, diagnostics: Object.freeze(diagnostics) });
  }
  if (PENDING_CONDITIONS.has(evidence.transactionCondition ?? "") && !action.responseCode && !action.responseText) {
    return Object.freeze({ classification: "REFUND_PENDING", responseEvidence: "NONTERMINAL", attemptedAmount: attemptedAmount == null ? null : Math.abs(attemptedAmount), effectiveAmount: 0, eventCreationEligible: false, occurredAt: action.occurredAt, currency: evidence.currency, diagnostics: Object.freeze(diagnostics) });
  }

  diagnostics.push("uncertified_refund_evidence_combination");
  if (action.responseCode && !["100", "200", "220"].includes(action.responseCode)) diagnostics.push("unknown_response_code");
  return Object.freeze({ classification: "REFUND_AMBIGUOUS", responseEvidence: "UNKNOWN", attemptedAmount: attemptedAmount == null ? null : Math.abs(attemptedAmount), effectiveAmount: 0, eventCreationEligible: false, occurredAt: action.occurredAt, currency: evidence.currency, diagnostics: Object.freeze(diagnostics) });
}

export async function nmiRefundFinancialFingerprint(evidence: NmiRefundEvidence, decision = classifyNmiRefund(evidence)) {
  const action = evidence.refundActionCount === 1 ? evidence.refundActions[0] : null;
  const material: Record<string, unknown> = {
    provider_account: evidence.providerAccount,
    refund_transaction_id: evidence.refundTransactionId,
    original_transaction_id: evidence.originalTransactionId,
    transaction_condition: evidence.transactionCondition,
    currency: evidence.currency,
    refund_action_count: evidence.refundActionCount,
    action_type: action?.actionType ?? null,
    occurred_at: action?.occurredAt ?? null,
    attempted_amount: decision.attemptedAmount,
    effective_amount: decision.effectiveAmount,
    response_code: action?.responseCode ?? null,
    response_text: action?.responseText ?? null,
    processor_response_code: action?.processorResponseCode ?? null,
    processor_response_text: action?.processorResponseText ?? null,
    classification: decision.classification,
  };
  if (action && isCertifiedReturnReferenceSuccess(evidence, action)) {
    const settle = evidence.settleActions[0];
    material.corroborating_settle = {
      action_type: settle.actionType,
      occurred_at: settle.occurredAt,
      amount: settle.amount,
      response_code: settle.responseCode,
      processor_response_code: settle.processorResponseCode,
      batch_id: settle.batchId,
      processor_batch_id: settle.processorBatchId,
    };
  }
  return sha256Hex(stableJson(material));
}

export function cumulativeSuccessfulRefundAmount(decisions: readonly NmiRefundDecision[]) {
  return decisions.filter((decision) => decision.classification === "REFUND_SUCCEEDED").reduce((total, decision) => total + Math.abs(decision.effectiveAmount), 0);
}

export function refundReconciliationState(args: { parentPresent: boolean; canonicalOrderId?: string | null; conflictingFingerprint?: boolean; cumulativeRefund?: number; saleAmount?: number | null }) {
  if (args.conflictingFingerprint) return Object.freeze({ state: "conflict", diagnostic: "financial_fingerprint_conflict" });
  if (args.saleAmount != null && args.cumulativeRefund != null && args.cumulativeRefund > Math.abs(args.saleAmount)) return Object.freeze({ state: "review_required", diagnostic: "cumulative_refund_exceeds_sale" });
  if (!args.parentPresent) return Object.freeze({ state: "unreconciled", diagnostic: "parent_transaction_not_present" });
  return Object.freeze({ state: args.canonicalOrderId ? "reconciled" : "parent_resolved", diagnostic: null });
}

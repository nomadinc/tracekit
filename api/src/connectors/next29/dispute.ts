export type Next29CanonicalDispute = {
  providerDisputeId: string;
  type: "alert" | "chargeback" | "unknown";
  status: "new" | "open" | "resolved" | "unknown";
  resolution: string | null;
  resolutionOtherMessage: string | null;
  amount: number | null;
  currency: string | null;
  reportAmount: number | null;
  reportCurrency: string | null;
  arn: string | null;
  caseNumber: string | null;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  sourceCreatedAt: string | null;
  happenedAt: string | null;
  metadata: Record<string, unknown>;
};

const TYPES = new Set(["alert", "chargeback"]);
const STATUSES = new Set(["new", "open", "resolved"]);
const RESOLUTIONS = new Set([
  "could_not_find_order",
  "declined_or_canceled_nothing_to_do",
  "issued_full_refund",
  "issued_refund_for_remaining_amount",
  "3ds_authorized_successfully",
  "previously_refunded_nothing_to_do",
  "unable_to_refund_merchant_account_closed",
  "won",
  "lost",
  "accepted",
  "other",
]);

export function normalizeNext29Dispute(raw: unknown): Next29CanonicalDispute {
  const source = object(raw);
  const providerDisputeId = requiredId(source.id, "dispute id");
  const type = lower(source.type);
  const status = lower(source.status);
  const resolution = lower(source.resolution);
  return {
    providerDisputeId,
    type: type && TYPES.has(type) ? type as Next29CanonicalDispute["type"] : "unknown",
    status: status && STATUSES.has(status) ? status as Next29CanonicalDispute["status"] : "unknown",
    resolution: resolution && RESOLUTIONS.has(resolution) ? resolution : null,
    resolutionOtherMessage: boundedText(source.resolution_other_message, 500),
    amount: money(source.amount),
    currency: currency(source.currency),
    reportAmount: money(source.report_amount),
    reportCurrency: currency(source.report_currency),
    arn: boundedText(source.arn, 200),
    caseNumber: boundedText(source.case_number, 200),
    providerOrderId: id(source.order),
    providerTransactionId: id(source.transaction),
    sourceCreatedAt: timestamp(source.date_created),
    happenedAt: timestamp(source.happened_at),
    metadata: safeMetadata(source.metadata),
  };
}

export function next29DisputeReconciliationKeys(dispute: Next29CanonicalDispute) {
  return {
    providerTransactionId: dispute.providerTransactionId,
    providerOrderId: dispute.providerOrderId,
    directTransactionKey: dispute.providerTransactionId ? `next29:transaction:${dispute.providerTransactionId}` : null,
    directOrderKey: dispute.providerOrderId ? `next29:order:${dispute.providerOrderId}` : null,
  };
}

export function next29DisputeLifecycleFingerprint(dispute: Next29CanonicalDispute) {
  return [dispute.providerDisputeId, dispute.type, dispute.status, dispute.resolution || "", dispute.amount ?? "", dispute.currency || ""].join(":");
}

function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function lower(value: unknown) { const text = boundedText(value, 200); return text ? text.toLowerCase() : null; }
function boundedText(value: unknown, max: number) { const text = String(value ?? "").trim(); return text && text.length <= max ? text : null; }
function id(value: unknown) { return boundedText(value, 200); }
function requiredId(value: unknown, label: string) { const result = id(value); if (!result) throw new Error(`29Next ${label} is required.`); return result; }
function money(value: unknown) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function currency(value: unknown) { const text = String(value ?? "").trim().toUpperCase(); return /^[A-Z]{3}$/.test(text) ? text : null; }
function timestamp(value: unknown) { const text = boundedText(value, 100); if (!text) return null; const date = new Date(text); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function safeMetadata(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

import {
  classifyNmiRefund,
  nmiRefundFinancialFingerprint,
  parseNmiRefundEvidence,
  sha256Hex,
  stableJson,
  type NmiRefundClassification,
  type NmiResponseEvidenceClassification,
} from "./nmi-refunds.ts";

export type NmiScopeClassification = "SCOPE_RESOLVED" | "SCOPE_PARTIAL" | "SCOPE_MISSING" | "SCOPE_AMBIGUOUS";
export type NmiRefundProposedAction = "ECONOMIC_INSERT" | "EVIDENCE_ONLY" | "QUARANTINE" | "BLOCKED_SCOPE";

export interface NmiScopeEvidence {
  readonly classification: NmiScopeClassification;
  readonly accountId: string | null;
  readonly organizationId: string | null;
  readonly connectionId: string | null;
  readonly providerAccountId: string | null;
  readonly evidence: readonly string[];
}

export interface NmiScopeAuditInput {
  readonly platform: string;
  readonly platformOrderScopes: readonly {
    accountId: string | null;
    organizationId: string | null;
    connectionId: string | null;
    providerAccountId: string | null;
  }[];
  readonly exactConnections: readonly {
    id: string;
    accountId: string;
    organizationId: string;
  }[];
  readonly exactProviderAccounts: readonly {
    id: string;
    connectionId: string;
    organizationId: string;
  }[];
}

export interface NmiRefundDryRunSourceRow {
  readonly platform: string;
  readonly platformOrderId: string;
  readonly transactionId: string | null;
  readonly orderId: string | null;
  readonly canonicalOrderId: string | null;
  readonly transactionXml: string;
}

export interface NmiRefundDryRunItem {
  readonly provider_account: string;
  readonly source_event_id: string;
  readonly refund_transaction_id: string;
  readonly original_transaction_id: string;
  readonly source_xml_hash: string;
  readonly financial_fingerprint: string;
  readonly classification: NmiRefundClassification;
  readonly attempted_amount: number | null;
  readonly effective_amount: number;
  readonly currency: string | null;
  readonly occurred_at: string | null;
  readonly response_evidence: NmiResponseEvidenceClassification;
  readonly parent_present: boolean;
  readonly parent_transaction_id: string;
  readonly canonical_parent_order_id: string | null;
  readonly scope_classification: NmiScopeClassification;
  readonly proposed_future_action: NmiRefundProposedAction;
  readonly diagnostics: readonly string[];
}

export interface NmiRefundDryRunManifest {
  readonly schema_version: "nmi_refund_dry_run_v1";
  readonly items: readonly NmiRefundDryRunItem[];
}

export interface NmiRefundDryRunReport {
  readonly manifest: NmiRefundDryRunManifest;
  readonly manifestHash: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly successfulEconomicTotals: Readonly<Record<string, number>>;
  readonly failedAttemptedTotals: Readonly<Record<string, number>>;
  readonly financialFingerprintConflicts: readonly string[];
}

function aggregateKey(account: string, currency: string | null) {
  return `${account}|${currency ?? "UNKNOWN"}`;
}

function proposedAction(classification: NmiRefundClassification, scope: NmiScopeClassification): NmiRefundProposedAction {
  if (classification === "REFUND_AMBIGUOUS") return "QUARANTINE";
  if (scope !== "SCOPE_RESOLVED") return "BLOCKED_SCOPE";
  return classification === "REFUND_SUCCEEDED" ? "ECONOMIC_INSERT" : "EVIDENCE_ONLY";
}

function uniqueNonNull(values: readonly (string | null)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

export function auditNmiScope(input: NmiScopeAuditInput): NmiScopeEvidence {
  const accountIds = uniqueNonNull(input.platformOrderScopes.map((scope) => scope.accountId));
  const organizationIds = uniqueNonNull(input.platformOrderScopes.map((scope) => scope.organizationId));
  const connectionIds = uniqueNonNull(input.platformOrderScopes.map((scope) => scope.connectionId));
  const providerAccountIds = uniqueNonNull(input.platformOrderScopes.map((scope) => scope.providerAccountId));
  const evidence: string[] = [];
  if (input.platformOrderScopes.length) evidence.push(`platform_orders:${input.platformOrderScopes.length}`);
  if (input.exactConnections.length) evidence.push(`exact_connections:${input.exactConnections.length}`);
  if (input.exactProviderAccounts.length) evidence.push(`exact_provider_accounts:${input.exactProviderAccounts.length}`);

  const ambiguous = [accountIds, organizationIds, connectionIds, providerAccountIds].some((ids) => ids.length > 1)
    || input.exactConnections.length > 1
    || input.exactProviderAccounts.length > 1;
  if (ambiguous) return Object.freeze({ classification: "SCOPE_AMBIGUOUS", accountId: accountIds[0] ?? null, organizationId: organizationIds[0] ?? null, connectionId: connectionIds[0] ?? null, providerAccountId: providerAccountIds[0] ?? null, evidence: Object.freeze([...evidence, "multiple_scope_candidates"]) });

  const connection = input.exactConnections[0] ?? null;
  const providerAccount = input.exactProviderAccounts[0] ?? null;
  const accountId = accountIds[0] ?? connection?.accountId ?? null;
  const organizationId = organizationIds[0] ?? connection?.organizationId ?? providerAccount?.organizationId ?? null;
  const connectionId = connectionIds[0] ?? connection?.id ?? providerAccount?.connectionId ?? null;
  const providerAccountId = providerAccountIds[0] ?? providerAccount?.id ?? null;
  const dimensions = [accountId, organizationId, connectionId, providerAccountId].filter(Boolean).length;
  const consistent = Boolean(
    accountId && organizationId && connectionId && providerAccountId
    && connection
    && providerAccount
    && connection.id === connectionId
    && connection.accountId === accountId
    && connection.organizationId === organizationId
    && providerAccount.id === providerAccountId
    && providerAccount.connectionId === connectionId
    && providerAccount.organizationId === organizationId
  );
  if (consistent) return Object.freeze({ classification: "SCOPE_RESOLVED", accountId, organizationId, connectionId, providerAccountId, evidence: Object.freeze([...evidence, "four_dimension_exact_join_verified"]) });
  if (dimensions > 0) return Object.freeze({ classification: "SCOPE_PARTIAL", accountId, organizationId, connectionId, providerAccountId, evidence: Object.freeze([...evidence, "incomplete_four_dimension_scope"]) });
  return Object.freeze({ classification: "SCOPE_MISSING", accountId: null, organizationId: null, connectionId: null, providerAccountId: null, evidence: Object.freeze([...evidence, "no_deterministic_scope_fields"]) });
}

export async function buildNmiRefundDryRun(args: {
  rows: readonly NmiRefundDryRunSourceRow[];
  parentRows?: readonly Pick<NmiRefundDryRunSourceRow, "platform" | "transactionId" | "canonicalOrderId">[];
  scopes: Readonly<Record<string, NmiScopeEvidence>>;
}): Promise<NmiRefundDryRunReport> {
  const byParent = new Map<string, Pick<NmiRefundDryRunSourceRow, "platform" | "transactionId" | "canonicalOrderId">>();
  for (const row of args.parentRows ?? args.rows) {
    if (row.transactionId) byParent.set(`${row.platform}\u001f${row.transactionId}`, row);
  }

  const items: NmiRefundDryRunItem[] = [];
  for (const row of args.rows) {
    const evidence = await parseNmiRefundEvidence(row.platform, row.transactionXml);
    if (evidence.refundActionCount === 0) continue;
    const decision = classifyNmiRefund(evidence);
    const sourceEventId = evidence.sourceEventId;
    const refundTransactionId = evidence.refundTransactionId;
    const originalTransactionId = evidence.originalTransactionId;
    if (!sourceEventId || !refundTransactionId || !originalTransactionId) {
      throw new Error(`Refund source identity is incomplete for ${row.platform}:${row.platformOrderId}`);
    }
    const parent = byParent.get(`${row.platform}\u001f${originalTransactionId}`) ?? null;
    const scope = args.scopes[row.platform] ?? {
      classification: "SCOPE_MISSING" as const,
      accountId: null,
      organizationId: null,
      connectionId: null,
      providerAccountId: null,
      evidence: ["scope_evidence_not_supplied"],
    };
    items.push(Object.freeze({
      provider_account: row.platform,
      source_event_id: sourceEventId,
      refund_transaction_id: refundTransactionId,
      original_transaction_id: originalTransactionId,
      source_xml_hash: evidence.sourceXmlHash,
      financial_fingerprint: await nmiRefundFinancialFingerprint(evidence, decision),
      classification: decision.classification,
      attempted_amount: decision.attemptedAmount,
      effective_amount: decision.effectiveAmount,
      currency: decision.currency,
      occurred_at: decision.occurredAt,
      response_evidence: decision.responseEvidence,
      parent_present: Boolean(parent),
      parent_transaction_id: originalTransactionId,
      canonical_parent_order_id: parent?.canonicalOrderId ?? null,
      scope_classification: scope.classification,
      proposed_future_action: proposedAction(decision.classification, scope.classification),
      diagnostics: decision.diagnostics,
    }));
  }

  items.sort((left, right) => left.source_event_id.localeCompare(right.source_event_id));
  const sourceGroups = new Map<string, NmiRefundDryRunItem[]>();
  for (const item of items) sourceGroups.set(item.source_event_id, [...(sourceGroups.get(item.source_event_id) ?? []), item]);
  const conflicts = [...sourceGroups.entries()]
    .filter(([, grouped]) => new Set(grouped.map((item) => item.financial_fingerprint)).size > 1)
    .map(([sourceEventId]) => sourceEventId)
    .sort();

  const counts: Record<string, number> = {
    records_scanned: items.length,
    unique_source_ids: sourceGroups.size,
    duplicate_source_ids: [...sourceGroups.values()].reduce((count, grouped) => count + Math.max(0, grouped.length - 1), 0),
    succeeded: 0,
    failed: 0,
    pending: 0,
    ambiguous: 0,
    parent_resolved: 0,
    parent_unresolved: 0,
    scope_resolved: 0,
    scope_partial: 0,
    scope_missing: 0,
    scope_ambiguous: 0,
    economic_inserts_proposed: 0,
    evidence_only_proposed: 0,
    quarantined: 0,
    blocked_by_scope: 0,
    multiple_refund_action_cases: 0,
    unknown_response_code_cases: 0,
    invalid_amount_cases: 0,
    invalid_currency_cases: 0,
    invalid_timestamp_cases: 0,
    financial_fingerprint_conflicts: conflicts.length,
  };
  const successfulEconomicTotals: Record<string, number> = {};
  const failedAttemptedTotals: Record<string, number> = {};
  for (const item of items) {
    const classificationKey = item.classification.replace("REFUND_", "").toLowerCase();
    counts[classificationKey] += 1;
    counts[item.parent_present ? "parent_resolved" : "parent_unresolved"] += 1;
    counts[item.scope_classification.replace("SCOPE_", "scope_").toLowerCase()] += 1;
    const actionKey: Record<NmiRefundProposedAction, string> = { ECONOMIC_INSERT: "economic_inserts_proposed", EVIDENCE_ONLY: "evidence_only_proposed", QUARANTINE: "quarantined", BLOCKED_SCOPE: "blocked_by_scope" };
    counts[actionKey[item.proposed_future_action]] += 1;
    for (const diagnostic of item.diagnostics) {
      const diagnosticKey: Record<string, string | undefined> = {
        multiple_refund_actions: "multiple_refund_action_cases",
        unknown_response_code: "unknown_response_code_cases",
        invalid_amount: "invalid_amount_cases",
        invalid_currency: "invalid_currency_cases",
        invalid_timestamp: "invalid_timestamp_cases",
      };
      const key = diagnosticKey[diagnostic];
      if (key) counts[key] += 1;
    }
    const key = aggregateKey(item.provider_account, item.currency);
    if (item.classification === "REFUND_SUCCEEDED") successfulEconomicTotals[key] = Number(((successfulEconomicTotals[key] ?? 0) + Math.abs(item.effective_amount)).toFixed(2));
    if (item.classification === "REFUND_FAILED" && item.attempted_amount != null) failedAttemptedTotals[key] = Number(((failedAttemptedTotals[key] ?? 0) + Math.abs(item.attempted_amount)).toFixed(2));
  }

  const manifest = Object.freeze({ schema_version: "nmi_refund_dry_run_v1" as const, items: Object.freeze(items) });
  return Object.freeze({
    manifest,
    manifestHash: await sha256Hex(stableJson(manifest)),
    counts: Object.freeze(counts),
    successfulEconomicTotals: Object.freeze(Object.fromEntries(Object.entries(successfulEconomicTotals).sort())),
    failedAttemptedTotals: Object.freeze(Object.fromEntries(Object.entries(failedAttemptedTotals).sort())),
    financialFingerprintConflicts: Object.freeze(conflicts),
  });
}

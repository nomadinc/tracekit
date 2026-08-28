import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const RESOURCE = "everflow_conversions";
export const EVERFLOW_INCREMENTAL_OVERLAP_DAYS = 2;
export const EVERFLOW_INCREMENTAL_BOOTSTRAP_DAYS = 2;

type Row = Record<string, unknown>;

const text = (value: unknown) => value === null || value === undefined ? null : String(value);

function dayStart(date: Date) {
  return `${date.toISOString().slice(0, 10)} 00:00:00`;
}

function dayEnd(date: Date) {
  return `${date.toISOString().slice(0, 10)} 23:59:59`;
}

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 86_400_000);
}

export type EverflowIncrementalState = {
  id: string | null;
  lastSuccessfulAt: string | null;
  latestProviderTransactionAt: string | null;
  status: string;
};

export async function loadEverflowIncrementalState(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
}): Promise<EverflowIncrementalState> {
  const rows = await commercePersistenceRequest(
    `commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}&select=id,last_successful_at,latest_provider_transaction_at,status&limit=1`,
  );
  const row = rows[0] || {};
  return {
    id: text(row.id),
    lastSuccessfulAt: text(row.last_successful_at),
    latestProviderTransactionAt: text(row.latest_provider_transaction_at),
    status: text(row.status) || "unknown",
  };
}

export function everflowIncrementalWindow(input: {
  now: Date;
  lastSuccessfulAt?: string | null;
  overlapDays?: number;
  bootstrapDays?: number;
}) {
  const overlapDays = Math.min(7, Math.max(1, Math.trunc(input.overlapDays ?? EVERFLOW_INCREMENTAL_OVERLAP_DAYS)));
  const bootstrapDays = Math.min(7, Math.max(1, Math.trunc(input.bootstrapDays ?? EVERFLOW_INCREMENTAL_BOOTSTRAP_DAYS)));
  const parsed = input.lastSuccessfulAt ? Date.parse(input.lastSuccessfulAt) : NaN;
  const anchor = Number.isFinite(parsed) ? new Date(parsed) : subtractDays(input.now, bootstrapDays - 1);
  const fromDate = subtractDays(anchor, overlapDays);
  const maxFrom = subtractDays(input.now, 30);
  const boundedFrom = fromDate < maxFrom ? maxFrom : fromDate;
  return {
    from: dayStart(boundedFrom),
    to: dayEnd(input.now),
    overlapDays,
    bootstrap: !Number.isFinite(parsed),
  };
}

async function latestProviderTransactionAt(input: { connectionId: string; providerAccountId: string }) {
  const rows = await commercePersistenceRequest(
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&ingestion_method=eq.api&select=conversion_at&order=conversion_at.desc&limit=1`,
  );
  return text(rows[0]?.conversion_at);
}

export async function markEverflowIncrementalAttempt(input: {
  accountId: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  attemptedAt: string;
}) {
  const row = {
    account_id: input.accountId,
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    resource: RESOURCE,
    last_attempted_at: input.attemptedAt,
    normalizer_version: "everflow-conversion-v1",
    evidence_contract_version: "everflow-raw-v1",
    status: "unknown",
    attribution_source_state: "available",
    recent_source_ids: [],
    page_fingerprints: {},
    last_stability_boundary: {},
    warnings: [],
    updated_at: input.attemptedAt,
  };
  await commercePersistenceRequest(
    "commerce_continuous_sync_state?on_conflict=connection_id,provider_account_id,resource",
    { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) },
  );
}

export async function markEverflowIncrementalSuccess(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  completedAt: string;
  syncRunId: string;
  from: string;
  to: string;
  overlapDays: number;
  seen: number;
}) {
  const latest = await latestProviderTransactionAt(input);
  await commercePersistenceRequest(
    `commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        last_successful_at: input.completedAt,
        last_provider_observation_at: input.completedAt,
        last_normalized_record_at: input.completedAt,
        latest_provider_transaction_at: latest,
        provider_total_observed: input.seen,
        last_stability_boundary: {
          providerFrom: input.from,
          providerTo: input.to,
          overlapDays: input.overlapDays,
          syncRunId: input.syncRunId,
        },
        last_stopping_reason: "window_complete",
        status: "current",
        warnings: [],
        updated_at: input.completedAt,
      }),
    },
  );
}

export async function markEverflowIncrementalFailure(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  failedAt: string;
  warningCode: string;
}) {
  await commercePersistenceRequest(
    `commerce_continuous_sync_state?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&resource=eq.${RESOURCE}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "failed",
        last_stopping_reason: "sync_failed",
        warnings: [{ code: input.warningCode }],
        updated_at: input.failedAt,
      }),
    },
  );
}

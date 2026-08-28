import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type Row = Record<string, unknown>;

export type EverflowFinancialState = {
  sourceIdentity: string;
  providerAccountId: string;
  evidenceId: string | null;
  payloadHash: string;
  status: string | null;
  revenue: number;
  payout: number;
  conversionId: string;
  transactionId: string | null;
  conversionAt: string;
  isEvent: boolean;
  eventName: string | null;
};

const text = (value: unknown) => value === null || value === undefined ? null : String(value);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const approved = (status: string | null) => String(status || "").toLowerCase() === "approved";

function state(row: Row): EverflowFinancialState {
  return {
    sourceIdentity: String(row.source_identity),
    providerAccountId: String(row.provider_account_id),
    evidenceId: text(row.evidence_id),
    payloadHash: String(row.payload_hash),
    status: text(row.status),
    revenue: number(row.revenue),
    payout: number(row.payout),
    conversionId: String(row.conversion_id),
    transactionId: text(row.transaction_id),
    conversionAt: String(row.conversion_at),
    isEvent: Boolean(row.is_event),
    eventName: text(row.event_name),
  };
}

export async function captureEverflowFinancialBaseline(connectionId: string) {
  const rows = await commercePersistenceRequest(
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(connectionId)}&ingestion_method=eq.api&select=source_identity,provider_account_id,evidence_id,payload_hash,status,revenue,payout,conversion_id,transaction_id,conversion_at,is_event,event_name`,
  );
  return new Map(rows.map((row) => [String(row.source_identity), state(row)]));
}

function transition(previous: EverflowFinancialState | undefined, current: EverflowFinancialState) {
  if (!previous) return approved(current.status) ? "approved" : "observed";
  if (previous.payloadHash === current.payloadHash) return "unchanged";
  const wasApproved = approved(previous.status);
  const isApproved = approved(current.status);
  if (wasApproved && !isApproved && String(current.status || "").toLowerCase() === "rejected") return "reversal";
  if (!wasApproved && isApproved && String(previous.status || "").toLowerCase() === "rejected") return "reinstated";
  if (!wasApproved && isApproved) return "approved";
  if (wasApproved && !isApproved) return "rejected";
  return "updated";
}

export async function persistEverflowEventReversalHistory(input: {
  organizationId: string;
  connectionId: string;
  syncRunId: string;
  providerAccountId: string;
  baseline: Map<string, EverflowFinancialState>;
}) {
  const rows = await commercePersistenceRequest(
    `everflow_conversion_events?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&sync_run_id=eq.${encodeURIComponent(input.syncRunId)}&ingestion_method=eq.api&select=source_identity,provider_account_id,evidence_id,payload_hash,status,revenue,payout,conversion_id,transaction_id,conversion_at,is_event,event_name`,
  );
  const current = rows.map(state);
  if (!current.length) return { observations: 0, events: 0, reversals: 0, reinstatements: 0, revenueDelta: 0, payoutDelta: 0 };
  const now = new Date().toISOString();
  const history = current.map((item) => {
    const previous = input.baseline.get(item.sourceIdentity);
    const previousEffectiveRevenue = previous && approved(previous.status) ? previous.revenue : 0;
    const previousEffectivePayout = previous && approved(previous.status) ? previous.payout : 0;
    const effectiveRevenue = approved(item.status) ? item.revenue : 0;
    const effectivePayout = approved(item.status) ? item.payout : 0;
    return {
      organization_id: input.organizationId,
      connection_id: input.connectionId,
      provider_account_id: input.providerAccountId,
      sync_run_id: input.syncRunId,
      evidence_id: item.evidenceId,
      source_identity: item.sourceIdentity,
      conversion_id: item.conversionId,
      transaction_id: item.transactionId,
      conversion_at: item.conversionAt,
      is_event: item.isEvent,
      event_name: item.eventName,
      previous_status: previous?.status || null,
      status: item.status,
      transition_type: transition(previous, item),
      payload_hash: item.payloadHash,
      previous_payload_hash: previous?.payloadHash || null,
      revenue: item.revenue,
      payout: item.payout,
      effective_revenue: effectiveRevenue,
      effective_payout: effectivePayout,
      revenue_delta: effectiveRevenue - previousEffectiveRevenue,
      payout_delta: effectivePayout - previousEffectivePayout,
      first_seen_at: now,
      last_seen_at: now,
      observation_count: 1,
    };
  });
  await commercePersistenceRequest(
    "everflow_conversion_state_history?on_conflict=connection_id,provider_account_id,source_identity,payload_hash",
    { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(history) },
  );
  const changed = history.filter((row) => row.transition_type !== "unchanged");
  return {
    observations: history.length,
    events: history.filter((row) => row.is_event).length,
    reversals: history.filter((row) => row.transition_type === "reversal").length,
    reinstatements: history.filter((row) => row.transition_type === "reinstated").length,
    revenueDelta: changed.reduce((sum, row) => sum + Number(row.revenue_delta || 0), 0),
    payoutDelta: changed.reduce((sum, row) => sum + Number(row.payout_delta || 0), 0),
  };
}

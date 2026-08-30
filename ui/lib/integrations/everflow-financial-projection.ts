import "server-only";
import { randomUUID } from "node:crypto";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type Row = Record<string, unknown>;

type LatestEverflowState = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  sourceIdentity: string;
  conversionId: string;
  transactionId: string | null;
  conversionAt: string;
  isEvent: boolean;
  eventName: string | null;
  status: string | null;
  revenue: number;
  saleAmount: number;
  payout: number;
  currency: string | null;
  payloadHash: string;
};

type OrderMapping = {
  id: string;
  providerAccountId: string;
  sourceObjectId: string;
  canonicalOrderId: string;
};

type CanonicalOrder = {
  canonicalOrderId: string;
  workspaceId: string | null;
  orderId: string | null;
  platform: string | null;
  currency: string | null;
};

type StateHistory = {
  id: string;
  providerAccountId: string;
  sourceIdentity: string;
  transitionType: string;
  payoutDelta: number;
  status: string | null;
  eventName: string | null;
  isEvent: boolean;
  payloadHash: string;
  firstSeenAt: string;
};

const text = (value: unknown) => value === null || value === undefined ? null : String(value);
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const bool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";

function latestState(row: Row): LatestEverflowState {
  return {
    organizationId: String(row.organization_id),
    connectionId: String(row.connection_id),
    providerAccountId: String(row.provider_account_id),
    sourceIdentity: String(row.source_identity),
    conversionId: String(row.conversion_id),
    transactionId: text(row.transaction_id),
    conversionAt: String(row.conversion_at),
    isEvent: bool(row.is_event),
    eventName: text(row.event_name),
    status: text(row.status)?.toLowerCase() || null,
    revenue: number(row.revenue),
    saleAmount: number(row.sale_amount),
    payout: number(row.payout),
    currency: text(row.currency)?.toUpperCase() || null,
    payloadHash: String(row.payload_hash),
  };
}

function isCommerceValue(state: LatestEverflowState) {
  return state.revenue !== 0 || state.saleAmount !== 0;
}

function mapping(row: Row): OrderMapping {
  return {
    id: String(row.id),
    providerAccountId: String(row.provider_account_id),
    sourceObjectId: String(row.source_object_id),
    canonicalOrderId: String(row.canonical_object_id),
  };
}

function canonicalOrder(row: Row): CanonicalOrder {
  return {
    canonicalOrderId: String(row.canonical_order_id),
    workspaceId: text(row.workspace_id),
    orderId: text(row.order_id ?? row.platform_order_id),
    platform: text(row.platform),
    currency: text(row.currency)?.toUpperCase() || null,
  };
}

function history(row: Row): StateHistory {
  return {
    id: String(row.id),
    providerAccountId: String(row.provider_account_id),
    sourceIdentity: String(row.source_identity),
    transitionType: String(row.transition_type),
    payoutDelta: number(row.payout_delta),
    status: text(row.status)?.toLowerCase() || null,
    eventName: text(row.event_name),
    isEvent: bool(row.is_event),
    payloadHash: String(row.payload_hash),
    firstSeenAt: String(row.first_seen_at),
  };
}

function baselineKey(sourceIdentity: string) {
  return `everflow:affiliate_payout:baseline:${sourceIdentity}`;
}

function transitionKey(stateHistoryId: string) {
  return `everflow:affiliate_payout:state:${stateHistoryId}`;
}

async function insertLedgerRow(input: {
  state: LatestEverflowState;
  mapping: OrderMapping;
  order: CanonicalOrder;
  idempotencyKey: string;
  amount: number;
  sourceAmount: number;
  occurredAt: string;
  reason: string;
  transitionType: string;
  stateHistoryId?: string | null;
}) {
  const row = {
    id: randomUUID(),
    account_id: null,
    organization_id: input.state.organizationId,
    connection_id: input.state.connectionId,
    provider_account_id: input.state.providerAccountId,
    source_mapping_id: input.mapping.id,
    evidence_id: null,
    canonical_order_id: input.order.canonicalOrderId,
    tkid: null,
    email: null,
    phone: null,
    click_ids: {},
    network: "everflow",
    source_system: "everflow",
    transaction_id: input.state.transactionId,
    order_id: input.order.orderId,
    external_id: input.state.conversionId,
    status: input.state.status,
    amount: input.amount,
    currency: input.state.currency || input.order.currency,
    offer_id: null,
    campaign_id: null,
    affiliate_id: null,
    sub1: null,
    sub2: null,
    sub3: null,
    sub4: null,
    sub5: null,
    meta: {
      everflow: {
        sourceIdentity: input.state.sourceIdentity,
        conversionId: input.state.conversionId,
        eventName: input.state.eventName,
        isEvent: input.state.isEvent,
        transitionType: input.transitionType,
        payloadHash: input.state.payloadHash,
        stateHistoryId: input.stateHistoryId || null,
      },
    },
    ts: input.occurredAt,
    site_key: null,
    ledger_type: "affiliate_payout",
    parent_transaction_id: null,
    platform: input.order.platform,
    workspace_id: input.order.workspaceId,
    reason: input.reason,
    raw: null,
    occurred_at: input.occurredAt,
    received_at: new Date().toISOString(),
    cost_category: "affiliate_payout",
    fee_type: null,
    event_source: "everflow",
    ingestion_method: "api_sync",
    connector_id: input.state.connectionId,
    processor_account_id: null,
    source_event_id: input.stateHistoryId || input.state.sourceIdentity,
    dispute_id: null,
    source_amount: input.sourceAmount,
    source_direction: "cost",
    diagnostic_flags: [],
    idempotency_key: input.idempotencyKey,
    reconciliation_state: "reconciled",
    data_quality_state: "verified",
  };

  const rows = await commercePersistenceRequest(
    "conversions?on_conflict=organization_id,connection_id,provider_account_id,idempotency_key",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(row),
    },
  );
  return rows.length > 0;
}

export async function projectEverflowFinancialEffects(input: {
  organizationId: string;
  connectionId: string;
  syncRunId: string;
}) {
  const latestRows = await commercePersistenceRequest(
    `everflow_conversion_events?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&sync_run_id=eq.${encodeURIComponent(input.syncRunId)}&ingestion_method=eq.api&select=organization_id,connection_id,provider_account_id,source_identity,conversion_id,transaction_id,conversion_at,is_event,event_name,status,revenue,sale_amount,payout,currency,payload_hash`,
  );
  const states = latestRows.map(latestState);
  if (!states.length) return {
    eligible: 0,
    projected: 0,
    skippedUnmapped: 0,
    skippedNonOrder: 0,
    skippedUnmatchedCommerce: 0,
    skippedZeroEffect: 0,
    alreadyProjected: 0,
  };

  const providerAccountIds = Array.from(new Set(states.map((state) => state.providerAccountId)));
  const mappingRows = await commercePersistenceRequest(
    `commerce_source_mappings?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&source_object_type=eq.everflow_conversion&canonical_object_type=eq.order&provider_account_id=in.(${providerAccountIds.map(encodeURIComponent).join(",")})&select=id,provider_account_id,source_object_id,canonical_object_id`,
  );
  const mappings = mappingRows.map(mapping);
  const mappingBySource = new Map(mappings.map((item) => [`${item.providerAccountId}:${item.sourceObjectId}`, item]));

  const mappedStates = states.flatMap((state) => {
    const found = mappingBySource.get(`${state.providerAccountId}:${state.conversionId}`);
    return found ? [{ state, mapping: found }] : [];
  });
  const unmappedStates = states.filter((state) => !mappingBySource.has(`${state.providerAccountId}:${state.conversionId}`));
  const skippedNonOrder = unmappedStates.filter((state) => !isCommerceValue(state)).length;
  const skippedUnmatchedCommerce = unmappedStates.length - skippedNonOrder;
  const skippedUnmapped = unmappedStates.length;
  if (!mappedStates.length) return {
    eligible: 0,
    projected: 0,
    skippedUnmapped,
    skippedNonOrder,
    skippedUnmatchedCommerce,
    skippedZeroEffect: 0,
    alreadyProjected: 0,
  };

  const orderIds = Array.from(new Set(mappedStates.map(({ mapping: item }) => item.canonicalOrderId)));
  const orderRows = await commercePersistenceRequest(
    `platform_orders?organization_id=eq.${encodeURIComponent(input.organizationId)}&canonical_order_id=in.(${orderIds.map(encodeURIComponent).join(",")})&select=canonical_order_id,workspace_id,order_id,platform_order_id,platform,currency`,
  );
  const orders = orderRows.map(canonicalOrder);
  const orderById = new Map(orders.map((order) => [order.canonicalOrderId, order]));

  const existingRows = await commercePersistenceRequest(
    `conversions?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=in.(${providerAccountIds.map(encodeURIComponent).join(",")})&event_source=eq.everflow&ledger_type=eq.affiliate_payout&select=provider_account_id,idempotency_key`,
  );
  const existingKeys = new Set(existingRows.map((row) => `${String(row.provider_account_id)}:${String(row.idempotency_key)}`));

  const historyRows = await commercePersistenceRequest(
    `everflow_conversion_state_history?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&sync_run_id=eq.${encodeURIComponent(input.syncRunId)}&select=id,provider_account_id,source_identity,transition_type,payout_delta,status,event_name,is_event,payload_hash,first_seen_at`,
  );
  const histories = historyRows.map(history);
  const historyBySource = new Map<string, StateHistory[]>();
  for (const item of histories) {
    const key = `${item.providerAccountId}:${item.sourceIdentity}`;
    const list = historyBySource.get(key) || [];
    list.push(item);
    historyBySource.set(key, list);
  }

  let eligible = 0;
  let projected = 0;
  let skippedZeroEffect = 0;
  let alreadyProjected = 0;

  for (const { state, mapping: sourceMapping } of mappedStates) {
    const order = orderById.get(sourceMapping.canonicalOrderId);
    if (!order) continue;
    eligible += 1;
    const baseKey = baselineKey(state.sourceIdentity);
    const scopedBaseKey = `${state.providerAccountId}:${baseKey}`;
    const hasBaseline = existingKeys.has(scopedBaseKey);

    if (!hasBaseline) {
      const effectivePayout = state.status === "approved" ? state.payout : 0;
      if (effectivePayout === 0) {
        skippedZeroEffect += 1;
        continue;
      }
      const inserted = await insertLedgerRow({
        state,
        mapping: sourceMapping,
        order,
        idempotencyKey: baseKey,
        amount: -effectivePayout,
        sourceAmount: effectivePayout,
        occurredAt: state.conversionAt,
        reason: "Everflow affiliate payout observed",
        transitionType: "baseline",
      });
      if (inserted) {
        projected += 1;
        existingKeys.add(scopedBaseKey);
      } else {
        alreadyProjected += 1;
      }
      continue;
    }

    const currentHistory = historyBySource.get(`${state.providerAccountId}:${state.sourceIdentity}`) || [];
    for (const stateChange of currentHistory) {
      if (stateChange.payoutDelta === 0) continue;
      const key = transitionKey(stateChange.id);
      const scopedKey = `${state.providerAccountId}:${key}`;
      if (existingKeys.has(scopedKey)) {
        alreadyProjected += 1;
        continue;
      }
      const inserted = await insertLedgerRow({
        state,
        mapping: sourceMapping,
        order,
        idempotencyKey: key,
        amount: -stateChange.payoutDelta,
        sourceAmount: stateChange.payoutDelta,
        occurredAt: stateChange.firstSeenAt,
        reason: stateChange.transitionType === "reversal"
          ? "Everflow affiliate payout reversed"
          : stateChange.transitionType === "reinstatement"
            ? "Everflow affiliate payout reinstated"
            : "Everflow affiliate payout adjusted",
        transitionType: stateChange.transitionType,
        stateHistoryId: stateChange.id,
      });
      if (inserted) {
        projected += 1;
        existingKeys.add(scopedKey);
      } else {
        alreadyProjected += 1;
      }
    }
  }

  return {
    eligible,
    projected,
    skippedUnmapped,
    skippedNonOrder,
    skippedUnmatchedCommerce,
    skippedZeroEffect,
    alreadyProjected,
  };
}

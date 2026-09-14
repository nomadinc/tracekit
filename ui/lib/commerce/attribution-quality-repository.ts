import "server-only";
import type { aggregateCommasAttributionQuality } from "./attribution-quality";
import { commercePersistenceCount, commercePersistenceRequest } from "./supabase-control-repository";

type Aggregate = ReturnType<typeof aggregateCommasAttributionQuality>;
type Conflict = Aggregate["conflicts"][number] & {
  classification: string;
  fieldDiagnostics: Record<"transactionIdentity" | "affiliateId" | "sub1" | "sub4", string>;
};
export type QualityFilters = { from?: string; to?: string; comparison?: string; alias?: string; ord?: string; derivation?: "live" | "reconciled" };
const id = (value: unknown) => String(value || "");
const nullable = (value: unknown) => typeof value === "string" && value.length ? value : null;

/** Service-role GET RPCs are STABLE and SECURITY INVOKER. They only SELECT. */
function scopedQuery(scope: { organizationId: string; connectionId: string; providerAccountId: string }, filters: QualityFilters) {
  const query = new URLSearchParams({ p_organization_id: scope.organizationId, p_connection_id: scope.connectionId,
    p_provider_account_id: scope.providerAccountId });
  const parameterNames = { from: "p_from", to: "p_to", comparison: "p_comparison", alias: "p_alias", ord: "p_ord" } as const;
  for (const [key, parameter] of Object.entries(parameterNames)) {
    const value = filters[key as keyof typeof parameterNames];
    if (value) query.set(parameter, value);
  }
  if (filters.derivation) query.set("p_derivation", filters.derivation === "live" ? "LIVE_V2" : "RECONCILED_FROM_EVIDENCE");
  return query;
}

async function readAggregate(scope: { organizationId: string; connectionId: string; providerAccountId: string }, filters: QualityFilters) {
  const query = scopedQuery(scope, filters);
  const rows = await commercePersistenceRequest(`rpc/read_commas_attribution_quality_v1?${query}`);
  if (rows.length !== 1 || rows[0].mode !== "SHADOW_MEASUREMENT" || rows[0].creditImpact !== "NONE")
    throw new Error("Attribution quality aggregate unavailable.");
  return rows[0] as unknown as Aggregate & { currentEverflow: Record<string, number>; paymentPathAvailability: string;
    initialMatchState: string; identityLatency: string; maturity: Aggregate["maturity"] & { measurementEpochAt: string | null } };
}

async function readConflicts(scope: { organizationId: string; connectionId: string; providerAccountId: string }, filters: QualityFilters) {
  const query = scopedQuery(scope, filters);
  query.set("p_limit", "50");
  query.set("p_offset", "0");
  const rows = await commercePersistenceRequest(`rpc/read_commas_attribution_conflicts_v1?${query}`);
  return rows as unknown as Conflict[];
}

export async function readCommasAttributionQuality(organizationId: string, filters: QualityFilters = {}) {
  const connections = await commercePersistenceRequest(`commerce_provider_connections?organization_id=eq.${organizationId}&provider=eq.commas&status=eq.connected&select=id&limit=2`);
  if (!connections.length) return { kind: "unavailable" as const };
  if (connections.length !== 1) throw new Error("Attribution quality requires a single selected Commas connection.");
  const connectionId = id(connections[0].id);
  const accounts = await commercePersistenceRequest(`commerce_provider_accounts?organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&status=eq.active&select=id&limit=2`);
  if (accounts.length !== 1) throw new Error("Attribution quality requires a single active Commas account.");
  const providerAccountId = id(accounts[0].id);
  const scope = { organizationId, connectionId, providerAccountId };
  const restScope = `organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${providerAccountId}`;
  const [aggregate, conflicts, numericMappings, ordMappings, recentRuns, latestOrder] = await Promise.all([
    readAggregate(scope, filters), readConflicts(scope, filters),
    commercePersistenceCount(`commerce_source_mappings?${restScope}&source_object_type=eq.transaction&state=eq.active&select=id`),
    commercePersistenceCount(`commerce_source_mappings?${restScope}&source_object_type=eq.commas_public_transaction&state=eq.active&select=id`),
    commercePersistenceRequest(`commerce_sync_runs?${restScope}&sync_type=eq.transactions&select=id,status,started_at,completed_at,lease_expires_at,records_seen,records_created&order=created_at.desc&limit=2`),
    commercePersistenceRequest(`platform_orders?${restScope}&select=order_ts&order=order_ts.desc&limit=1`),
  ]);
  const report = { ...aggregate, conflicts };
  return { kind: "available" as const, organizationId, connectionId, providerAccountId, filters, report,
    ingestion: {
      latestRun: recentRuns[0] ? { status: id(recentRuns[0].status), startedAt: nullable(recentRuns[0].started_at),
        completedAt: nullable(recentRuns[0].completed_at), leaseExpiresAt: nullable(recentRuns[0].lease_expires_at),
        recordsSeen: Number(recentRuns[0].records_seen || 0), recordsCreated: Number(recentRuns[0].records_created || 0) } : null,
      latestOrderAt: latestOrder[0] ? nullable(latestOrder[0].order_ts) : null,
      numericMappings, ordMappings, ordProjectionGap: numericMappings - ordMappings,
    },
  };
}

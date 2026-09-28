import "server-only";

import { commercePersistenceCount, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type OrganizationInput = { id: string; name: string; agencyId: string | null; accountId: string };

export type ClientHealthRow = OrganizationInput & {
  connectionCount: number;
  connectionState: "healthy" | "attention" | "none";
  latestConnectionSuccessAt: string | null;
  unresolvedFinancialEvents: number;
  attentionCount: number;
};

export async function readClientHealth(organizations: OrganizationInput[]): Promise<ClientHealthRow[]> {
  return Promise.all(organizations.map(readOne));
}

async function readOne(organization: OrganizationInput): Promise<ClientHealthRow> {
  const id = encodeURIComponent(organization.id);
  const [connections, unresolvedRefunds, unresolvedChargebacks] = await Promise.all([
    commercePersistenceRequest(
      `commerce_provider_connections?organization_id=eq.${id}&select=id,status,last_success_at,last_error_at,last_error_code`,
    ).catch(() => []),
    unresolvedCount(organization.id, "refund"),
    unresolvedCount(organization.id, "chargeback"),
  ]);

  const latestSuccess = connections
    .map((row) => row.last_success_at ? String(row.last_success_at) : null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;
  const degraded = connections.filter((row) => String(row.status) !== "connected" || Boolean(row.last_error_at)).length;
  const connectionState: ClientHealthRow["connectionState"] =
    !connections.length ? "none" : degraded ? "attention" : "healthy";
  const unresolvedFinancialEvents = unresolvedRefunds + unresolvedChargebacks;

  return {
    ...organization,
    connectionCount: connections.length,
    connectionState,
    latestConnectionSuccessAt: latestSuccess,
    unresolvedFinancialEvents,
    attentionCount: degraded + unresolvedFinancialEvents,
  };
}

async function unresolvedCount(organizationId: string, ledgerType: "refund" | "chargeback") {
  const organization = encodeURIComponent(organizationId);
  return commercePersistenceCount(
    `conversions?organization_id=eq.${organization}&ledger_type=eq.${ledgerType}&reconciliation_state=neq.reconciled&select=id`,
  ).catch(() => 0);
}

import "server-only";

type Row = Record<string, unknown>;

export class MarketingPersistenceError extends Error {
  constructor(readonly status: number, readonly databaseCode: string) {
    super("Marketing persistence failed.");
  }
}

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Marketing persistence is unavailable.");
  return { url, key };
}

export async function marketingPersistenceRequest(path: string, init: RequestInit = {}) {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const code = String(payload.code || "database_request_failed")
      .replace(/[^a-z0-9_.-]/gi, "_")
      .slice(0, 80);
    throw new MarketingPersistenceError(response.status, code);
  }
  if (response.status === 204) return [] as Row[];
  const payload = await response.json() as unknown;
  return (Array.isArray(payload) ? payload : [payload]) as Row[];
}

export type MarketingProviderConnection = {
  id: string;
  organizationId: string;
  accountId: string;
  provider: string;
  providerIdentityId: string | null;
  displayName: string;
  status: string;
  reauthorizationRequired: boolean;
  capabilities: Record<string, unknown>;
};

export type MarketingProviderAccount = {
  id: string;
  connectionId: string;
  provider: string;
  externalId: string;
  label: string | null;
  parentProviderAccountId: string | null;
  accountType: "manager" | "advertiser" | "hybrid" | "unknown";
  hierarchyDepth: number | null;
  isManager: boolean;
  eligibleForSpendSync: boolean;
  currency: string | null;
  timezoneName: string | null;
  status: string;
  selectedForSync: boolean;
  metadata: Record<string, unknown>;
};

export function marketingConnectionFromRow(row: Row): MarketingProviderConnection {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    accountId: String(row.account_id),
    provider: String(row.provider),
    providerIdentityId: row.provider_identity_id ? String(row.provider_identity_id) : null,
    displayName: String(row.display_name || row.provider || "Advertising"),
    status: String(row.status || "draft"),
    reauthorizationRequired: Boolean(row.reauthorization_required),
    capabilities: row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {},
  };
}

export function marketingAccountFromRow(row: Row): MarketingProviderAccount {
  const accountType = String(row.account_type || "unknown") as MarketingProviderAccount["accountType"];
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    provider: String(row.provider),
    externalId: String(row.provider_account_external_id),
    label: row.provider_account_label ? String(row.provider_account_label) : null,
    parentProviderAccountId: row.parent_provider_account_id ? String(row.parent_provider_account_id) : null,
    accountType,
    hierarchyDepth: row.hierarchy_depth === null || row.hierarchy_depth === undefined ? null : Number(row.hierarchy_depth),
    isManager: Boolean(row.is_manager),
    eligibleForSpendSync: Boolean(row.eligible_for_spend_sync),
    currency: row.currency ? String(row.currency) : null,
    timezoneName: row.timezone_name ? String(row.timezone_name) : null,
    status: String(row.status || "active"),
    selectedForSync: Boolean(row.selected_for_sync),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
  };
}

export async function listMarketingConnections(organizationId: string, provider?: string) {
  const providerFilter = provider ? `&provider=eq.${encodeURIComponent(provider)}` : "";
  const rows = await marketingPersistenceRequest(
    `marketing_provider_connections?organization_id=eq.${encodeURIComponent(organizationId)}${providerFilter}&status=neq.revoked&order=created_at.asc`,
  );
  return rows.map(marketingConnectionFromRow);
}

export async function listMarketingProviderAccounts(organizationId: string, connectionId: string) {
  const rows = await marketingPersistenceRequest(
    `marketing_provider_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${encodeURIComponent(connectionId)}&order=hierarchy_depth.asc,provider_account_label.asc`,
  );
  return rows.map(marketingAccountFromRow);
}

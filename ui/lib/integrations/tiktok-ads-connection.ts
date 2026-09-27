import "server-only";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { fetchTikTokAdvertiserAccounts } from "./tiktok-ads-account-discovery";
import { exchangeTikTokAuthorizationCode, TikTokOAuthError, verifyTikTokOAuthState } from "./tiktok-ads-oauth";
import { persistTikTokConnectionAuthorization, persistTikTokDiscoveredAccounts } from "./tiktok-ads-persistence";
import { listMarketingConnections, listMarketingProviderAccounts, marketingPersistenceRequest } from "./marketing-provider-repository";

function requireManager(session: TraceKitSessionContext) {
  if (!session.activeOrganization || !session.effectivePermissions.includes("connectors.manage")) {
    throw new TikTokOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  }
  return session.activeOrganization;
}

function uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export async function completeTikTokOAuth(input: {
  session: TraceKitSessionContext;
  state: string;
  code: string;
  advertiserInfoEndpoint: string;
  exchangeCode?: typeof exchangeTikTokAuthorizationCode;
  discoverAccounts?: typeof fetchTikTokAdvertiserAccounts;
  persistAuthorization?: typeof persistTikTokConnectionAuthorization;
  persistAccounts?: typeof persistTikTokDiscoveredAccounts;
}) {
  const organization = requireManager(input.session);
  verifyTikTokOAuthState(input.state, {
    organizationId: organization.id,
    accountId: input.session.activeAccount.id,
    userId: input.session.user.id,
  });

  // Complete provider validation/discovery before durable writes. Connecting
  // TikTok alone must never activate spend ingestion.
  const token = await (input.exchangeCode || exchangeTikTokAuthorizationCode)(input.code);
  if (!token.advertiserIds.length) {
    throw new TikTokOAuthError("tiktok_no_advertisers_authorized", "TikTok did not authorize any advertiser accounts.", 409);
  }
  const discovered = await (input.discoverAccounts || fetchTikTokAdvertiserAccounts)({
    accessToken: token.accessToken,
    advertiserIds: token.advertiserIds,
    endpoint: input.advertiserInfoEndpoint,
  });
  if (!discovered.length) {
    throw new TikTokOAuthError("tiktok_advertiser_discovery_empty", "TikTok advertiser discovery returned no usable accounts.", 409);
  }

  // The authorization itself is the provider identity boundary. Use a stable
  // advertiser-set identity until TikTok live certification exposes a stronger
  // authorized-user identity contract.
  const providerIdentityId = [...token.advertiserIds].sort().join(",");
  const connection = await (input.persistAuthorization || persistTikTokConnectionAuthorization)({
    accountId: input.session.activeAccount.id,
    organizationId: organization.id,
    providerIdentityId,
    displayName: discovered.length === 1 ? (discovered[0].name || "TikTok Ads") : `TikTok Ads (${discovered.length} advertisers)`,
    accessToken: token.accessToken,
    grantedScopes: token.scope,
  });

  try {
    const accounts = await (input.persistAccounts || persistTikTokDiscoveredAccounts)({
      accountId: input.session.activeAccount.id,
      organizationId: organization.id,
      connectionId: connection.id,
      accounts: discovered,
    });
    return {
      connectionId: connection.id,
      provider: "tiktok_ads",
      discoveredAccountCount: accounts.length,
      selectedAccountCount: accounts.filter((row: any) => Boolean(row.selected_for_sync)).length,
      accounts,
    };
  } catch (error) {
    const now = new Date().toISOString();
    await marketingPersistenceRequest(
      `marketing_provider_connections?id=eq.${encodeURIComponent(connection.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`,
      { method: "PATCH", body: JSON.stringify({ status: "degraded", last_error_at: now, last_error_code: "tiktok_account_persistence_failed", updated_at: now }) },
    ).catch(() => undefined);
    throw error;
  }
}

export async function getTikTokConnectionPresentation(session: TraceKitSessionContext) {
  const organization = requireManager(session);
  const connections = await listMarketingConnections(organization.id, "tiktok_ads");
  return Promise.all(connections.map(async connection => {
    const accounts = await listMarketingProviderAccounts(organization.id, connection.id);
    return {
      connectionId: connection.id,
      displayName: connection.displayName,
      status: connection.status,
      reauthorizationRequired: connection.reauthorizationRequired,
      connected: connection.status === "connected" && accounts.length > 0,
      accountCount: accounts.length,
      selectedAccountCount: accounts.filter(account => account.selectedForSync).length,
      accounts,
    };
  }));
}

export async function setTikTokAccountSelection(input: { session: TraceKitSessionContext; connectionId: string; accountIds: string[] }) {
  const organization = requireManager(input.session);
  if (!uuid(input.connectionId) || input.accountIds.length > 1000 || input.accountIds.some(id => !uuid(id))) {
    throw new TikTokOAuthError("invalid_request", "TikTok account selection is invalid.");
  }
  const connections = await listMarketingConnections(organization.id, "tiktok_ads");
  if (!connections.some(connection => connection.id === input.connectionId)) {
    throw new TikTokOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  }
  const accounts = await listMarketingProviderAccounts(organization.id, input.connectionId);
  const allowed = new Set(accounts.filter(account => account.eligibleForSpendSync && account.status !== "revoked").map(account => account.id));
  if (input.accountIds.some(id => !allowed.has(id))) throw new TikTokOAuthError("invalid_request", "TikTok account selection is invalid.");

  const selected = new Set(input.accountIds);
  const updated = [];
  for (const account of accounts) {
    const rows = await marketingPersistenceRequest(
      `marketing_provider_accounts?id=eq.${encodeURIComponent(account.id)}&organization_id=eq.${encodeURIComponent(organization.id)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
      { method: "PATCH", body: JSON.stringify({ selected_for_sync: selected.has(account.id), updated_at: new Date().toISOString() }) },
    );
    if (rows[0]) updated.push(rows[0]);
  }
  return updated;
}

import "server-only";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import {
  META_REQUIRED_SCOPES,
  MetaOAuthError,
  discoverMetaAdAccounts,
  exchangeMetaAuthorizationCode,
  getMetaGrantedScopes,
  getMetaIdentity,
  verifyMetaOAuthState,
} from "./meta-oauth";
import {
  listMetaAccounts,
  listMetaConnections,
  marketingPersistenceRequest,
  replaceMetaCredential,
  selectMetaAccounts,
  upsertDiscoveredMetaAccounts,
  upsertMetaConnection,
} from "./marketing-provider-repository";

function requireMetaManager(session: TraceKitSessionContext) {
  if (!session.activeOrganization || !session.effectivePermissions.includes("connectors.manage")) {
    throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  }
  return session.activeOrganization;
}

export async function completeMetaOAuth(input: {
  session: TraceKitSessionContext;
  state: string;
  code: string;
}) {
  const organization = requireMetaManager(input.session);
  verifyMetaOAuthState(input.state, { organizationId: organization.id, userId: input.session.user.id });

  // Complete all provider-side validation/discovery before making persistence writes.
  const token = await exchangeMetaAuthorizationCode(input.code);
  const [identity, grantedScopes, discoveredAccounts] = await Promise.all([
    getMetaIdentity(token.accessToken),
    getMetaGrantedScopes(token.accessToken),
    discoverMetaAdAccounts(token.accessToken),
  ]);
  const missingScopes = META_REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  if (missingScopes.length) throw new MetaOAuthError("meta_required_permission_missing", "Meta did not grant the required advertising read permission.", 403);

  const connected = await upsertMetaConnection({
    accountId: input.session.activeAccount.id,
    organizationId: organization.id,
    identity,
    grantedScopes,
  });

  try {
    await replaceMetaCredential({ organizationId: organization.id, connectionId: connected.connection.id, token, grantedScopes });
    const accounts = await upsertDiscoveredMetaAccounts({
      accountId: input.session.activeAccount.id,
      organizationId: organization.id,
      connectionId: connected.connection.id,
      accounts: discoveredAccounts,
    });
    return {
      connectionId: connected.connection.id,
      reconnected: connected.reconnected,
      identity: { id: identity.id, name: identity.name },
      grantedScopes: grantedScopes.slice().sort(),
      discoveredAccountCount: accounts.length,
      accounts,
    };
  } catch (error) {
    const now = new Date().toISOString();
    await marketingPersistenceRequest(
      `marketing_provider_connections?id=eq.${encodeURIComponent(connected.connection.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`,
      { method: "PATCH", body: JSON.stringify({ status: "degraded", last_error_at: now, last_error_code: "meta_connection_persistence_failed", updated_at: now }) },
    ).catch(() => undefined);
    throw error;
  }
}

export async function getMetaConnectionPresentation(session: TraceKitSessionContext) {
  const organization = requireMetaManager(session);
  const connections = await listMetaConnections(organization.id);
  const rows = [];
  for (const connection of connections) {
    const accounts = await listMetaAccounts(organization.id, connection.id);
    rows.push({
      connectionId: connection.id,
      displayName: connection.displayName,
      status: connection.status,
      reauthorizationRequired: connection.reauthorizationRequired,
      providerIdentityId: connection.providerIdentityId,
      connected: connection.status === "connected" && accounts.length > 0,
      accountCount: accounts.length,
      selectedAccountCount: accounts.filter((account) => account.selectedForSync).length,
      accounts,
    });
  }
  return rows;
}

export async function getMetaAccountsForConnection(session: TraceKitSessionContext, connectionId: string) {
  const organization = requireMetaManager(session);
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) throw new MetaOAuthError("invalid_request", "A valid Meta connection is required.");
  const connections = await listMetaConnections(organization.id);
  if (!connections.some((connection) => connection.id === connectionId)) throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  return listMetaAccounts(organization.id, connectionId);
}

export async function setMetaAccountSelection(input: {
  session: TraceKitSessionContext;
  connectionId: string;
  accountIds: string[];
}) {
  const organization = requireMetaManager(input.session);
  if (!/^[0-9a-f-]{36}$/i.test(input.connectionId)) throw new MetaOAuthError("invalid_request", "A valid Meta connection is required.");
  if (input.accountIds.length > 1000 || input.accountIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new MetaOAuthError("invalid_request", "Meta account selection is invalid.");
  const connections = await listMetaConnections(organization.id);
  if (!connections.some((connection) => connection.id === input.connectionId)) throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  return selectMetaAccounts({ organizationId: organization.id, connectionId: input.connectionId, selectedAccountIds: input.accountIds });
}

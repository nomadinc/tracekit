import "server-only";
import type { CommerceConnection, CommerceControlPlane } from "@/lib/commerce/control-plane";
import { SupabaseCommerceControlRepository } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { getEverflowNetworkIdentity, type EverflowNetworkIdentity } from "./everflow-client";

type EverflowConnectionPlane = Pick<
  CommerceControlPlane,
  | "listConnections"
  | "listProviderAccounts"
  | "createConnection"
  | "upsertProviderAccount"
  | "credentialStatus"
  | "createCredential"
  | "rotateCredential"
  | "markConnectionConnected"
  | "markConnectionDegraded"
  | "updateConnection"
>;

export type EverflowPersistedNetworkMetadata = {
  networkId: string;
  customerId: string | null;
  name: string;
  displayedName: string | null;
  identifier: string | null;
  accountStatus: string | null;
  timezoneId: number | null;
  currencyId: string | null;
  lastVerifiedAt: string;
};

function networkMetadata(network: EverflowNetworkIdentity): EverflowPersistedNetworkMetadata {
  return {
    networkId: network.networkId,
    customerId: network.customerId,
    name: network.name,
    displayedName: network.displayedName,
    identifier: network.identifier,
    accountStatus: network.accountStatus,
    timezoneId: network.timezoneId,
    currencyId: network.currencyId,
    lastVerifiedAt: new Date().toISOString(),
  };
}

async function persistNetworkCapabilities(connection: CommerceConnection, metadata: EverflowPersistedNetworkMetadata) {
  const repository = new SupabaseCommerceControlRepository();
  return repository.updateConnection(connection.id, connection.organizationId, {
    capabilities: {
      ...(connection.capabilities || {}),
      everflowNetwork: metadata,
      verified: ["network_identity"],
    },
  });
}

export async function connectEverflowNetwork(input: {
  plane: EverflowConnectionPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  apiKey: string;
  networkId?: string | null;
  displayName?: string | null;
  setupRequestId?: string | null;
  correlationId?: string | null;
  healthCheck?: typeof getEverflowNetworkIdentity;
  persistMetadata?: (connection: CommerceConnection, metadata: EverflowPersistedNetworkMetadata) => Promise<unknown>;
}): Promise<{ connectionId: string; providerAccountId: string; network: EverflowNetworkIdentity; status: "connected"; reconnected: boolean }> {
  const healthCheck = input.healthCheck || getEverflowNetworkIdentity;
  const network = await healthCheck({
    apiKey: input.apiKey,
    networkId: input.networkId,
    correlationId: input.correlationId,
  });
  const persistMetadata = input.persistMetadata || persistNetworkCapabilities;

  const existingConnections = await input.plane.listConnections(input.session, input.organizationId);
  for (const connection of existingConnections) {
    if (connection.provider.toLowerCase() !== "everflow" || connection.status === "revoked") continue;
    const accounts = await input.plane.listProviderAccounts(input.session, connection.id);
    const account = accounts.find((candidate) => candidate.externalId === network.networkId && candidate.status !== "disabled");
    if (!account) continue;

    try {
      const credential = await input.plane.credentialStatus(input.session, connection.id);
      if (credential.status === "active") await input.plane.rotateCredential(input.session, connection.id, input.apiKey);
      else await input.plane.createCredential(input.session, connection.id, input.apiKey);
      if (input.displayName?.trim()) {
        await input.plane.updateConnection(input.session, connection.id, { displayName: input.displayName.trim().slice(0, 100) });
      }
      await persistMetadata(connection, networkMetadata(network));
      await input.plane.markConnectionConnected(input.session, connection.id);
      return { connectionId: connection.id, providerAccountId: account.id, network, status: "connected", reconnected: true };
    } catch (error) {
      await input.plane.markConnectionDegraded(input.session, connection.id).catch(() => undefined);
      throw error;
    }
  }

  const displayName = String(input.displayName || network.displayedName || network.name || `Everflow ${network.networkId}`)
    .trim()
    .slice(0, 100);
  const connection = await input.plane.createConnection(input.session, input.organizationId, {
    provider: "everflow",
    displayName: displayName || `Everflow ${network.networkId}`,
    environment: "production",
    setupRequestId: input.setupRequestId || undefined,
  });

  try {
    const account = await input.plane.upsertProviderAccount(input.session, connection.id, {
      externalId: network.networkId,
      status: "active",
    });
    const credential = await input.plane.credentialStatus(input.session, connection.id);
    if (credential.status === "missing") await input.plane.createCredential(input.session, connection.id, input.apiKey);
    else await input.plane.rotateCredential(input.session, connection.id, input.apiKey);
    await persistMetadata(connection, networkMetadata(network));
    await input.plane.markConnectionConnected(input.session, connection.id);
    return { connectionId: connection.id, providerAccountId: account.id, network, status: "connected", reconnected: false };
  } catch (error) {
    await input.plane.markConnectionDegraded(input.session, connection.id).catch(() => undefined);
    throw error;
  }
}

export async function getEverflowConnectionStatus(input: {
  plane: Pick<CommerceControlPlane, "listConnections" | "listProviderAccounts" | "credentialStatus">;
  session: TraceKitSessionContext;
  organizationId: string;
}) {
  const connections = (await input.plane.listConnections(input.session, input.organizationId))
    .filter((connection) => connection.provider.toLowerCase() === "everflow" && connection.status !== "revoked");

  const rows = await Promise.all(connections.map(async (connection) => {
    const accounts = await input.plane.listProviderAccounts(input.session, connection.id);
    const credential = await input.plane.credentialStatus(input.session, connection.id);
    const metadata = (connection.capabilities?.everflowNetwork || null) as EverflowPersistedNetworkMetadata | null;
    const account = accounts.find((candidate) => candidate.status !== "disabled") || accounts[0] || null;
    return {
      connectionId: connection.id,
      displayName: connection.displayName,
      environment: connection.environment,
      status: connection.status,
      credentialStatus: credential.status,
      networkId: account?.externalId || metadata?.networkId || null,
      network: metadata,
      lastVerifiedAt: metadata?.lastVerifiedAt || connection.lastSuccessAt || null,
      connected: connection.status === "connected" && credential.status === "active" && Boolean(account),
    };
  }));

  rows.sort((a, b) => String(b.lastVerifiedAt || "").localeCompare(String(a.lastVerifiedAt || "")));
  return rows;
}

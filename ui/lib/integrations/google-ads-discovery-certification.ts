import "server-only";
import type { GoogleHierarchyFetcher } from "./google-ads-hierarchy-client";
import { discoverGoogleCustomerHierarchy } from "./google-ads-hierarchy-client";
import {
  persistGoogleConnectionAuthorization,
  persistGoogleDiscoveredAccounts,
  type MarketingRepositoryTransport,
} from "./google-ads-persistence";

type CertificationConnection = {
  accountId: string;
  organizationId: string;
  providerIdentityId: string;
  displayName: string;
  refreshToken: string;
  accessibleCustomerIds: string[];
};

export async function runGoogleAdsDiscoveryCertification(input: {
  connections: CertificationConnection[];
  grantedScopes: string[];
  encryptionKey: string;
  encryptionKeyId: string;
  transport: MarketingRepositoryTransport;
  fetchHierarchy: GoogleHierarchyFetcher;
  maxQueries?: number;
  maxAccounts?: number;
}) {
  const outputs = [];

  for (const source of input.connections) {
    // Discovery is completed before account persistence. If traversal is bounded,
    // malformed, or otherwise incomplete, no partial provider-account tree is written.
    const discovery = await discoverGoogleCustomerHierarchy({
      accessibleCustomerIds: source.accessibleCustomerIds,
      fetchHierarchy: input.fetchHierarchy,
      maxQueries: input.maxQueries,
      maxAccounts: input.maxAccounts,
    });

    const connection = await persistGoogleConnectionAuthorization({
      accountId: source.accountId,
      organizationId: source.organizationId,
      providerIdentityId: source.providerIdentityId,
      displayName: source.displayName,
      refreshToken: source.refreshToken,
      grantedScopes: input.grantedScopes,
      encryptionKey: input.encryptionKey,
      encryptionKeyId: input.encryptionKeyId,
      transport: input.transport,
    });

    const accounts = await persistGoogleDiscoveredAccounts({
      accountId: source.accountId,
      organizationId: source.organizationId,
      connectionId: connection.id,
      accounts: discovery.accounts,
      transport: input.transport,
    });

    outputs.push({
      connectionId: connection.id,
      providerIdentityId: source.providerIdentityId,
      discoveredAccountCount: discovery.accounts.length,
      persistedAccountCount: accounts.length,
    });
  }

  return { connections: outputs };
}

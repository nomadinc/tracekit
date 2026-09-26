import assert from "node:assert/strict";
import test from "node:test";
import { runGoogleAdsDiscoveryCertification } from "../lib/integrations/google-ads-discovery-certification";
import type { MarketingRepositoryTransport } from "../lib/integrations/google-ads-persistence";

function repositoryTransport() {
  const rows = {
    connections: [] as any[],
    credentials: [] as any[],
    accounts: [] as any[],
  };
  let seq = 0;
  const transport: MarketingRepositoryTransport = async (path, init = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    if (path.startsWith("marketing_provider_connections?") && method === "GET") return [];
    if (path === "marketing_provider_connections" && method === "POST") {
      const row = { id: `conn-${++seq}`, ...body }; rows.connections.push(row); return [row];
    }
    if (path === "marketing_provider_credentials" && method === "POST") {
      const row = { id: `cred-${rows.credentials.length + 1}`, ...body }; rows.credentials.push(row); return [row];
    }
    if (path.startsWith("marketing_provider_accounts?") && method === "GET") {
      const match = /connection_id=eq\.([^&]+)/.exec(path);
      return rows.accounts.filter((row) => row.connection_id === decodeURIComponent(match?.[1] || ""));
    }
    if (path === "marketing_provider_accounts" && method === "POST") {
      const row = { id: `acct-${++seq}`, ...body }; rows.accounts.push(row); return [row];
    }
    if (path.startsWith("marketing_provider_accounts?") && method === "PATCH") {
      const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(path)?.[1] || "");
      const row = rows.accounts.find((item) => item.id === id);
      Object.assign(row, body); return row ? [row] : [];
    }
    return [];
  };
  return { transport, rows };
}

test("full fixture pipeline certifies two Google connections and nested MCC account isolation", async () => {
  const repo = repositoryTransport();
  const result = await runGoogleAdsDiscoveryCertification({
    connections: [
      {
        accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-a",
        displayName: "Google A", refreshToken: "refresh-a", accessibleCustomerIds: ["1000000001"],
      },
      {
        accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-b",
        displayName: "Google B", refreshToken: "refresh-b", accessibleCustomerIds: ["2000000002"],
      },
    ],
    grantedScopes: ["https://www.googleapis.com/auth/adwords"],
    encryptionKey: Buffer.alloc(32, 7).toString("base64"),
    encryptionKeyId: "marketing-key",
    transport: repo.transport,
    fetchHierarchy: async ({ targetCustomerId, loginCustomerId }) => {
      if (targetCustomerId === "1000000001") return [
        { customerId: "1000000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "MCC A", currencyCode: "USD", timeZone: "UTC" },
        { customerId: "1100000001", parentCustomerId: "1000000001", level: 1, manager: false, descriptiveName: "A Client", currencyCode: "USD", timeZone: "UTC" },
        { customerId: "1200000001", parentCustomerId: "1000000001", level: 1, manager: true, descriptiveName: "A Sub MCC", currencyCode: "USD", timeZone: "UTC" },
      ];
      if (targetCustomerId === "1200000001") return [
        { customerId: "1200000001", parentCustomerId: null, level: 0, manager: true, descriptiveName: "A Sub MCC", currencyCode: "USD", timeZone: "UTC" },
        { customerId: "1210000001", parentCustomerId: "1200000001", level: 1, manager: false, descriptiveName: "A Nested Client", currencyCode: "USD", timeZone: "UTC" },
      ];
      if (targetCustomerId === "2000000002") return [
        { customerId: "2000000002", parentCustomerId: null, level: 0, manager: true, descriptiveName: "MCC B", currencyCode: "USD", timeZone: "UTC" },
        { customerId: "2100000002", parentCustomerId: "2000000002", level: 1, manager: false, descriptiveName: "B Client", currencyCode: "USD", timeZone: "UTC" },
      ];
      throw new Error(`unexpected hierarchy query ${targetCustomerId} via ${loginCustomerId}`);
    },
  });

  assert.equal(result.connections.length, 2);
  assert.notEqual(result.connections[0].connectionId, result.connections[1].connectionId);
  assert.equal(repo.rows.credentials.length, 2);
  assert.equal(repo.rows.accounts.filter((row) => row.connection_id === result.connections[0].connectionId).length, 4);
  assert.equal(repo.rows.accounts.filter((row) => row.connection_id === result.connections[1].connectionId).length, 2);

  const nested = repo.rows.accounts.find((row) => row.provider_account_external_id === "1210000001")!;
  const parent = repo.rows.accounts.find((row) => row.provider_account_external_id === "1200000001")!;
  assert.equal(nested.parent_provider_account_id, parent.id);
  assert.equal(nested.eligible_for_spend_sync, true);
  assert.equal(parent.eligible_for_spend_sync, false);
  assert.equal(repo.rows.accounts.some((row) => row.selected_for_sync), false);

  const serializedCredentials = JSON.stringify(repo.rows.credentials);
  assert.doesNotMatch(serializedCredentials, /refresh-a|refresh-b/);
});

test("certification fails closed and persists no partial account tree when hierarchy discovery exceeds bounds", async () => {
  const repo = repositoryTransport();
  await assert.rejects(() => runGoogleAdsDiscoveryCertification({
    connections: [{
      accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-a",
      displayName: "Google A", refreshToken: "refresh-a", accessibleCustomerIds: ["1000000001"],
    }],
    grantedScopes: ["https://www.googleapis.com/auth/adwords"],
    encryptionKey: Buffer.alloc(32, 8).toString("base64"),
    encryptionKeyId: "marketing-key",
    transport: repo.transport,
    maxQueries: 1,
    fetchHierarchy: async ({ targetCustomerId }) => [
      { customerId: targetCustomerId, parentCustomerId: null, level: 0, manager: true, descriptiveName: "MCC", currencyCode: "USD", timeZone: "UTC" },
      { customerId: "1200000001", parentCustomerId: targetCustomerId, level: 1, manager: true, descriptiveName: "Sub MCC", currencyCode: "USD", timeZone: "UTC" },
    ],
  }), /discovery bound exceeded/i);
  assert.equal(repo.rows.accounts.length, 0);
});

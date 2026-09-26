import assert from "node:assert/strict";
import test from "node:test";
import {
  persistGoogleConnectionAuthorization,
  persistGoogleDiscoveredAccounts,
  type MarketingRepositoryTransport,
} from "../lib/integrations/google-ads-persistence";
import type { GoogleDiscoveredAccount } from "../lib/integrations/google-ads-account-discovery";

function transport() {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  let connectionSeq = 0;
  const fn: MarketingRepositoryTransport = async (path, init = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    if (path.startsWith("marketing_provider_connections?") && method === "GET") return [];
    if (path === "marketing_provider_connections" && method === "POST") return [{ id: `conn-${++connectionSeq}`, ...body }];
    if (path.startsWith("marketing_provider_credentials?") && method === "GET") return [];
    if (path === "marketing_provider_credentials" && method === "POST") return [{ id: "cred-1", ...body }];
    if (path.startsWith("marketing_provider_accounts?") && method === "GET") return [];
    if (path === "marketing_provider_accounts" && method === "POST") return [{ id: `acct-${body.provider_account_external_id}`, ...body }];
    if (path.startsWith("marketing_provider_accounts?") && method === "PATCH") return [{ id: "updated", ...body }];
    return [];
  };
  return { fn, calls };
}

test("separate Google authorizations create separate connections rather than workspace singleton", async () => {
  const a = transport();
  const first = await persistGoogleConnectionAuthorization({
    accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-1",
    displayName: "Google — One", refreshToken: "refresh-one", grantedScopes: ["scope"], transport: a.fn,
    encryptionKey: Buffer.alloc(32, 1).toString("base64"), encryptionKeyId: "marketing-key",
  });
  const second = await persistGoogleConnectionAuthorization({
    accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-2",
    displayName: "Google — Two", refreshToken: "refresh-two", grantedScopes: ["scope"], transport: a.fn,
    encryptionKey: Buffer.alloc(32, 2).toString("base64"), encryptionKeyId: "marketing-key",
  });
  assert.notEqual(first.id, second.id);
  assert.equal(a.calls.filter((call) => call.path === "marketing_provider_connections").length, 2);
});

test("refresh token is encrypted once at connection level and never written to provider accounts", async () => {
  const t = transport();
  const connection = await persistGoogleConnectionAuthorization({
    accountId: "owner-1", organizationId: "org-1", providerIdentityId: "google-user-1",
    displayName: "Google", refreshToken: "super-secret-refresh", grantedScopes: ["scope"], transport: t.fn,
    encryptionKey: Buffer.alloc(32, 3).toString("base64"), encryptionKeyId: "marketing-key",
  });
  const credential = t.calls.find((call) => call.path === "marketing_provider_credentials")!;
  assert.equal(credential.body.credential_type, "oauth_refresh_token");
  assert.ok(credential.body.secret_ciphertext);
  assert.doesNotMatch(JSON.stringify(credential.body), /super-secret-refresh/);

  const accounts: GoogleDiscoveredAccount[] = [{
    customerId: "1234567890", parentCustomerId: null, accountType: "manager", hierarchyDepth: 0,
    isManager: true, eligibleForSpendSync: false, descriptiveName: "MCC", currencyCode: "USD",
    timeZone: "UTC", loginCustomerIds: ["1234567890"],
  }];
  await persistGoogleDiscoveredAccounts({ accountId: "owner-1", organizationId: "org-1", connectionId: connection.id, accounts, transport: t.fn });
  const accountWrite = t.calls.find((call) => call.path === "marketing_provider_accounts")!;
  assert.doesNotMatch(JSON.stringify(accountWrite.body), /refresh|secret_ciphertext/i);
});

test("nested discovered accounts persist parent row IDs and all login contexts", async () => {
  const t = transport();
  const accounts: GoogleDiscoveredAccount[] = [
    { customerId: "1000000001", parentCustomerId: null, accountType: "manager", hierarchyDepth: 0, isManager: true, eligibleForSpendSync: false, descriptiveName: "Root", currencyCode: "USD", timeZone: "UTC", loginCustomerIds: ["1000000001"] },
    { customerId: "1200000001", parentCustomerId: "1000000001", accountType: "manager", hierarchyDepth: 1, isManager: true, eligibleForSpendSync: false, descriptiveName: "Sub", currencyCode: "USD", timeZone: "UTC", loginCustomerIds: ["1000000001", "1200000001"] },
    { customerId: "1210000001", parentCustomerId: "1200000001", accountType: "advertiser", hierarchyDepth: 2, isManager: false, eligibleForSpendSync: true, descriptiveName: "Client", currencyCode: "USD", timeZone: "UTC", loginCustomerIds: ["1000000001", "1200000001"] },
  ];
  await persistGoogleDiscoveredAccounts({ accountId: "owner-1", organizationId: "org-1", connectionId: "conn-1", accounts, transport: t.fn });
  const writes = t.calls.filter((call) => call.path === "marketing_provider_accounts");
  assert.equal(writes.length, 3);
  assert.equal(writes[1].body.parent_provider_account_id, "acct-1000000001");
  assert.equal(writes[2].body.parent_provider_account_id, "acct-1200000001");
  assert.deepEqual(writes[2].body.metadata.google.loginCustomerIds, ["1000000001", "1200000001"]);
  assert.equal(writes[2].body.eligible_for_spend_sync, true);
});

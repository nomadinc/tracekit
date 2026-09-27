import "server-only";
import { decodeCommerceCredentialKey, encryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import type { TikTokAdvertiserAccount } from "./tiktok-ads-account-discovery";
import { marketingConnectionFromRow, marketingPersistenceRequest, type MarketingProviderConnection } from "./marketing-provider-repository";

type Row = Record<string, unknown>;
export type TikTokMarketingTransport = (path: string, init?: RequestInit) => Promise<Row[]>;

function bytea(value: Uint8Array) { return `\\x${Buffer.from(value).toString("hex")}`; }

export async function persistTikTokConnectionAuthorization(input: {
  accountId: string; organizationId: string; providerIdentityId: string; displayName: string;
  accessToken: string; grantedScopes: string[]; transport?: TikTokMarketingTransport;
  encryptionKey?: string; encryptionKeyId?: string;
}): Promise<MarketingProviderConnection> {
  const transport = input.transport || marketingPersistenceRequest;
  const existing = await transport(`marketing_provider_connections?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider=eq.tiktok_ads&provider_identity_id=eq.${encodeURIComponent(input.providerIdentityId)}&status=neq.revoked&limit=1`);
  if (existing[0]) throw new Error("TikTok Ads authorization is already connected.");

  const now = new Date().toISOString();
  const rows = await transport("marketing_provider_connections", { method: "POST", body: JSON.stringify({
    account_id: input.accountId, organization_id: input.organizationId, provider: "tiktok_ads",
    display_name: input.displayName.slice(0, 100), environment: "production", status: "connected",
    provider_identity_id: input.providerIdentityId,
    capabilities: { tiktokAds: { grantedScopes: input.grantedScopes.slice().sort(), advertiserDiscovery: true, automaticSpendSync: false } },
    reauthorization_required: false, last_success_at: now,
  }) });
  if (!rows[0]) throw new Error("TikTok Ads connection could not be persisted.");
  const connection = marketingConnectionFromRow(rows[0]);

  const key = decodeCommerceCredentialKey(input.encryptionKey ?? process.env.MARKETING_CREDENTIALS_ENC_KEY);
  const keyId = input.encryptionKeyId ?? String(process.env.MARKETING_CREDENTIALS_KEY_ID || "").trim();
  if (!keyId) throw new Error("Marketing credential encryption is unavailable.");
  const encrypted = await encryptCommerceCredential(input.accessToken, key, keyId, 1);

  const credentials = await transport("marketing_provider_credentials", { method: "POST", body: JSON.stringify({
    organization_id: input.organizationId, connection_id: connection.id, credential_type: "oauth_access_token",
    storage_backend: "database_encrypted", encryption_key_id: encrypted.keyId,
    encryption_version: encrypted.encryptionVersion, secret_iv: bytea(encrypted.iv),
    secret_ciphertext: bytea(encrypted.ciphertext),
    public_metadata: { grantedScopes: input.grantedScopes.slice().sort(), provider: "tiktok_ads", createdFromOAuth: true },
  }) });
  if (!credentials[0]) throw new Error("TikTok Ads credential could not be persisted.");
  return connection;
}

export async function persistTikTokDiscoveredAccounts(input: {
  accountId: string; organizationId: string; connectionId: string; accounts: TikTokAdvertiserAccount[];
  transport?: TikTokMarketingTransport;
}) {
  const transport = input.transport || marketingPersistenceRequest;
  const existing = await transport(`marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.tiktok_ads&order=created_at.asc`);
  const byExternal = new Map(existing.map(row => [String(row.provider_account_external_id), row]));
  const now = new Date().toISOString();
  const persisted: Row[] = [];

  for (const account of input.accounts) {
    const body = {
      account_id: input.accountId, organization_id: input.organizationId, connection_id: input.connectionId,
      provider: "tiktok_ads", provider_account_external_id: account.advertiserId,
      provider_account_label: account.name, parent_provider_account_id: null, account_type: "advertiser",
      hierarchy_depth: 0, is_manager: false, eligible_for_spend_sync: true,
      currency: account.currency, timezone_name: account.timezoneName, status: "active",
      last_discovered_at: now, metadata: { tiktok: { advertiserId: account.advertiserId, providerStatus: account.status } },
      updated_at: now,
    };
    const current = byExternal.get(account.advertiserId);
    const rows = current
      ? await transport(`marketing_provider_accounts?id=eq.${encodeURIComponent(String(current.id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`, { method: "PATCH", body: JSON.stringify(body) })
      : await transport("marketing_provider_accounts", { method: "POST", body: JSON.stringify({ ...body, selected_for_sync: false, first_discovered_at: now }) });
    if (!rows[0]) throw new Error("TikTok advertiser account could not be persisted.");
    persisted.push(rows[0]);
  }
  return persisted;
}

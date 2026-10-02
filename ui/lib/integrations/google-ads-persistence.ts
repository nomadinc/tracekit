import "server-only";
import { decodeCommerceCredentialKey, encryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import type { GoogleDiscoveredAccount } from "./google-ads-account-discovery";
import {
  marketingPersistenceRequest,
  type MarketingConnectionRow,
} from "./marketing-provider-repository";

type Row = Record<string, unknown>;
export type MarketingRepositoryTransport = (path: string, init?: RequestInit) => Promise<Row[]>;

function bytea(value: Uint8Array) {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

export async function persistGoogleConnectionAuthorization(input: {
  accountId: string;
  organizationId: string;
  providerIdentityId: string;
  displayName: string;
  refreshToken: string;
  grantedScopes: string[];
  transport?: MarketingRepositoryTransport;
  encryptionKey?: string;
  encryptionKeyId?: string;
}): Promise<MarketingConnectionRow> {
  const transport = input.transport || marketingPersistenceRequest;
  const existing = await transport(
    `marketing_provider_connections?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider=eq.google_ads&provider_identity_id=eq.${encodeURIComponent(input.providerIdentityId)}&status=neq.revoked&limit=1`,
  );
  if (existing[0]) throw new Error("Google Ads authorization is already connected.");

  const now = new Date().toISOString();
  const rows = await transport("marketing_provider_connections", {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      organization_id: input.organizationId,
      provider: "google_ads",
      display_name: input.displayName.slice(0, 100),
      environment: "production",
      status: "connected",
      provider_identity_id: input.providerIdentityId,
      capabilities: {
        googleAds: {
          grantedScopes: input.grantedScopes.slice().sort(),
          accountDiscovery: "accessible_customers_then_customer_client",
          developerTokenRequired: false,
        },
      },
      reauthorization_required: false,
      last_success_at: now,
    }),
  });
  if (!rows[0]) throw new Error("Google Ads connection could not be persisted.");
  const row = rows[0];
  const connection: MarketingConnectionRow = {
    id: String(row.id),
    organizationId: String(row.organization_id),
    accountId: String(row.account_id),
    providerIdentityId: row.provider_identity_id ? String(row.provider_identity_id) : null,
    displayName: String(row.display_name || "Google Ads"),
    status: String(row.status || "connected"),
    reauthorizationRequired: Boolean(row.reauthorization_required),
    capabilities: row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {},
  };

  const encodedKey = input.encryptionKey ?? process.env.COMMERCE_CREDENTIALS_ENC_KEY;
  const keyId = input.encryptionKeyId ?? String(process.env.COMMERCE_CREDENTIALS_KEY_ID || "").trim();
  const key = decodeCommerceCredentialKey(encodedKey);
  if (!keyId) throw new Error("Marketing credential encryption is unavailable.");
  const encrypted = await encryptCommerceCredential(input.refreshToken, key, keyId, 1);

  await transport("marketing_provider_credentials", {
    method: "POST",
    body: JSON.stringify({
      organization_id: input.organizationId,
      connection_id: connection.id,
      credential_type: "oauth_refresh_token",
      storage_backend: "database_encrypted",
      encryption_key_id: encrypted.keyId,
      encryption_version: encrypted.encryptionVersion,
      secret_iv: bytea(encrypted.iv),
      secret_ciphertext: bytea(encrypted.ciphertext),
      public_metadata: {
        grantedScopes: input.grantedScopes.slice().sort(),
        provider: "google_ads",
        createdFromOAuth: true,
      },
    }),
  });

  return connection;
}

export async function persistGoogleDiscoveredAccounts(input: {
  accountId: string;
  organizationId: string;
  connectionId: string;
  accounts: GoogleDiscoveredAccount[];
  transport?: MarketingRepositoryTransport;
}) {
  const transport = input.transport || marketingPersistenceRequest;
  const existingRows = await transport(
    `marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&provider=eq.google_ads&order=created_at.asc`,
  );
  const existingByExternal = new Map(existingRows.map((row) => [String(row.provider_account_external_id), row]));
  const persistedByExternal = new Map<string, Row>();
  const ordered = [...input.accounts].sort((a, b) => a.hierarchyDepth - b.hierarchyDepth || a.customerId.localeCompare(b.customerId));
  const now = new Date().toISOString();

  for (const account of ordered) {
    const parent = account.parentCustomerId
      ? persistedByExternal.get(account.parentCustomerId) || existingByExternal.get(account.parentCustomerId)
      : null;
    if (account.parentCustomerId && !parent) throw new Error("Google Ads parent account was not persisted.");

    const body = {
      account_id: input.accountId,
      organization_id: input.organizationId,
      connection_id: input.connectionId,
      provider: "google_ads",
      provider_account_external_id: account.customerId,
      provider_account_label: account.descriptiveName,
      parent_provider_account_id: parent ? String(parent.id) : null,
      account_type: account.accountType,
      hierarchy_depth: account.hierarchyDepth,
      is_manager: account.isManager,
      eligible_for_spend_sync: account.eligibleForSpendSync,
      currency: account.currencyCode,
      timezone_name: account.timeZone,
      status: "active",
      last_discovered_at: now,
      metadata: {
        google: {
          loginCustomerIds: account.loginCustomerIds,
          customerId: account.customerId,
          parentCustomerId: account.parentCustomerId,
        },
      },
      updated_at: now,
    };
    const current = existingByExternal.get(account.customerId);
    let rows: Row[];
    if (current) {
      rows = await transport(
        `marketing_provider_accounts?id=eq.${encodeURIComponent(String(current.id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    } else {
      rows = await transport("marketing_provider_accounts", {
        method: "POST",
        body: JSON.stringify({ ...body, selected_for_sync: false, first_discovered_at: now }),
      });
    }
    if (!rows[0]) throw new Error("Google Ads account could not be persisted.");
    persistedByExternal.set(account.customerId, rows[0]);
  }
  return Array.from(persistedByExternal.values());
}

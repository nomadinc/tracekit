import "server-only";
import { decodeCommerceCredentialKey, encryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import type { MetaAdAccount, MetaIdentity, MetaToken } from "./meta-oauth";

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

function authHeaders(key: string) {
  const headers: Record<string, string> = { apikey: key };
  if (key.split(".").length === 3) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function marketingPersistenceRequest(path: string, init: RequestInit = {}) {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const code = String(payload.code || "database_request_failed").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80);
    throw new MarketingPersistenceError(response.status, code);
  }
  if (response.status === 204) return [] as Row[];
  const payload = await response.json() as unknown;
  return (Array.isArray(payload) ? payload : [payload]) as Row[];
}

function bytea(value: Uint8Array) {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

export type MarketingConnectionRow = {
  id: string;
  organizationId: string;
  accountId: string;
  providerIdentityId: string | null;
  displayName: string;
  status: string;
  reauthorizationRequired: boolean;
  capabilities: Record<string, unknown>;
};

export type MarketingAccountRow = {
  id: string;
  connectionId: string;
  externalId: string;
  label: string | null;
  currency: string | null;
  timezoneName: string | null;
  status: string;
  selectedForSync: boolean;
  metadata: Record<string, unknown>;
};

function connection(row: Row): MarketingConnectionRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    accountId: String(row.account_id),
    providerIdentityId: row.provider_identity_id ? String(row.provider_identity_id) : null,
    displayName: String(row.display_name || "Meta"),
    status: String(row.status || "draft"),
    reauthorizationRequired: Boolean(row.reauthorization_required),
    capabilities: row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {},
  };
}

function account(row: Row): MarketingAccountRow {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    externalId: String(row.provider_account_external_id),
    label: row.provider_account_label ? String(row.provider_account_label) : null,
    currency: row.currency ? String(row.currency) : null,
    timezoneName: row.timezone_name ? String(row.timezone_name) : null,
    status: String(row.status || "active"),
    selectedForSync: Boolean(row.selected_for_sync),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
  };
}

export async function upsertMetaConnection(input: {
  accountId: string;
  organizationId: string;
  identity: MetaIdentity;
  grantedScopes: string[];
}) {
  const existing = await marketingPersistenceRequest(
    `marketing_provider_connections?organization_id=eq.${encodeURIComponent(input.organizationId)}&provider=eq.meta&provider_identity_id=eq.${encodeURIComponent(input.identity.id)}&status=neq.revoked&limit=1`,
  );
  const now = new Date().toISOString();
  const capabilities = {
    meta: {
      identityId: input.identity.id,
      identityName: input.identity.name,
      grantedScopes: input.grantedScopes.slice().sort(),
      apiVersion: "v26.0",
      lastVerifiedAt: now,
    },
  };
  if (existing[0]) {
    const rows = await marketingPersistenceRequest(
      `marketing_provider_connections?id=eq.${encodeURIComponent(String(existing[0].id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          display_name: input.identity.name ? `Meta — ${input.identity.name}`.slice(0, 100) : "Meta",
          status: "connected",
          reauthorization_required: false,
          capabilities,
          last_success_at: now,
          last_error_at: null,
          last_error_code: null,
          updated_at: now,
        }),
      },
    );
    if (!rows[0]) throw new Error("Marketing connection is unavailable.");
    return { connection: connection(rows[0]), reconnected: true };
  }
  const rows = await marketingPersistenceRequest("marketing_provider_connections", {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      organization_id: input.organizationId,
      provider: "meta",
      display_name: input.identity.name ? `Meta — ${input.identity.name}`.slice(0, 100) : "Meta",
      environment: "production",
      status: "connected",
      provider_identity_id: input.identity.id,
      capabilities,
      last_success_at: now,
    }),
  });
  if (!rows[0]) throw new Error("Marketing connection could not be created.");
  return { connection: connection(rows[0]), reconnected: false };
}

export async function replaceMetaCredential(input: {
  organizationId: string;
  connectionId: string;
  token: MetaToken;
  grantedScopes: string[];
}) {
  const key = decodeCommerceCredentialKey(process.env.MARKETING_CREDENTIALS_ENC_KEY);
  const keyId = String(process.env.MARKETING_CREDENTIALS_KEY_ID || "").trim();
  if (!keyId) throw new Error("Marketing credential encryption is unavailable.");
  const encrypted = await encryptCommerceCredential(input.token.accessToken, key, keyId, 1);
  const existing = await marketingPersistenceRequest(
    `marketing_provider_credentials?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&revoked_at=is.null&limit=1`,
  );
  const now = new Date().toISOString();
  if (existing[0]) {
    await marketingPersistenceRequest(
      `marketing_provider_credentials?id=eq.${encodeURIComponent(String(existing[0].id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&revoked_at=is.null`,
      { method: "PATCH", body: JSON.stringify({ revoked_at: now, rotated_at: now, updated_at: now }) },
    );
  }
  const expiresAt = input.token.expiresIn && input.token.expiresIn > 0
    ? new Date(Date.now() + input.token.expiresIn * 1000).toISOString()
    : null;
  const rows = await marketingPersistenceRequest("marketing_provider_credentials", {
    method: "POST",
    body: JSON.stringify({
      organization_id: input.organizationId,
      connection_id: input.connectionId,
      credential_type: "oauth_access_token",
      storage_backend: "database_encrypted",
      encryption_key_id: encrypted.keyId,
      encryption_version: encrypted.encryptionVersion,
      secret_iv: bytea(encrypted.iv),
      secret_ciphertext: bytea(encrypted.ciphertext),
      public_metadata: {
        tokenType: input.token.tokenType,
        grantedScopes: input.grantedScopes.slice().sort(),
        expiresAt,
        lastValidatedAt: now,
      },
    }),
  });
  if (!rows[0]) throw new Error("Marketing credential could not be persisted.");
}

export async function upsertDiscoveredMetaAccounts(input: {
  accountId: string;
  organizationId: string;
  connectionId: string;
  accounts: MetaAdAccount[];
}) {
  const existingRows = await marketingPersistenceRequest(
    `marketing_provider_accounts?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&order=created_at.asc`,
  );
  const existingByExternal = new Map(existingRows.map((row) => [String(row.provider_account_external_id), row]));
  const observed = new Set<string>();
  const now = new Date().toISOString();
  const result: MarketingAccountRow[] = [];
  for (const discovered of input.accounts) {
    observed.add(discovered.accountId);
    const metadata = {
      meta: {
        graphId: discovered.id,
        accountStatus: discovered.accountStatus,
        business: discovered.business,
      },
    };
    const current = existingByExternal.get(discovered.accountId);
    if (current) {
      const rows = await marketingPersistenceRequest(
        `marketing_provider_accounts?id=eq.${encodeURIComponent(String(current.id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            provider_account_label: discovered.name,
            currency: discovered.currency,
            timezone_name: discovered.timezoneName,
            timezone_offset_minutes: discovered.timezoneOffsetHoursUtc === null ? null : Math.round(discovered.timezoneOffsetHoursUtc * 60),
            status: "active",
            last_discovered_at: now,
            metadata,
            updated_at: now,
          }),
        },
      );
      if (rows[0]) result.push(account(rows[0]));
      continue;
    }
    const rows = await marketingPersistenceRequest("marketing_provider_accounts", {
      method: "POST",
      body: JSON.stringify({
        account_id: input.accountId,
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider: "meta",
        provider_account_external_id: discovered.accountId,
        provider_account_label: discovered.name,
        currency: discovered.currency,
        timezone_name: discovered.timezoneName,
        timezone_offset_minutes: discovered.timezoneOffsetHoursUtc === null ? null : Math.round(discovered.timezoneOffsetHoursUtc * 60),
        status: "active",
        selected_for_sync: false,
        first_discovered_at: now,
        last_discovered_at: now,
        metadata,
      }),
    });
    if (rows[0]) result.push(account(rows[0]));
  }
  for (const row of existingRows) {
    const externalId = String(row.provider_account_external_id);
    if (observed.has(externalId) || String(row.status) === "disabled") continue;
    await marketingPersistenceRequest(
      `marketing_provider_accounts?id=eq.${encodeURIComponent(String(row.id))}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
      { method: "PATCH", body: JSON.stringify({ status: "degraded", updated_at: now }) },
    );
  }
  return result;
}

export async function listMetaConnections(organizationId: string) {
  const rows = await marketingPersistenceRequest(
    `marketing_provider_connections?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.meta&status=neq.revoked&order=created_at.asc`,
  );
  return rows.map(connection);
}

export async function listMetaAccounts(organizationId: string, connectionId: string) {
  const rows = await marketingPersistenceRequest(
    `marketing_provider_accounts?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${encodeURIComponent(connectionId)}&provider=eq.meta&order=provider_account_label.asc`,
  );
  return rows.map(account);
}

export async function selectMetaAccounts(input: {
  organizationId: string;
  connectionId: string;
  selectedAccountIds: string[];
}) {
  const rows = await listMetaAccounts(input.organizationId, input.connectionId);
  const allowed = new Set(rows.filter((row) => row.status === "active" || row.status === "degraded").map((row) => row.id));
  const requested = new Set(input.selectedAccountIds);
  if (requested.size !== input.selectedAccountIds.length || Array.from(requested).some((id) => !allowed.has(id))) {
    throw new Error("One or more Meta advertising accounts are unavailable.");
  }
  const now = new Date().toISOString();
  for (const row of rows) {
    const selected = requested.has(row.id);
    if (row.selectedForSync === selected) continue;
    await marketingPersistenceRequest(
      `marketing_provider_accounts?id=eq.${encodeURIComponent(row.id)}&organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}`,
      { method: "PATCH", body: JSON.stringify({ selected_for_sync: selected, updated_at: now }) },
    );
  }
  return listMetaAccounts(input.organizationId, input.connectionId);
}

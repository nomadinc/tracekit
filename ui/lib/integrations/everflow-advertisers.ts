import "server-only";
import type { CommerceControlPlane } from "@/lib/commerce/control-plane";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { EVERFLOW_API_BASE, EverflowHealthError } from "./everflow-client";

export const EVERFLOW_ADVERTISERS_PATH = "/v1/networks/advertiserstable";
export const EVERFLOW_ADVERTISERS_URL = `${EVERFLOW_API_BASE}${EVERFLOW_ADVERTISERS_PATH}`;
export const EVERFLOW_ADVERTISER_TIMEOUT_MS = 10_000;
export const EVERFLOW_ADVERTISER_PAGE_SIZE = 200;
export const EVERFLOW_ADVERTISER_MAX_PAGES = 20;

export type EverflowAdvertiser = {
  networkAdvertiserId: string;
  networkId: string | null;
  name: string;
  accountStatus: string | null;
  accountManagerId: string | null;
  accountManagerName: string | null;
  salesManagerId: string | null;
  salesManagerName: string | null;
  labels: string[];
  sourceTimeCreated: string | null;
  sourceTimeSaved: string | null;
};

export type EverflowAdvertiserPage = {
  advertisers: EverflowAdvertiser[];
  page: number;
  pageSize: number;
  totalCount: number;
};

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function sourceTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((item): item is string => Boolean(item));
}

export function normalizeEverflowAdvertiser(value: unknown): EverflowAdvertiser {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid advertiser record.", 502, true);
  }
  const row = value as Record<string, unknown>;
  const networkAdvertiserId = cleanString(row.network_advertiser_id);
  const name = cleanString(row.name);
  if (!networkAdvertiserId || !name) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid advertiser record.", 502, true);
  }
  return {
    networkAdvertiserId,
    networkId: cleanString(row.network_id),
    name,
    accountStatus: cleanString(row.account_status),
    accountManagerId: cleanString(row.account_manager_id),
    accountManagerName: cleanString(row.account_manager_name),
    salesManagerId: cleanString(row.sales_manager_id),
    salesManagerName: cleanString(row.sales_manager_name),
    labels: cleanLabels(row.labels),
    sourceTimeCreated: sourceTimestamp(row.time_created),
    sourceTimeSaved: sourceTimestamp(row.time_saved),
  };
}

export async function listEverflowAdvertisersPage(input: {
  apiKey: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<EverflowAdvertiserPage> {
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length < 8) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
  const page = Math.max(1, Math.trunc(Number(input.page || 1)));
  const pageSize = Math.min(2000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_ADVERTISER_PAGE_SIZE))));
  const url = new URL(EVERFLOW_ADVERTISERS_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || EVERFLOW_ADVERTISER_TIMEOUT_MS), 1_000), EVERFLOW_ADVERTISER_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl || fetch)(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Eflow-Api-Key": apiKey },
      body: JSON.stringify({ search_terms: [], filters: {} }),
    });
    if (response.status === 401 || response.status === 403) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    if (response.status === 429) throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited the advertiser read. Try again later.", 429, true);
    if (!response.ok) throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the advertiser read.", 502, response.status >= 500);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || !Array.isArray(payload.advertisers)) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid advertiser response.", 502, true);
    const paging = payload.paging && typeof payload.paging === "object" ? payload.paging as Record<string, unknown> : {};
    return {
      advertisers: payload.advertisers.map(normalizeEverflowAdvertiser),
      page: Number(paging.page ?? page) || page,
      pageSize: Number(paging.page_size ?? pageSize) || pageSize,
      totalCount: Math.max(0, Number(paging.total_count ?? payload.advertisers.length) || 0),
    };
  } catch (error) {
    if (error instanceof EverflowHealthError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new EverflowHealthError("everflow_timeout", "Everflow did not respond before the advertiser-read timeout.", 504, true);
    throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the advertiser read.", 502, true);
  } finally {
    clearTimeout(timer);
  }
}

async function payloadHash(advertiser: EverflowAdvertiser) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(advertiser)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function persistEverflowAdvertisers(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  advertisers: EverflowAdvertiser[];
}) {
  if (!input.advertisers.length) return 0;
  const now = new Date().toISOString();
  const rows = await Promise.all(input.advertisers.map(async (advertiser) => ({
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    network_advertiser_id: advertiser.networkAdvertiserId,
    network_id: advertiser.networkId,
    name: advertiser.name,
    account_status: advertiser.accountStatus,
    account_manager_id: advertiser.accountManagerId,
    account_manager_name: advertiser.accountManagerName,
    sales_manager_id: advertiser.salesManagerId,
    sales_manager_name: advertiser.salesManagerName,
    labels: advertiser.labels,
    source_time_created: advertiser.sourceTimeCreated,
    source_time_saved: advertiser.sourceTimeSaved,
    payload_hash: await payloadHash(advertiser),
    last_seen_at: now,
    updated_at: now,
  })));
  await commercePersistenceRequest("everflow_advertisers?on_conflict=connection_id,provider_account_id,network_advertiser_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

export async function listPersistedEverflowAdvertisers(input: { organizationId: string; connectionId: string; limit?: number }) {
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(input.limit || 200))));
  return commercePersistenceRequest(`everflow_advertisers?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&select=network_advertiser_id,network_id,name,account_status,account_manager_id,account_manager_name,sales_manager_id,sales_manager_name,labels,source_time_created,source_time_saved,last_seen_at&order=name.asc&limit=${limit}`);
}

type AdvertiserSyncPlane = Pick<CommerceControlPlane, "getConnection" | "listProviderAccounts" | "resolveCredentialForExecution">;

export async function syncEverflowAdvertisers(input: {
  plane: AdvertiserSyncPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  connectionId: string;
  pageSize?: number;
  maxPages?: number;
  fetchPage?: typeof listEverflowAdvertisersPage;
  persistPage?: typeof persistEverflowAdvertisers;
}) {
  const connection = await input.plane.getConnection(input.session, input.connectionId);
  if (connection.organizationId !== input.organizationId || connection.provider !== "everflow" || connection.status === "revoked") throw new Error("Everflow connection is unavailable.");
  const accounts = await input.plane.listProviderAccounts(input.session, input.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");
  const apiKey = await input.plane.resolveCredentialForExecution(input.session, input.connectionId);
  const fetchPage = input.fetchPage || listEverflowAdvertisersPage;
  const persistPage = input.persistPage || persistEverflowAdvertisers;
  const pageSize = Math.min(2000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_ADVERTISER_PAGE_SIZE))));
  const maxPages = Math.min(100, Math.max(1, Math.trunc(Number(input.maxPages || EVERFLOW_ADVERTISER_MAX_PAGES))));
  let page = 1;
  let seen = 0;
  let persisted = 0;
  let totalCount = 0;
  while (page <= maxPages) {
    const result = await fetchPage({ apiKey, page, pageSize });
    totalCount = result.totalCount;
    for (const advertiser of result.advertisers) {
      if (advertiser.networkId && String(advertiser.networkId) !== String(account.externalId)) throw new EverflowHealthError("everflow_network_mismatch", "Everflow advertiser data does not belong to the connected network.", 409, false);
    }
    persisted += await persistPage({ organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: account.id, advertisers: result.advertisers });
    seen += result.advertisers.length;
    if (!result.advertisers.length || seen >= result.totalCount || result.advertisers.length < result.pageSize) break;
    page += 1;
  }
  if (page >= maxPages && seen < totalCount) throw new Error("Everflow advertiser sync reached its bounded page limit.");
  return { connectionId: input.connectionId, providerAccountId: account.id, networkId: account.externalId, seen, persisted, pages: page, totalCount };
}

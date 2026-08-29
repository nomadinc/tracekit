import "server-only";
import type { CommerceControlPlane } from "@/lib/commerce/control-plane";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { EVERFLOW_API_BASE, EverflowHealthError } from "./everflow-client";

export const EVERFLOW_AFFILIATES_PATH = "/v1/networks/affiliates";
export const EVERFLOW_AFFILIATES_URL = `${EVERFLOW_API_BASE}${EVERFLOW_AFFILIATES_PATH}`;
export const EVERFLOW_AFFILIATE_TIMEOUT_MS = 10_000;
export const EVERFLOW_AFFILIATE_PAGE_SIZE = 200;
export const EVERFLOW_AFFILIATE_MAX_PAGES = 20;

export type EverflowAffiliate = {
  networkAffiliateId: string;
  networkId: string | null;
  name: string;
  accountStatus: string | null;
  defaultCurrencyId: string | null;
  networkEmployeeId: string | null;
  networkTrafficSourceId: string | null;
  accountExecutiveId: string | null;
  referrerId: string | null;
  enableMediaCostTrackingLinks: boolean | null;
  sourceTimeCreated: string | null;
  sourceTimeSaved: string | null;
};

export type EverflowAffiliatePage = {
  affiliates: EverflowAffiliate[];
  page: number;
  pageSize: number;
  totalCount: number;
};

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
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

export function normalizeEverflowAffiliate(value: unknown): EverflowAffiliate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid affiliate record.", 502, true);
  }
  const row = value as Record<string, unknown>;
  const networkAffiliateId = cleanString(row.network_affiliate_id);
  const name = cleanString(row.name);
  if (!networkAffiliateId || !name) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid affiliate record.", 502, true);
  }
  return {
    networkAffiliateId,
    networkId: cleanString(row.network_id),
    name,
    accountStatus: cleanString(row.account_status),
    defaultCurrencyId: cleanString(row.default_currency_id),
    networkEmployeeId: cleanString(row.network_employee_id),
    networkTrafficSourceId: cleanString(row.network_traffic_source_id),
    accountExecutiveId: cleanString(row.account_executive_id),
    referrerId: cleanString(row.referrer_id),
    enableMediaCostTrackingLinks: cleanBoolean(row.enable_media_cost_tracking_links),
    sourceTimeCreated: sourceTimestamp(row.time_created),
    sourceTimeSaved: sourceTimestamp(row.time_saved),
  };
}

export async function listEverflowAffiliatesPage(input: {
  apiKey: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<EverflowAffiliatePage> {
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length < 8) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
  const page = Math.max(1, Math.trunc(Number(input.page || 1)));
  const pageSize = Math.min(500, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_AFFILIATE_PAGE_SIZE))));
  const url = new URL(EVERFLOW_AFFILIATES_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || EVERFLOW_AFFILIATE_TIMEOUT_MS), 1_000), EVERFLOW_AFFILIATE_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl || fetch)(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "X-Eflow-Api-Key": apiKey },
    });
    if (response.status === 401 || response.status === 403) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    if (response.status === 429) throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited the affiliate read. Try again later.", 429, true);
    if (!response.ok) throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the affiliate read.", 502, response.status >= 500);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || !Array.isArray(payload.affiliates)) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid affiliate response.", 502, true);
    const paging = payload.paging && typeof payload.paging === "object" ? payload.paging as Record<string, unknown> : {};
    return {
      affiliates: payload.affiliates.map(normalizeEverflowAffiliate),
      page: Number(paging.page ?? page) || page,
      pageSize: Number(paging.page_size ?? pageSize) || pageSize,
      totalCount: Math.max(0, Number(paging.total_count ?? payload.affiliates.length) || 0),
    };
  } catch (error) {
    if (error instanceof EverflowHealthError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new EverflowHealthError("everflow_timeout", "Everflow did not respond before the affiliate-read timeout.", 504, true);
    throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the affiliate read.", 502, true);
  } finally {
    clearTimeout(timer);
  }
}

async function payloadHash(affiliate: EverflowAffiliate) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(affiliate)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function persistEverflowAffiliates(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  affiliates: EverflowAffiliate[];
}) {
  if (!input.affiliates.length) return 0;
  const now = new Date().toISOString();
  const rows = await Promise.all(input.affiliates.map(async (affiliate) => ({
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    network_affiliate_id: affiliate.networkAffiliateId,
    network_id: affiliate.networkId,
    name: affiliate.name,
    account_status: affiliate.accountStatus,
    default_currency_id: affiliate.defaultCurrencyId,
    network_employee_id: affiliate.networkEmployeeId,
    network_traffic_source_id: affiliate.networkTrafficSourceId,
    account_executive_id: affiliate.accountExecutiveId,
    referrer_id: affiliate.referrerId,
    enable_media_cost_tracking_links: affiliate.enableMediaCostTrackingLinks,
    source_time_created: affiliate.sourceTimeCreated,
    source_time_saved: affiliate.sourceTimeSaved,
    payload_hash: await payloadHash(affiliate),
    last_seen_at: now,
    updated_at: now,
  })));
  await commercePersistenceRequest("everflow_affiliates?on_conflict=connection_id,provider_account_id,network_affiliate_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

export async function listPersistedEverflowAffiliates(input: {
  organizationId: string;
  connectionId: string;
  limit?: number;
}) {
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(input.limit || 200))));
  return commercePersistenceRequest(`everflow_affiliates?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&select=network_affiliate_id,network_id,name,account_status,default_currency_id,network_employee_id,network_traffic_source_id,account_executive_id,referrer_id,enable_media_cost_tracking_links,source_time_created,source_time_saved,last_seen_at&order=name.asc&limit=${limit}`);
}

type AffiliateSyncPlane = Pick<CommerceControlPlane, "getConnection" | "listProviderAccounts" | "resolveCredentialForExecution">;

export async function syncEverflowAffiliates(input: {
  plane: AffiliateSyncPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  connectionId: string;
  pageSize?: number;
  maxPages?: number;
  fetchPage?: typeof listEverflowAffiliatesPage;
  persistPage?: typeof persistEverflowAffiliates;
}) {
  const connection = await input.plane.getConnection(input.session, input.connectionId);
  if (connection.organizationId !== input.organizationId || connection.provider !== "everflow" || connection.status === "revoked") throw new Error("Everflow connection is unavailable.");
  const accounts = await input.plane.listProviderAccounts(input.session, input.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");
  const apiKey = await input.plane.resolveCredentialForExecution(input.session, input.connectionId);
  const fetchPage = input.fetchPage || listEverflowAffiliatesPage;
  const persistPage = input.persistPage || persistEverflowAffiliates;
  const pageSize = Math.min(500, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_AFFILIATE_PAGE_SIZE))));
  const maxPages = Math.min(100, Math.max(1, Math.trunc(Number(input.maxPages || EVERFLOW_AFFILIATE_MAX_PAGES))));
  let page = 1;
  let seen = 0;
  let persisted = 0;
  let totalCount = 0;
  while (page <= maxPages) {
    const result = await fetchPage({ apiKey, page, pageSize });
    totalCount = result.totalCount;
    for (const affiliate of result.affiliates) {
      if (affiliate.networkId && String(affiliate.networkId) !== String(account.externalId)) throw new EverflowHealthError("everflow_network_mismatch", "Everflow affiliate data does not belong to the connected network.", 409, false);
    }
    persisted += await persistPage({ organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: account.id, affiliates: result.affiliates });
    seen += result.affiliates.length;
    if (!result.affiliates.length || seen >= result.totalCount || result.affiliates.length < result.pageSize) break;
    page += 1;
  }
  if (page >= maxPages && seen < totalCount) throw new Error("Everflow affiliate sync reached its bounded page limit.");
  return { connectionId: input.connectionId, providerAccountId: account.id, networkId: account.externalId, seen, persisted, pages: page, totalCount };
}

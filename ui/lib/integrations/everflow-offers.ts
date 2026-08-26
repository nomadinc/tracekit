import "server-only";
import type { CommerceControlPlane } from "@/lib/commerce/control-plane";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { EVERFLOW_API_BASE, EverflowHealthError } from "./everflow-client";

export const EVERFLOW_OFFERS_PATH = "/v1/networks/offers/table";
export const EVERFLOW_OFFERS_URL = `${EVERFLOW_API_BASE}${EVERFLOW_OFFERS_PATH}`;
export const EVERFLOW_OFFER_TIMEOUT_MS = 10_000;
export const EVERFLOW_OFFER_PAGE_SIZE = 200;
export const EVERFLOW_OFFER_MAX_PAGES = 20;

export type EverflowOffer = {
  networkOfferId: string;
  networkId: string | null;
  networkAdvertiserId: string | null;
  name: string;
  offerStatus: string | null;
  currencyId: string | null;
  visibility: string | null;
  networkCategoryId: string | null;
  networkOfferGroupId: string | null;
  networkTrackingDomainId: string | null;
  destinationUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  sourceTimeCreated: string | null;
  sourceTimeSaved: string | null;
};

export type EverflowOfferPage = {
  offers: EverflowOffer[];
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

export function normalizeEverflowOffer(value: unknown): EverflowOffer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid offer record.", 502, true);
  }
  const row = value as Record<string, unknown>;
  const networkOfferId = cleanString(row.network_offer_id);
  const name = cleanString(row.name);
  if (!networkOfferId || !name) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid offer record.", 502, true);
  }
  return {
    networkOfferId,
    networkId: cleanString(row.network_id),
    networkAdvertiserId: cleanString(row.network_advertiser_id),
    name,
    offerStatus: cleanString(row.offer_status),
    currencyId: cleanString(row.currency_id),
    visibility: cleanString(row.visibility),
    networkCategoryId: cleanString(row.network_category_id),
    networkOfferGroupId: cleanString(row.network_offer_group_id),
    networkTrackingDomainId: cleanString(row.network_tracking_domain_id),
    destinationUrl: cleanString(row.destination_url),
    previewUrl: cleanString(row.preview_url),
    thumbnailUrl: cleanString(row.thumbnail_url),
    sourceTimeCreated: sourceTimestamp(row.time_created),
    sourceTimeSaved: sourceTimestamp(row.time_saved),
  };
}

export async function listEverflowOffersPage(input: {
  apiKey: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<EverflowOfferPage> {
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length < 8) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
  const page = Math.max(1, Math.trunc(Number(input.page || 1)));
  const pageSize = Math.min(2000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_OFFER_PAGE_SIZE))));
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || EVERFLOW_OFFER_TIMEOUT_MS), 1_000), EVERFLOW_OFFER_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (input.fetchImpl || fetch)(EVERFLOW_OFFERS_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Eflow-Api-Key": apiKey },
      body: JSON.stringify({ filters: {}, search_terms: [], paging: { page, page_size: pageSize } }),
    });
    if (response.status === 401 || response.status === 403) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    if (response.status === 429) throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited the offer read. Try again later.", 429, true);
    if (!response.ok) throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the offer read.", 502, response.status >= 500);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || !Array.isArray(payload.offers)) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid offer response.", 502, true);
    const paging = payload.paging && typeof payload.paging === "object" ? payload.paging as Record<string, unknown> : {};
    return {
      offers: payload.offers.map(normalizeEverflowOffer),
      page: Number(paging.page ?? page) || page,
      pageSize: Number(paging.page_size ?? pageSize) || pageSize,
      totalCount: Math.max(0, Number(paging.total_count ?? payload.offers.length) || 0),
    };
  } catch (error) {
    if (error instanceof EverflowHealthError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new EverflowHealthError("everflow_timeout", "Everflow did not respond before the offer-read timeout.", 504, true);
    throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the offer read.", 502, true);
  } finally {
    clearTimeout(timer);
  }
}

async function payloadHash(offer: EverflowOffer) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(offer)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function persistEverflowOffers(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  offers: EverflowOffer[];
}) {
  if (!input.offers.length) return 0;
  const now = new Date().toISOString();
  const rows = await Promise.all(input.offers.map(async (offer) => ({
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    network_offer_id: offer.networkOfferId,
    network_id: offer.networkId,
    network_advertiser_id: offer.networkAdvertiserId,
    name: offer.name,
    offer_status: offer.offerStatus,
    currency_id: offer.currencyId,
    visibility: offer.visibility,
    network_category_id: offer.networkCategoryId,
    network_offer_group_id: offer.networkOfferGroupId,
    network_tracking_domain_id: offer.networkTrackingDomainId,
    destination_url: offer.destinationUrl,
    preview_url: offer.previewUrl,
    thumbnail_url: offer.thumbnailUrl,
    source_time_created: offer.sourceTimeCreated,
    source_time_saved: offer.sourceTimeSaved,
    payload_hash: await payloadHash(offer),
    last_seen_at: now,
    updated_at: now,
  })));
  await commercePersistenceRequest("everflow_offers?on_conflict=connection_id,provider_account_id,network_offer_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

export async function listPersistedEverflowOffers(input: { organizationId: string; connectionId: string; limit?: number }) {
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(input.limit || 200))));
  return commercePersistenceRequest(`everflow_offers?organization_id=eq.${encodeURIComponent(input.organizationId)}&connection_id=eq.${encodeURIComponent(input.connectionId)}&select=network_offer_id,network_id,network_advertiser_id,name,offer_status,currency_id,visibility,network_category_id,network_offer_group_id,network_tracking_domain_id,destination_url,preview_url,thumbnail_url,source_time_created,source_time_saved,last_seen_at&order=name.asc&limit=${limit}`);
}

type OfferSyncPlane = Pick<CommerceControlPlane, "getConnection" | "listProviderAccounts" | "resolveCredentialForExecution">;

export async function syncEverflowOffers(input: {
  plane: OfferSyncPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  connectionId: string;
  pageSize?: number;
  maxPages?: number;
  fetchPage?: typeof listEverflowOffersPage;
  persistPage?: typeof persistEverflowOffers;
}) {
  const connection = await input.plane.getConnection(input.session, input.connectionId);
  if (connection.organizationId !== input.organizationId || connection.provider !== "everflow" || connection.status === "revoked") throw new Error("Everflow connection is unavailable.");
  const accounts = await input.plane.listProviderAccounts(input.session, input.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");
  const apiKey = await input.plane.resolveCredentialForExecution(input.session, input.connectionId);
  const fetchPage = input.fetchPage || listEverflowOffersPage;
  const persistPage = input.persistPage || persistEverflowOffers;
  const pageSize = Math.min(2000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_OFFER_PAGE_SIZE))));
  const maxPages = Math.min(100, Math.max(1, Math.trunc(Number(input.maxPages || EVERFLOW_OFFER_MAX_PAGES))));
  let page = 1;
  let seen = 0;
  let persisted = 0;
  let totalCount = 0;
  while (page <= maxPages) {
    const result = await fetchPage({ apiKey, page, pageSize });
    totalCount = result.totalCount;
    for (const offer of result.offers) {
      if (offer.networkId && String(offer.networkId) !== String(account.externalId)) throw new EverflowHealthError("everflow_network_mismatch", "Everflow offer data does not belong to the connected network.", 409, false);
    }
    persisted += await persistPage({ organizationId: input.organizationId, connectionId: input.connectionId, providerAccountId: account.id, offers: result.offers });
    seen += result.offers.length;
    if (!result.offers.length || seen >= result.totalCount || result.offers.length < result.pageSize) break;
    page += 1;
  }
  if (page >= maxPages && seen < totalCount) throw new Error("Everflow offer sync reached its bounded page limit.");
  return { connectionId: input.connectionId, providerAccountId: account.id, networkId: account.externalId, seen, persisted, pages: page, totalCount };
}

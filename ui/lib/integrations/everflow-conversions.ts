import "server-only";
import { randomUUID } from "node:crypto";
import type { CommerceControlPlane } from "@/lib/commerce/control-plane";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { EVERFLOW_API_BASE, EverflowHealthError } from "./everflow-client";
import { resolveAndMapEverflowOrder } from "./everflow-order-linkage";

export const EVERFLOW_CONVERSIONS_PATH = "/v1/networks/reporting/conversions";
export const EVERFLOW_CONVERSIONS_URL = `${EVERFLOW_API_BASE}${EVERFLOW_CONVERSIONS_PATH}`;
export const EVERFLOW_CONVERSION_TIMEOUT_MS = 10_000;
export const EVERFLOW_CONVERSION_PAGE_SIZE = 200;
export const EVERFLOW_CONVERSION_MAX_PAGES = 50;
export const EVERFLOW_CONVERSION_MAX_RANGE_DAYS = 31;

export type EverflowConversion = {
  conversionId: string;
  sourceIdentity: string;
  transactionId: string | null;
  emailNormalized: string | null;
  conversionAt: string;
  clickAt: string | null;
  deltaHours: number | null;
  affiliateId: string | null;
  affiliateName: string | null;
  advertiserId: string | null;
  advertiserName: string | null;
  offerId: string | null;
  offerName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  sourceId: string | null;
  sub1: string | null;
  sub2: string | null;
  sub3: string | null;
  sub4: string | null;
  sub5: string | null;
  adv1: string | null;
  adv2: string | null;
  adv3: string | null;
  adv4: string | null;
  adv5: string | null;
  eventName: string | null;
  status: string | null;
  revenue: number | null;
  revenueType: string | null;
  saleAmount: number | null;
  payout: number | null;
  payoutType: string | null;
  currency: string | null;
  orderId: string | null;
  couponCode: string | null;
  isEvent: boolean;
  isViewThrough: boolean | null;
  isScrub: boolean | null;
  attributionMethod: string | null;
  networkId: string | null;
  sessionIpHash: string | null;
  conversionIpHash: string | null;
  isp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  platform: string | null;
  osVersion: string | null;
  userAgent: string | null;
  creativeId: string | null;
  creative: string | null;
  payloadHash: string;
  rawPayload: Record<string, unknown>;
  rawPayloadHash: string;
};

export type EverflowConversionPage = {
  conversions: EverflowConversion[];
  page: number;
  pageSize: number;
  totalCount: number;
};

function cleanString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const text = String(value).trim();
  return text || null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanBoolean(value: unknown) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function normalizeEmail(value: unknown) {
  const email = cleanString(value)?.toLowerCase() || null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relationship(row: Record<string, unknown>, name: string) {
  return record(record(row.relationship)[name]);
}

function unixTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function evidenceHash(value: unknown) {
  return sha256Text(JSON.stringify(value));
}

export async function normalizeEverflowConversion(value: unknown): Promise<EverflowConversion> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid conversion record.", 502, true);
  }
  const row = value as Record<string, unknown>;
  const conversionId = cleanString(row.conversion_id);
  const conversionAt = unixTimestamp(row.conversion_unix_timestamp) || cleanString(row.conversion_date);
  if (!conversionId || !conversionAt || !Number.isFinite(Date.parse(conversionAt))) {
    throw new EverflowHealthError("everflow_invalid_response", "Everflow returned a conversion without stable identity or time.", 502, true);
  }

  const affiliate = relationship(row, "affiliate");
  const advertiser = relationship(row, "advertiser");
  const offer = relationship(row, "offer");
  const campaign = relationship(row, "campaign");
  const attribution = record(row.relationship).attribution_method;
  const clickAt = unixTimestamp(row.click_unix_timestamp);
  const networkId = cleanString(affiliate.network_id ?? offer.network_id ?? advertiser.network_id ?? row.network_id);
  const sessionIpHash = cleanString(row.session_user_ip) ? await sha256Text(String(row.session_user_ip).trim()) : null;
  const conversionIpHash = cleanString(row.conversion_user_ip) ? await sha256Text(String(row.conversion_user_ip).trim()) : null;
  const conversionMs = Date.parse(conversionAt);
  const clickMs = clickAt ? Date.parse(clickAt) : NaN;

  const normalizedWithoutHash = {
    conversionId,
    sourceIdentity: conversionId,
    transactionId: cleanString(row.transaction_id),
    emailNormalized: normalizeEmail(row.email),
    conversionAt: new Date(conversionMs).toISOString(),
    clickAt,
    deltaHours: Number.isFinite(clickMs) ? (conversionMs - clickMs) / 3_600_000 : null,
    affiliateId: cleanString(affiliate.network_affiliate_id ?? row.network_affiliate_id),
    affiliateName: cleanString(affiliate.name ?? row.affiliate_name),
    advertiserId: cleanString(advertiser.network_advertiser_id ?? row.network_advertiser_id),
    advertiserName: cleanString(advertiser.name ?? row.advertiser_name),
    offerId: cleanString(offer.network_offer_id ?? row.network_offer_id),
    offerName: cleanString(offer.name ?? row.offer_name),
    campaignId: cleanString(campaign.network_campaign_id ?? row.network_campaign_id),
    campaignName: cleanString(campaign.campaign_name ?? campaign.name ?? row.campaign_name),
    sourceId: cleanString(row.source_id),
    sub1: cleanString(row.sub1),
    sub2: cleanString(row.sub2),
    sub3: cleanString(row.sub3),
    sub4: cleanString(row.sub4),
    sub5: cleanString(row.sub5),
    adv1: cleanString(row.adv1),
    adv2: cleanString(row.adv2),
    adv3: cleanString(row.adv3),
    adv4: cleanString(row.adv4),
    adv5: cleanString(row.adv5),
    eventName: cleanString(row.event),
    status: cleanString(row.status),
    revenue: cleanNumber(row.revenue),
    revenueType: cleanString(row.revenue_type),
    saleAmount: cleanNumber(row.sale_amount),
    payout: cleanNumber(row.payout),
    payoutType: cleanString(row.payout_type),
    currency: cleanString(row.currency_id)?.toUpperCase() || null,
    orderId: cleanString(row.order_id),
    couponCode: cleanString(row.coupon_code),
    isEvent: cleanBoolean(row.is_event) ?? false,
    isViewThrough: cleanBoolean(row.is_view_through),
    isScrub: cleanBoolean(row.is_scrub),
    attributionMethod: cleanString(attribution ?? row.attribution_method),
    networkId,
    sessionIpHash,
    conversionIpHash,
    isp: cleanString(row.isp),
    country: cleanString(row.country),
    region: cleanString(row.region),
    city: cleanString(row.city),
    device: cleanString(row.device ?? row.device_type),
    browser: cleanString(row.browser),
    platform: cleanString(row.platform),
    osVersion: cleanString(row.os_version),
    userAgent: cleanString(row.user_agent),
    creativeId: cleanString(row.creative_id),
    creative: cleanString(row.creative),
  };

  return {
    ...normalizedWithoutHash,
    payloadHash: await evidenceHash(normalizedWithoutHash),
    rawPayload: row,
    rawPayloadHash: await evidenceHash(row),
  };
}

function providerDateValue(value: string, field: string) {
  const normalized = String(value || "").trim().replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(normalized)) {
    throw new Error(`${field} must be YYYY-MM-DD or YYYY-MM-DD HH:mm:ss.`);
  }
  return normalized;
}

export function validateEverflowConversionRange(from: string, to: string) {
  const normalizedFrom = providerDateValue(from, "from");
  const normalizedTo = providerDateValue(to, "to");
  const parse = (value: string) => Date.parse(value.length === 10 ? `${value}T00:00:00Z` : `${value.replace(" ", "T")}Z`);
  const fromMs = parse(normalizedFrom);
  const toMs = parse(normalizedTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) throw new Error("Everflow conversion range is invalid.");
  if (toMs - fromMs > EVERFLOW_CONVERSION_MAX_RANGE_DAYS * 86_400_000) {
    throw new Error(`Everflow conversion sync is limited to ${EVERFLOW_CONVERSION_MAX_RANGE_DAYS} days per run.`);
  }
  return { from: normalizedFrom, to: normalizedTo };
}

export async function listEverflowConversionsPage(input: {
  apiKey: string;
  from: string;
  to: string;
  timezoneId: number;
  currencyId: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<EverflowConversionPage> {
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey.length < 8) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
  const range = validateEverflowConversionRange(input.from, input.to);
  if (!Number.isInteger(input.timezoneId)) throw new Error("Everflow reporting timezone is unavailable.");
  const currencyId = cleanString(input.currencyId)?.toUpperCase();
  if (!currencyId) throw new Error("Everflow reporting currency is unavailable.");
  const page = Math.max(1, Math.trunc(Number(input.page || 1)));
  const pageSize = Math.min(1000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_CONVERSION_PAGE_SIZE))));
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || EVERFLOW_CONVERSION_TIMEOUT_MS), 1_000), EVERFLOW_CONVERSION_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${EVERFLOW_CONVERSIONS_URL}?page=${page}&page_size=${pageSize}`;
  try {
    const response = await (input.fetchImpl || fetch)(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Eflow-Api-Key": apiKey },
      body: JSON.stringify({
        show_conversions: true,
        show_events: true,
        from: range.from,
        to: range.to,
        timezone_id: input.timezoneId,
        currency_id: currencyId,
        query: { filters: [], search_terms: [] },
      }),
    });
    if (response.status === 401 || response.status === 403) throw new EverflowHealthError("everflow_authentication_failed", "Everflow authentication failed.", 401, false);
    if (response.status === 429) throw new EverflowHealthError("everflow_rate_limited", "Everflow rate limited the conversion read. Try again later.", 429, true);
    if (!response.ok) throw new EverflowHealthError("everflow_unavailable", "Everflow could not complete the conversion read.", 502, response.status >= 500);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || !Array.isArray(payload.conversions)) throw new EverflowHealthError("everflow_invalid_response", "Everflow returned an invalid conversion response.", 502, true);
    const paging = record(payload.paging);
    const conversions = await Promise.all(payload.conversions.map(normalizeEverflowConversion));
    return {
      conversions,
      page: Number(paging.page ?? page) || page,
      pageSize: Number(paging.page_size ?? pageSize) || pageSize,
      totalCount: Math.max(0, Number(paging.total_count ?? conversions.length) || 0),
    };
  } catch (error) {
    if (error instanceof EverflowHealthError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new EverflowHealthError("everflow_timeout", "Everflow did not respond before the conversion-read timeout.", 504, true);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function persistRawEvidence(input: {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  syncRunId: string;
  conversion: EverflowConversion;
  observedAt: string;
}) {
  const bytes = new TextEncoder().encode(JSON.stringify(input.conversion.rawPayload));
  const evidenceId = randomUUID();
  const storageReference = `managed://everflow/${input.organizationId}/${input.connectionId}/${input.providerAccountId}/${input.conversion.sourceIdentity}/${input.conversion.rawPayloadHash}`;
  const evidenceRows = await commercePersistenceRequest(
    "commerce_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        id: evidenceId,
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        provider_account_id: input.providerAccountId,
        sync_run_id: input.syncRunId,
        source_object_type: "everflow_conversion",
        source_object_id: input.conversion.sourceIdentity,
        payload_hash: input.conversion.rawPayloadHash,
        storage_backend: "managed_evidence_store",
        storage_reference: storageReference,
        content_type: "application/json",
        byte_size: bytes.byteLength,
        source_created_at: input.conversion.conversionAt,
        source_updated_at: null,
        observed_at: input.observedAt,
        normalizer_version: "everflow-conversion-v1",
        mapping_version: "everflow-conversion-v1",
        pii_classification: "sensitive",
        retention_policy: "commerce-provider-raw-v1",
        metadata: {
          immutable: true,
          provider: "everflow",
          ingestionMethod: "api",
          normalizedPayloadHash: input.conversion.payloadHash,
        },
      }),
    },
  );

  let resolvedEvidenceId = evidenceRows.length ? String(evidenceRows[0].id) : null;
  if (!resolvedEvidenceId) {
    const existing = await commercePersistenceRequest(
      `commerce_evidence_records?connection_id=eq.${encodeURIComponent(input.connectionId)}&provider_account_id=eq.${encodeURIComponent(input.providerAccountId)}&source_object_type=eq.everflow_conversion&source_object_id=eq.${encodeURIComponent(input.conversion.sourceIdentity)}&payload_hash=eq.${encodeURIComponent(input.conversion.rawPayloadHash)}&select=id`,
    );
    resolvedEvidenceId = existing.length ? String(existing[0].id) : null;
  }
  if (!resolvedEvidenceId) throw new Error("Everflow raw evidence could not be resolved.");

  await commercePersistenceRequest(
    "commerce_managed_evidence_payloads?on_conflict=evidence_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        evidence_id: resolvedEvidenceId,
        organization_id: input.organizationId,
        payload: input.conversion.rawPayload,
      }),
    },
  );
  return resolvedEvidenceId;
}

export async function persistEverflowConversions(input: {
  accountId: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  syncRunId: string;
  conversions: EverflowConversion[];
}) {
  if (!input.conversions.length) return 0;
  const now = new Date().toISOString();
  const evidenceIds = new Map<string, string>();
  for (const conversion of input.conversions) {
    evidenceIds.set(conversion.sourceIdentity, await persistRawEvidence({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      providerAccountId: input.providerAccountId,
      syncRunId: input.syncRunId,
      conversion,
      observedAt: now,
    }));
  }
  const rows = input.conversions.map((conversion) => ({
    id: randomUUID(),
    account_id: input.accountId,
    organization_id: input.organizationId,
    connection_id: input.connectionId,
    provider_account_id: input.providerAccountId,
    sync_run_id: input.syncRunId,
    import_id: null,
    source_row: null,
    ingestion_method: "api",
    evidence_id: evidenceIds.get(conversion.sourceIdentity) || null,
    source_identity: conversion.sourceIdentity,
    conversion_id: conversion.conversionId,
    transaction_id: conversion.transactionId,
    email_normalized: conversion.emailNormalized,
    conversion_at: conversion.conversionAt,
    click_at: conversion.clickAt,
    delta_hours: conversion.deltaHours,
    affiliate_id: conversion.affiliateId,
    affiliate_name: conversion.affiliateName,
    advertiser_id: conversion.advertiserId,
    advertiser_name: conversion.advertiserName,
    sub1: conversion.sub1,
    sub2: conversion.sub2,
    sub3: conversion.sub3,
    sub4: conversion.sub4,
    sub5: conversion.sub5,
    adv1: conversion.adv1,
    adv2: conversion.adv2,
    adv3: conversion.adv3,
    adv4: conversion.adv4,
    adv5: conversion.adv5,
    offer_id: conversion.offerId,
    offer_name: conversion.offerName,
    event_name: conversion.eventName,
    revenue: conversion.revenue,
    revenue_type: conversion.revenueType,
    sale_amount: conversion.saleAmount,
    payout: conversion.payout,
    payout_type: conversion.payoutType,
    currency: conversion.currency,
    order_id: conversion.orderId,
    coupon_code: conversion.couponCode,
    is_event: conversion.isEvent,
    is_view_through: conversion.isViewThrough,
    is_scrub: conversion.isScrub,
    network_id: conversion.networkId,
    session_ip_hash: conversion.sessionIpHash,
    conversion_ip_hash: conversion.conversionIpHash,
    isp: conversion.isp,
    country: conversion.country,
    region: conversion.region,
    city: conversion.city,
    device: conversion.device,
    browser: conversion.browser,
    platform: conversion.platform,
    os_version: conversion.osVersion,
    user_agent: conversion.userAgent,
    campaign_id: conversion.campaignId,
    campaign_name: conversion.campaignName,
    creative_id: conversion.creativeId,
    creative: conversion.creative,
    source_id: conversion.sourceId,
    status: conversion.status,
    attribution_method: conversion.attributionMethod,
    payload_hash: conversion.payloadHash,
    last_seen_at: now,
  }));
  await commercePersistenceRequest("everflow_conversion_events?on_conflict=connection_id,provider_account_id,source_identity", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

type ConversionSyncPlane = Pick<CommerceControlPlane,
  | "getConnection"
  | "listProviderAccounts"
  | "resolveCredentialForExecution"
  | "createSyncRun"
  | "claimSyncRun"
  | "heartbeatSyncRun"
  | "completeSyncRun"
  | "failSyncRun"
  | "beginCheckpoint"
  | "completeCheckpoint"
  | "failCheckpoint"
  | "resolveSourceMapping"
  | "createOrObserveSourceMapping"
>;

export async function syncEverflowConversions(input: {
  plane: ConversionSyncPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  connectionId: string;
  from: string;
  to: string;
  pageSize?: number;
  maxPages?: number;
  fetchPage?: typeof listEverflowConversionsPage;
  persistPage?: typeof persistEverflowConversions;
}) {
  const range = validateEverflowConversionRange(input.from, input.to);
  const connection = await input.plane.getConnection(input.session, input.connectionId);
  if (connection.organizationId !== input.organizationId || connection.provider !== "everflow" || connection.status !== "connected") {
    throw new Error("Everflow connection is unavailable.");
  }
  const accounts = await input.plane.listProviderAccounts(input.session, input.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");
  const network = record(connection.capabilities?.everflowNetwork);
  const timezoneId = Number(network.timezoneId);
  const currencyId = cleanString(network.currencyId);
  if (!Number.isInteger(timezoneId) || !currencyId) throw new Error("Everflow reporting metadata is unavailable. Re-verify the connection.");
  const apiKey = await input.plane.resolveCredentialForExecution(input.session, input.connectionId);
  const pageSize = Math.min(1000, Math.max(1, Math.trunc(Number(input.pageSize || EVERFLOW_CONVERSION_PAGE_SIZE))));
  const maxPages = Math.min(100, Math.max(1, Math.trunc(Number(input.maxPages || EVERFLOW_CONVERSION_MAX_PAGES))));
  const fetchPage = input.fetchPage || listEverflowConversionsPage;
  const persistPage = input.persistPage || persistEverflowConversions;

  const run = await input.plane.createSyncRun(input.session, input.connectionId, account.id, "shadow", "everflow_conversions");
  const owner = `everflow-conversions:${randomUUID()}`;
  const claimed = await input.plane.claimSyncRun(input.session, input.connectionId, run.id, owner, 120);
  if (!claimed) throw new Error("Everflow conversion sync could not acquire its run lease.");

  let page = 1;
  let seen = 0;
  let persisted = 0;
  let totalCount = 0;
  const linkage = { matched: 0, unmatched: 0, ambiguous: 0, conflict: 0 };
  try {
    while (page <= maxPages) {
      const checkpoint = await input.plane.beginCheckpoint(input.session, input.connectionId, {
        syncRunId: run.id,
        providerAccountId: account.id,
        resource: "everflow_conversions",
        page,
        perPage: pageSize,
        pageFingerprint: null,
      });
      try {
        const result = await fetchPage({ apiKey, from: range.from, to: range.to, timezoneId, currencyId, page, pageSize });
        totalCount = result.totalCount;
        for (const conversion of result.conversions) {
          if (conversion.networkId && String(conversion.networkId) !== String(account.externalId)) {
            throw new EverflowHealthError("everflow_network_mismatch", "Everflow conversion data does not belong to the connected network.", 409, false);
          }
        }
        persisted += await persistPage({
          accountId: connection.accountId,
          organizationId: input.organizationId,
          connectionId: input.connectionId,
          providerAccountId: account.id,
          syncRunId: run.id,
          conversions: result.conversions,
        });
        seen += result.conversions.length;

        for (const conversion of result.conversions) {
          const decision = await resolveAndMapEverflowOrder({
            plane: input.plane,
            session: input.session,
            link: {
              organizationId: input.organizationId,
              connectionId: input.connectionId,
              sourceRecordId: conversion.conversionId,
              transactionId: conversion.transactionId,
              email: conversion.emailNormalized,
              occurredAt: conversion.conversionAt,
              amount: conversion.saleAmount ?? conversion.revenue,
              isCommerceValue: (conversion.saleAmount ?? 0) !== 0 || (conversion.revenue ?? 0) !== 0,
            },
          });
          linkage[decision.status] += 1;
        }

        const fingerprint = await evidenceHash(result.conversions.map((conversion) => [conversion.sourceIdentity, conversion.payloadHash]));
        await input.plane.completeCheckpoint(input.session, input.connectionId, checkpoint.id, fingerprint);
        await input.plane.heartbeatSyncRun(input.session, input.connectionId, run.id, owner, 120);
        if (!result.conversions.length || seen >= result.totalCount || result.conversions.length < result.pageSize) break;
        page += 1;
      } catch (error) {
        await input.plane.failCheckpoint(input.session, input.connectionId, checkpoint.id, checkpoint.retryCount + 1).catch(() => undefined);
        throw error;
      }
    }
    if (page >= maxPages && seen < totalCount) throw new Error("Everflow conversion sync reached its bounded page limit.");
    const withWarnings = linkage.ambiguous > 0 || linkage.conflict > 0;
    await input.plane.completeSyncRun(input.session, input.connectionId, run.id, owner, withWarnings);
    return {
      connectionId: input.connectionId,
      providerAccountId: account.id,
      networkId: account.externalId,
      syncRunId: run.id,
      from: range.from,
      to: range.to,
      seen,
      persisted,
      pages: page,
      totalCount,
      linkage,
    };
  } catch (error) {
    const summary = error instanceof Error ? error.message : "Everflow conversion sync failed.";
    await input.plane.failSyncRun(input.session, input.connectionId, run.id, owner, "everflow_conversion_sync_failed", summary).catch(() => undefined);
    throw error;
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { fetchMetaInsightsPages, META_INSIGHTS_API_VERSION, META_INSIGHTS_REPORTING_SEMANTICS, validateMetaInsightsRange } from "./meta-insights-client";
import { listMetaAccounts, listMetaConnections, marketingPersistenceRequest, type MarketingAccountRow } from "./marketing-provider-repository";
import { MetaOAuthError } from "./meta-oauth";

type Row = Record<string, unknown>;
type Counters = { seen: number; created: number; updated: number; unchanged: number; failed: number; pages: number; costsCreated: number; costsUpdated: number };
const NORMALIZER_VERSION = "meta-insights-v1";
const COST_CALCULATION_VERSION = "meta-insights-spend-v1";

function requireManager(session: TraceKitSessionContext) {
  if (!session.activeOrganization || !session.effectivePermissions.includes("connectors.manage")) throw new MetaOAuthError("resource_unavailable", "The requested resource is unavailable.", 404);
  return session.activeOrganization;
}
function bytes(value: unknown) { return Uint8Array.from(Buffer.from(String(value || "").replace(/^\\x/, ""), "hex")); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) { return createHash("sha256").update(stable(value)).digest("hex"); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function decimal(value: unknown, fallback: number | null = null) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fallback; }
function integer(value: unknown) { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
function safeArray(value: unknown) { return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []; }

const REPORTING_KEY = hash({ provider: "meta", apiVersion: META_INSIGHTS_API_VERSION, ...META_INSIGHTS_REPORTING_SEMANTICS });
const ATTRIBUTION_SETTING = { provider: "meta", useAccountAttributionSetting: true };

async function accessToken(organizationId: string, connectionId: string) {
  const rows = await marketingPersistenceRequest(`marketing_provider_credentials?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${encodeURIComponent(connectionId)}&revoked_at=is.null&limit=1`);
  const row = rows[0];
  if (!row || row.storage_backend !== "database_encrypted") throw new MetaOAuthError("meta_credential_unavailable", "Meta authorization must be renewed before syncing.", 409);
  const key = decodeCommerceCredentialKey(process.env.MARKETING_CREDENTIALS_ENC_KEY);
  return decryptCommerceCredential({ keyId: String(row.encryption_key_id), encryptionVersion: Number(row.encryption_version), iv: bytes(row.secret_iv), ciphertext: bytes(row.secret_ciphertext) }, key);
}

async function createRun(session: TraceKitSessionContext, account: MarketingAccountRow, since: string, until: string) {
  const now = new Date().toISOString();
  const rows = await marketingPersistenceRequest("marketing_sync_runs", { method: "POST", body: JSON.stringify({ organization_id: session.activeOrganization!.id, connection_id: account.connectionId, provider_account_id: account.id, sync_type: "insights_daily", mode: "incremental", status: "running", started_at: now, requested_by_user_id: session.user.id, metadata: { provider: "meta", apiVersion: META_INSIGHTS_API_VERSION, manual: true, since, until, reportingKey: REPORTING_KEY } }) });
  if (!rows[0]) throw new Error("Marketing Insights sync run could not be created.");
  return String(rows[0].id);
}
async function finishRun(orgId: string, runId: string, counters: Counters, status: "completed" | "failed", errorCode?: string) {
  const now = new Date().toISOString();
  await marketingPersistenceRequest(`marketing_sync_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(orgId)}`, { method: "PATCH", body: JSON.stringify({ status, completed_at: now, pages_completed: counters.pages, records_seen: counters.seen, records_created: counters.created, records_updated: counters.updated, records_unchanged: counters.unchanged, records_failed: counters.failed, last_error_code: errorCode || null, last_error_summary: errorCode ? "Meta Insights sync failed safely." : null, metadata: { provider: "meta", manual: true, reportingKey: REPORTING_KEY, costsCreated: counters.costsCreated, costsUpdated: counters.costsUpdated }, updated_at: now }) });
}
async function checkpoint(input: { orgId: string; connectionId: string; accountId: string; runId: string; page: number; before: string | null; after: string | null; rows: Row[]; persisted: number; failed: number; since: string; until: string }) {
  const ids = input.rows.map((row) => text(row.ad_id)).filter(Boolean) as string[];
  await marketingPersistenceRequest("marketing_sync_checkpoints", { method: "POST", body: JSON.stringify({ sync_run_id: input.runId, organization_id: input.orgId, connection_id: input.connectionId, provider_account_id: input.accountId, resource: "insights_daily", checkpoint_kind: "cursor", page: input.page, cursor_before: input.before, cursor_after: input.after, report_date_start: input.since, report_date_end: input.until, page_fingerprint: hash(input.rows), first_source_id: ids[0] || null, last_source_id: ids[ids.length - 1] || null, records_seen: input.rows.length, records_persisted: input.persisted, records_failed: input.failed, state: "completed", completed_at: new Date().toISOString(), metadata: { provider: "meta", apiVersion: META_INSIGHTS_API_VERSION, reportingKey: REPORTING_KEY } }) });
}
async function evidence(input: { orgId: string; connectionId: string; accountId: string; runId: string; row: Row; observedAt: string; reportDate: string; providerAdId: string }) {
  const payloadHash = hash(input.row);
  await marketingPersistenceRequest("marketing_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ organization_id: input.orgId, connection_id: input.connectionId, provider_account_id: input.accountId, sync_run_id: input.runId, provider: "meta", source_object_type: "insights_ad_daily", source_object_id: `${input.providerAdId}:${input.reportDate}:${REPORTING_KEY}`, source_endpoint: "insights", source_report_date: input.reportDate, payload_hash: payloadHash, storage_backend: "inline_json", inline_payload: input.row, api_version: META_INSIGHTS_API_VERSION, normalizer_version: NORMALIZER_VERSION, observed_at: input.observedAt, metadata: { manualInsightsSync: true, reportingKey: REPORTING_KEY, attributionSetting: ATTRIBUTION_SETTING } }) });
}

async function canonicalAds(orgId: string, accountId: string, rows: Row[]) {
  const ids = Array.from(new Set(rows.map((row) => text(row.ad_id)).filter(Boolean) as string[]));
  if (!ids.length) return new Map<string, Row>();
  const found = await marketingPersistenceRequest(`marketing_ads?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&provider_ad_id=in.(${ids.join(",")})&select=id,provider_ad_id,campaign_id,ad_group_id`);
  return new Map(found.map((row) => [String(row.provider_ad_id), row]));
}
async function existingFacts(orgId: string, accountId: string, rows: Row[]) {
  const byDate = new Map<string, Set<string>>();
  for (const row of rows) {
    const date = text(row.date_start); const adId = text(row.ad_id); if (!date || !adId) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date)!.add(adId);
  }
  const result = new Map<string, Row>();
  for (const [date, ids] of Array.from(byDate.entries())) {
    const found = await marketingPersistenceRequest(`marketing_performance_daily?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&report_date=eq.${encodeURIComponent(date)}&entity_level=eq.ad&provider_entity_id=in.(${Array.from(ids).join(",")})&reporting_key=eq.${encodeURIComponent(REPORTING_KEY)}`);
    for (const row of found) result.set(`${row.report_date}:${row.provider_entity_id}`, row);
  }
  return result;
}

async function projectSpend(input: { orgId: string; account: MarketingAccountRow; fact: Row; spend: number; currency: string; campaignId: string; adGroupId: string; adId: string; reportDate: string; observedAt: string; counters: Counters }) {
  const factId = String(input.fact.id);
  const existing = await marketingPersistenceRequest(`marketing_costs?organization_id=eq.${encodeURIComponent(input.orgId)}&source_performance_fact_id=eq.${encodeURIComponent(factId)}&cost_type=eq.ad_spend&calculation_version=eq.${encodeURIComponent(COST_CALCULATION_VERSION)}&limit=1`);
  const body = { amount: input.spend, currency: input.currency, campaign_id: input.campaignId, ad_group_id: input.adGroupId, ad_id: input.adId, last_calculated_at: input.observedAt, metadata: { provider: "meta", reportingKey: REPORTING_KEY }, updated_at: input.observedAt };
  if (existing[0]) {
    await marketingPersistenceRequest(`marketing_costs?id=eq.${encodeURIComponent(String(existing[0].id))}&organization_id=eq.${encodeURIComponent(input.orgId)}`, { method: "PATCH", body: JSON.stringify(body) });
    input.counters.costsUpdated += 1;
    return;
  }
  await marketingPersistenceRequest("marketing_costs", { method: "POST", body: JSON.stringify({ organization_id: input.orgId, connection_id: input.account.connectionId, provider_account_id: input.account.id, provider: "meta", cost_date: input.reportDate, cost_type: "ad_spend", currency: input.currency, amount: input.spend, campaign_id: input.campaignId, ad_group_id: input.adGroupId, ad_id: input.adId, source_performance_fact_id: factId, source_type: "provider_reported", allocation_status: "unallocated", first_calculated_at: input.observedAt, last_calculated_at: input.observedAt, calculation_version: COST_CALCULATION_VERSION, metadata: { provider: "meta", reportingKey: REPORTING_KEY } }) });
  input.counters.costsCreated += 1;
}

async function persistPage(input: { rows: Row[]; session: TraceKitSessionContext; account: MarketingAccountRow; runId: string; counters: Counters }) {
  const orgId = input.session.activeOrganization!.id;
  const ads = await canonicalAds(orgId, input.account.id, input.rows);
  const existing = await existingFacts(orgId, input.account.id, input.rows);
  const observedAt = new Date().toISOString();
  let persisted = 0; let failed = 0;
  for (const row of input.rows) {
    input.counters.seen += 1;
    const providerAdId = text(row.ad_id); const reportDate = text(row.date_start);
    if (!providerAdId || !reportDate) { input.counters.failed += 1; failed += 1; continue; }
    const canonical = ads.get(providerAdId);
    if (!canonical) { input.counters.failed += 1; failed += 1; continue; }
    const currency = (text(row.account_currency) || input.account.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { input.counters.failed += 1; failed += 1; continue; }
    const spend = decimal(row.spend, 0) ?? 0;
    const payloadHash = hash(row);
    const key = `${reportDate}:${providerAdId}`;
    const prior = existing.get(key);
    const normalized: Row = { currency, spend, impressions: integer(row.impressions), clicks: integer(row.clicks), reach: integer(row.reach), frequency: decimal(row.frequency), provider_reported_conversions: null, provider_reported_conversion_value: null, provider_actions: safeArray(row.actions), provider_action_values: safeArray(row.action_values), attribution_setting: ATTRIBUTION_SETTING, breakdown_dimensions: {}, last_observed_at: observedAt, payload_hash: payloadHash, normalizer_version: NORMALIZER_VERSION, api_version: META_INSIGHTS_API_VERSION, sync_run_id: input.runId, metadata: { provider: "meta", reportingKey: REPORTING_KEY, providerDateStop: text(row.date_stop) }, updated_at: observedAt };
    let fact: Row;
    if (prior && String(prior.payload_hash) === payloadHash) {
      const rows = await marketingPersistenceRequest(`marketing_performance_daily?id=eq.${encodeURIComponent(String(prior.id))}&organization_id=eq.${encodeURIComponent(orgId)}`, { method: "PATCH", body: JSON.stringify({ last_observed_at: observedAt, sync_run_id: input.runId, updated_at: observedAt }) });
      fact = rows[0] || prior; input.counters.unchanged += 1;
    } else if (prior) {
      const rows = await marketingPersistenceRequest(`marketing_performance_daily?id=eq.${encodeURIComponent(String(prior.id))}&organization_id=eq.${encodeURIComponent(orgId)}`, { method: "PATCH", body: JSON.stringify(normalized) });
      fact = rows[0] || { ...prior, ...normalized }; input.counters.updated += 1;
    } else {
      const rows = await marketingPersistenceRequest("marketing_performance_daily", { method: "POST", body: JSON.stringify({ ...normalized, organization_id: orgId, connection_id: input.account.connectionId, provider_account_id: input.account.id, provider: "meta", report_date: reportDate, entity_level: "ad", campaign_id: canonical.campaign_id, ad_group_id: canonical.ad_group_id, ad_id: canonical.id, provider_entity_id: providerAdId, reporting_key: REPORTING_KEY, first_observed_at: observedAt }) });
      if (!rows[0]) { input.counters.failed += 1; failed += 1; continue; }
      fact = rows[0]; input.counters.created += 1;
    }
    await evidence({ orgId, connectionId: input.account.connectionId, accountId: input.account.id, runId: input.runId, row, observedAt, reportDate, providerAdId });
    await projectSpend({ orgId, account: input.account, fact, spend, currency, campaignId: String(canonical.campaign_id), adGroupId: String(canonical.ad_group_id), adId: String(canonical.id), reportDate, observedAt, counters: input.counters });
    persisted += 1;
  }
  return { persisted, failed };
}

export async function runMetaInsightsSync(input: { session: TraceKitSessionContext; connectionId: string; since: string; until: string; accountIds?: string[] }) {
  const organization = requireManager(input.session);
  validateMetaInsightsRange(input.since, input.until);
  const connections = await listMetaConnections(organization.id);
  if (!connections.some((row) => row.id === input.connectionId && row.status === "connected")) throw new MetaOAuthError("resource_unavailable", "The requested Meta connection is unavailable.", 404);
  const accounts = (await listMetaAccounts(organization.id, input.connectionId)).filter((row) => (row.status === "active" || row.status === "degraded") && row.selectedForSync);
  const requested = input.accountIds?.length ? new Set(input.accountIds) : null;
  const targets = requested ? accounts.filter((row) => requested.has(row.id)) : accounts;
  if (requested && targets.length !== requested.size) throw new MetaOAuthError("invalid_request", "Only selected Meta accounts can be synchronized.", 400);
  if (!targets.length) throw new MetaOAuthError("meta_no_selected_accounts", "Select at least one Meta ad account before syncing Insights.", 409);
  const token = await accessToken(organization.id, input.connectionId);
  const results = [];
  for (const account of targets) {
    const counters: Counters = { seen: 0, created: 0, updated: 0, unchanged: 0, failed: 0, pages: 0, costsCreated: 0, costsUpdated: 0 };
    const runId = await createRun(input.session, account, input.since, input.until);
    try {
      const pages = await fetchMetaInsightsPages({ accessToken: token, accountExternalId: account.externalId, since: input.since, until: input.until });
      for (const page of pages) {
        const outcome = await persistPage({ rows: page.rows, session: input.session, account, runId, counters });
        counters.pages += 1;
        await checkpoint({ orgId: organization.id, connectionId: account.connectionId, accountId: account.id, runId, page: page.page, before: page.cursorBefore, after: page.cursorAfter, rows: page.rows, persisted: outcome.persisted, failed: outcome.failed, since: input.since, until: input.until });
      }
      const status = counters.failed ? "failed" : "completed";
      await finishRun(organization.id, runId, counters, status, counters.failed ? "meta_insights_record_failures" : undefined);
      const now = new Date().toISOString();
      await marketingPersistenceRequest(`marketing_provider_accounts?id=eq.${encodeURIComponent(account.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", body: JSON.stringify({ status: status === "completed" ? "active" : "degraded", last_success_at: status === "completed" ? now : null, last_error_at: status === "failed" ? now : null, last_error_code: status === "failed" ? "meta_insights_record_failures" : null, updated_at: now }) });
      results.push({ accountId: account.id, externalId: account.externalId, runId, status, since: input.since, until: input.until, reportingKey: REPORTING_KEY, ...counters });
    } catch (error) {
      const code = error instanceof MetaOAuthError ? error.code : "meta_insights_sync_failed";
      await finishRun(organization.id, runId, counters, "failed", code).catch(() => undefined);
      await marketingPersistenceRequest(`marketing_provider_accounts?id=eq.${encodeURIComponent(account.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", body: JSON.stringify({ status: "degraded", last_error_at: new Date().toISOString(), last_error_code: code, updated_at: new Date().toISOString() }) }).catch(() => undefined);
      results.push({ accountId: account.id, externalId: account.externalId, runId, status: "failed", errorCode: code, since: input.since, until: input.until, reportingKey: REPORTING_KEY, ...counters });
    }
  }
  return results;
}

export { REPORTING_KEY as META_INSIGHTS_REPORTING_KEY };

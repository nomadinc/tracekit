import "server-only";
import { createHash } from "node:crypto";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { fetchMetaHierarchyPages, META_HIERARCHY_API_VERSION, type MetaHierarchyResource } from "./meta-marketing-client";
import { listMetaAccounts, listMetaConnections, marketingPersistenceRequest, type MarketingAccountRow } from "./marketing-provider-repository";
import { MetaOAuthError } from "./meta-oauth";

type Row = Record<string, unknown>;
type Counters = { seen: number; created: number; updated: number; unchanged: number; failed: number; pages: number };
const NORMALIZER_VERSION = "meta-hierarchy-v1";

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
function hash(row: Row) { return createHash("sha256").update(stable(row)).digest("hex"); }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numeric(value: unknown) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }
function timestamp(value: unknown) { const raw = text(value); return raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null; }

async function accessToken(organizationId: string, connectionId: string) {
  const rows = await marketingPersistenceRequest(`marketing_provider_credentials?organization_id=eq.${encodeURIComponent(organizationId)}&connection_id=eq.${encodeURIComponent(connectionId)}&revoked_at=is.null&limit=1`);
  const row = rows[0];
  if (!row || row.storage_backend !== "database_encrypted") throw new MetaOAuthError("meta_credential_unavailable", "Meta authorization must be renewed before syncing.", 409);
  const key = decodeCommerceCredentialKey(process.env.MARKETING_CREDENTIALS_ENC_KEY);
  return decryptCommerceCredential({ keyId: String(row.encryption_key_id), encryptionVersion: Number(row.encryption_version), iv: bytes(row.secret_iv), ciphertext: bytes(row.secret_ciphertext) }, key);
}

async function createRun(session: TraceKitSessionContext, account: MarketingAccountRow) {
  const now = new Date().toISOString();
  const rows = await marketingPersistenceRequest("marketing_sync_runs", { method: "POST", body: JSON.stringify({ organization_id: session.activeOrganization!.id, connection_id: account.connectionId, provider_account_id: account.id, sync_type: "hierarchy", mode: "discovery", status: "running", started_at: now, requested_by_user_id: session.user.id, metadata: { provider: "meta", apiVersion: META_HIERARCHY_API_VERSION, manual: true } }) });
  if (!rows[0]) throw new Error("Marketing sync run could not be created.");
  return String(rows[0].id);
}
async function finishRun(orgId: string, runId: string, counters: Counters, status: "completed" | "failed", errorCode?: string) {
  const now = new Date().toISOString();
  await marketingPersistenceRequest(`marketing_sync_runs?id=eq.${encodeURIComponent(runId)}&organization_id=eq.${encodeURIComponent(orgId)}`, { method: "PATCH", body: JSON.stringify({ status, completed_at: now, pages_completed: counters.pages, records_seen: counters.seen, records_created: counters.created, records_updated: counters.updated, records_unchanged: counters.unchanged, records_failed: counters.failed, last_error_code: errorCode || null, last_error_summary: errorCode ? "Meta hierarchy sync failed safely." : null, updated_at: now }) });
}
async function checkpoint(input: { orgId: string; connectionId: string; accountId: string; runId: string; resource: string; page: number; before: string | null; after: string | null; rows: Row[]; persisted: number; failed: number }) {
  const ids = input.rows.map((row) => text(row.id)).filter(Boolean) as string[];
  await marketingPersistenceRequest("marketing_sync_checkpoints", { method: "POST", body: JSON.stringify({ sync_run_id: input.runId, organization_id: input.orgId, connection_id: input.connectionId, provider_account_id: input.accountId, resource: input.resource, checkpoint_kind: "cursor", page: input.page, cursor_before: input.before, cursor_after: input.after, page_fingerprint: createHash("sha256").update(input.rows.map(hash).join(":" )).digest("hex"), first_source_id: ids[0] || null, last_source_id: ids[ids.length - 1] || null, records_seen: input.rows.length, records_persisted: input.persisted, records_failed: input.failed, state: "completed", completed_at: new Date().toISOString(), metadata: { provider: "meta", apiVersion: META_HIERARCHY_API_VERSION } }) });
}
async function evidence(input: { orgId: string; connectionId: string; accountId: string; runId: string; type: string; row: Row; observedAt: string }) {
  const id = text(input.row.id); if (!id) return;
  const payloadHash = hash(input.row);
  await marketingPersistenceRequest("marketing_evidence_records?on_conflict=connection_id,provider_account_id,source_object_type,source_object_id,payload_hash", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ organization_id: input.orgId, connection_id: input.connectionId, provider_account_id: input.accountId, sync_run_id: input.runId, provider: "meta", source_object_type: input.type, source_object_id: id, source_endpoint: input.type, payload_hash: payloadHash, storage_backend: "inline_json", inline_payload: input.row, api_version: META_HIERARCHY_API_VERSION, normalizer_version: NORMALIZER_VERSION, observed_at: input.observedAt, source_updated_at: timestamp(input.row.updated_time), metadata: { manualHierarchySync: true } }) });
}

async function existingMap(table: string, providerIdColumn: string, orgId: string, accountId: string) {
  const rows = await marketingPersistenceRequest(`${table}?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&select=id,${providerIdColumn},raw_payload_hash`);
  return new Map(rows.map((row) => [String(row[providerIdColumn]), row]));
}

async function persistResource(input: { resource: MetaHierarchyResource; rows: Row[]; session: TraceKitSessionContext; account: MarketingAccountRow; runId: string; campaignIds: Map<string, string>; adGroupIds: Map<string, string>; creativeIds: Map<string, string>; currency: string | null; counters: Counters }) {
  const orgId = input.session.activeOrganization!.id;
  const table = input.resource === "campaigns" ? "marketing_campaigns" : input.resource === "adsets" ? "marketing_ad_groups" : input.resource === "adcreatives" ? "marketing_creatives" : "marketing_ads";
  const providerColumn = input.resource === "campaigns" ? "provider_campaign_id" : input.resource === "adsets" ? "provider_ad_group_id" : input.resource === "adcreatives" ? "provider_creative_id" : "provider_ad_id";
  const existing = await existingMap(table, providerColumn, orgId, input.account.id);
  const observedAt = new Date().toISOString();
  let persisted = 0;
  let failed = 0;
  for (const row of input.rows) {
    input.counters.seen += 1;
    const providerId = text(row.id);
    if (!providerId) { input.counters.failed += 1; failed += 1; continue; }
    try {
      const payloadHash = hash(row);
      const common: Row = { name: text(row.name), configured_status: text(row.status), effective_status: text(row.effective_status), provider_updated_at: timestamp(row.updated_time), last_observed_at: observedAt, raw_payload_hash: payloadHash, normalizer_version: NORMALIZER_VERSION, api_version: META_HIERARCHY_API_VERSION, updated_at: observedAt };
      let body: Row;
      if (input.resource === "campaigns") body = { ...common, objective: text(row.objective), buying_type: text(row.buying_type), spend_cap: numeric(row.spend_cap), currency: input.currency, provider_created_at: timestamp(row.created_time), metadata: { dailyBudget: numeric(row.daily_budget), lifetimeBudget: numeric(row.lifetime_budget), providerAmountsAreMinorUnits: true } };
      else if (input.resource === "adsets") {
        const campaignId = input.campaignIds.get(String(row.campaign_id)); if (!campaignId) throw new Error("campaign_parent_missing");
        body = { ...common, campaign_id: campaignId, optimization_goal: text(row.optimization_goal), billing_event: text(row.billing_event), bid_strategy: text(row.bid_strategy), daily_budget: numeric(row.daily_budget), lifetime_budget: numeric(row.lifetime_budget), currency: input.currency, start_at: timestamp(row.start_time), end_at: timestamp(row.end_time), provider_created_at: timestamp(row.created_time), metadata: { providerAmountsAreMinorUnits: true } };
      } else if (input.resource === "adcreatives") body = { name: text(row.name), creative_type: null, destination_url: text(row.object_url), thumbnail_reference: text(row.thumbnail_url), provider_story_id: text(row.object_story_id) || text(row.effective_object_story_id), provider_created_at: timestamp(row.created_time), provider_updated_at: null, last_observed_at: observedAt, raw_payload_hash: payloadHash, normalizer_version: NORMALIZER_VERSION, api_version: META_HIERARCHY_API_VERSION, metadata: { urlTags: text(row.url_tags) }, updated_at: observedAt };
      else {
        const campaignId = input.campaignIds.get(String(row.campaign_id)); const adGroupId = input.adGroupIds.get(String(row.adset_id));
        if (!campaignId || !adGroupId) throw new Error("ad_parent_missing");
        const creative = row.creative && typeof row.creative === "object" ? row.creative as Row : null;
        body = { ...common, campaign_id: campaignId, ad_group_id: adGroupId, creative_id: creative?.id ? input.creativeIds.get(String(creative.id)) || null : null, conversion_domain: text(row.conversion_domain), provider_created_at: timestamp(row.created_time), metadata: creative?.id && !input.creativeIds.has(String(creative.id)) ? { providerCreativeId: String(creative.id), creativeUnavailable: true } : {} };
      }
      const prior = existing.get(providerId);
      if (prior && String(prior.raw_payload_hash || "") === payloadHash) input.counters.unchanged += 1;
      else if (prior) { await marketingPersistenceRequest(`${table}?id=eq.${encodeURIComponent(String(prior.id))}&organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(input.account.id)}`, { method: "PATCH", body: JSON.stringify(body) }); input.counters.updated += 1; }
      else {
        const insert: Row = { ...body, organization_id: orgId, connection_id: input.account.connectionId, provider_account_id: input.account.id, provider: "meta", [providerColumn]: providerId, first_observed_at: observedAt };
        const rows = await marketingPersistenceRequest(table, { method: "POST", body: JSON.stringify(insert) });
        if (!rows[0]) throw new Error("hierarchy_insert_failed");
        existing.set(providerId, rows[0]); input.counters.created += 1;
      }
      await evidence({ orgId, connectionId: input.account.connectionId, accountId: input.account.id, runId: input.runId, type: input.resource === "adsets" ? "ad_group" : input.resource === "adcreatives" ? "creative" : input.resource.slice(0, -1), row, observedAt });
      persisted += 1;
    } catch { input.counters.failed += 1; failed += 1; }
  }
  return { persisted, failed };
}

async function idMaps(orgId: string, accountId: string) {
  const [campaigns, groups, creatives] = await Promise.all([
    marketingPersistenceRequest(`marketing_campaigns?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&select=id,provider_campaign_id`),
    marketingPersistenceRequest(`marketing_ad_groups?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&select=id,provider_ad_group_id`),
    marketingPersistenceRequest(`marketing_creatives?organization_id=eq.${encodeURIComponent(orgId)}&provider_account_id=eq.${encodeURIComponent(accountId)}&select=id,provider_creative_id`),
  ]);
  return {
    campaignIds: new Map(campaigns.map((row) => [String(row.provider_campaign_id), String(row.id)])),
    adGroupIds: new Map(groups.map((row) => [String(row.provider_ad_group_id), String(row.id)])),
    creativeIds: new Map(creatives.map((row) => [String(row.provider_creative_id), String(row.id)])),
  };
}

export async function runMetaHierarchySync(input: { session: TraceKitSessionContext; connectionId: string; accountIds?: string[] }) {
  const organization = requireManager(input.session);
  const connections = await listMetaConnections(organization.id);
  if (!connections.some((row) => row.id === input.connectionId && row.status === "connected")) throw new MetaOAuthError("resource_unavailable", "The requested Meta connection is unavailable.", 404);
  const accounts = (await listMetaAccounts(organization.id, input.connectionId)).filter((row) => row.status === "active" && row.selectedForSync);
  const requested = input.accountIds?.length ? new Set(input.accountIds) : null;
  const targets = requested ? accounts.filter((row) => requested.has(row.id)) : accounts;
  if (requested && targets.length !== requested.size) throw new MetaOAuthError("invalid_request", "Only selected active Meta accounts can be synchronized.", 400);
  if (!targets.length) throw new MetaOAuthError("meta_no_selected_accounts", "Select at least one Meta ad account before syncing hierarchy data.", 409);
  const token = await accessToken(organization.id, input.connectionId);
  const results = [];
  for (const account of targets) {
    const counters: Counters = { seen: 0, created: 0, updated: 0, unchanged: 0, failed: 0, pages: 0 };
    const runId = await createRun(input.session, account);
    try {
      for (const resource of ["campaigns", "adsets", "adcreatives", "ads"] as MetaHierarchyResource[]) {
        const pages = await fetchMetaHierarchyPages({ accessToken: token, accountExternalId: account.externalId, resource });
        for (const page of pages) {
          const maps = await idMaps(organization.id, account.id);
          const outcome = await persistResource({ resource, rows: page.rows, session: input.session, account, runId, ...maps, currency: account.currency, counters });
          counters.pages += 1;
          await checkpoint({ orgId: organization.id, connectionId: account.connectionId, accountId: account.id, runId, resource, page: page.page, before: page.cursorBefore, after: page.cursorAfter, rows: page.rows, persisted: outcome.persisted, failed: outcome.failed });
        }
      }
      const status = counters.failed ? "failed" : "completed";
      await finishRun(organization.id, runId, counters, status, counters.failed ? "meta_hierarchy_record_failures" : undefined);
      await marketingPersistenceRequest(`marketing_provider_accounts?id=eq.${encodeURIComponent(account.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", body: JSON.stringify({ last_success_at: status === "completed" ? new Date().toISOString() : null, last_error_at: status === "failed" ? new Date().toISOString() : null, last_error_code: status === "failed" ? "meta_hierarchy_record_failures" : null, updated_at: new Date().toISOString() }) });
      results.push({ accountId: account.id, externalId: account.externalId, runId, status, ...counters });
    } catch (error) {
      const code = error instanceof MetaOAuthError ? error.code : "meta_hierarchy_sync_failed";
      await finishRun(organization.id, runId, counters, "failed", code).catch(() => undefined);
      await marketingPersistenceRequest(`marketing_provider_accounts?id=eq.${encodeURIComponent(account.id)}&organization_id=eq.${encodeURIComponent(organization.id)}`, { method: "PATCH", body: JSON.stringify({ status: "degraded", last_error_at: new Date().toISOString(), last_error_code: code, updated_at: new Date().toISOString() }) }).catch(() => undefined);
      results.push({ accountId: account.id, externalId: account.externalId, runId, status: "failed", errorCode: code, ...counters });
    }
  }
  return results;
}

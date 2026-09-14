import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyCommasDisputeProjection, commasDisputeProjectionValues, normalizeCommasDisputeEvent, type NormalizedCommasDisputeEvent } from "../../api/src/commas-dispute-webhook.ts";

// Operator-only. Explicit frozen manifest; dry-run unless --apply and its hash are supplied.
const required = (key: string) => { const value = String(process.env[key] || "").trim(); if (!value) throw new Error(`${key} required`); return value; };
const org = required("TRACEKIT_COMMERCE_ORGANIZATION_ID"), connection = required("TRACEKIT_COMMERCE_CONNECTION_ID"), account = required("TRACEKIT_COMMERCE_PROVIDER_ACCOUNT_ID");
const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""), secret = required("SUPABASE_SERVICE_ROLE_KEY");
if (new URL(url).hostname !== "uoeosoiegatlqtzemsfv.supabase.co") throw new Error("project mismatch");
for (const id of [org, connection, account]) if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid scope");
const auth = { apikey: secret, ...(secret.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${secret}` }) };
const scope = `organization_id=eq.${org}&connection_id=eq.${connection}&provider_account_id=eq.${account}`;
const arg = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1] || null; };
const manifestPath = arg("--manifest");
if (!manifestPath) throw new Error("--manifest required");
const manifestBytes = readFileSync(manifestPath);
const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Record<string, any>;
if (manifest.project !== "uoeosoiegatlqtzemsfv" || manifest.organization !== org || manifest.connection !== connection || manifest.providerAccount !== account || !Array.isArray(manifest.events) || manifest.events.length < 1 || manifest.events.length > 100) throw new Error("frozen manifest scope/bound mismatch");
const apply = process.argv.includes("--apply");
if (apply && arg("--expected-manifest-sha256") !== manifestHash) throw new Error("apply requires reviewed manifest SHA-256");
type Row = Record<string, any>;
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`scoped persistence HTTP ${response.status}`);
  return response.status === 204 ? [] : await response.json() as Row[];
}
async function list(table: string, select: string, extra = "") {
  const rows = await request(`/rest/v1/${table}?select=${select}&${scope}${extra}&limit=1000`);
  if (rows.length === 1000) throw new Error("scoped read bound reached");
  return rows;
}
const contentHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function projectionRow(event: NormalizedCommasDisputeEvent, eventRow: Row, accountId: string) {
  return commasDisputeProjectionValues(event, { organizationId: org, accountId, connectionId: connection, providerAccountId: account, eventId: String(eventRow.id), evidenceId: String(eventRow.evidence_id) });
}
async function main() {
  const [events, evidence, projections, lifecycle] = await Promise.all([
    list("commerce_dispute_webhook_events", "id,account_id,provider_event_id,provider_dispute_id,event_type,evidence_id,payload_hash,provider_created_at,provider_updated_at,observed_at"),
    list("commerce_evidence_records", "id,source_object_id,payload_hash,storage_reference,pii_classification,source_object_type,deleted_at", "&source_object_type=eq.commas_dispute_webhook"),
    list("commerce_provider_disputes", "id,account_id,provider_dispute_id,latest_event_id,latest_evidence_id,updated_at"),
    list("commerce_provider_dispute_lifecycle_events", "id,webhook_event_id,dispute_id,event_type,payload_hash,status,state,reason,reason_code"),
  ]);
  const eventMap = new Map(events.map(row => [String(row.provider_event_id), row]));
  const eventIdMap = new Map(events.map(row => [String(row.id), row]));
  const evidenceMap = new Map(evidence.map(row => [String(row.id), row]));
  const projectionMap = new Map(projections.map(row => [String(row.provider_dispute_id), row]));
  const lifecycleMap = new Map(lifecycle.map(row => [String(row.webhook_event_id), row]));
  const payloadCache = new Map<string, NormalizedCommasDisputeEvent>();
  async function verified(eventRow: Row) {
    const cached = payloadCache.get(String(eventRow.id)); if (cached) return cached;
    const evidenceRow = evidenceMap.get(String(eventRow.evidence_id));
    if (!evidenceRow || evidenceRow.payload_hash !== eventRow.payload_hash || evidenceRow.source_object_id !== eventRow.provider_event_id || evidenceRow.deleted_at !== null || evidenceRow.pii_classification !== "restricted" || evidenceRow.source_object_type !== "commas_dispute_webhook") throw new Error("Evidence identity conflict");
    const prefix = `commerce-evidence/${org}/${connection}/${account}/commas-dispute-webhook/`;
    const ref = String(evidenceRow.storage_reference || "");
    if (!ref.startsWith(prefix)) throw new Error("Evidence scope conflict");
    const path = ref.slice("commerce-evidence/".length).split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${url}/storage/v1/object/commerce-evidence/${path}`, { headers: auth });
    if (!response.ok) throw new Error(`Evidence read HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (contentHash(bytes) !== eventRow.payload_hash) throw new Error("Evidence hash failure");
    let payload: unknown; try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Evidence JSON malformed"); }
    const normalized = normalizeCommasDisputeEvent(payload);
    if (!normalized || normalized.providerEventId !== eventRow.provider_event_id || normalized.providerDisputeId !== eventRow.provider_dispute_id || normalized.eventType !== eventRow.event_type || !normalized.updatedAt || !Number.isFinite(Date.parse(normalized.updatedAt))) throw new Error("Evidence normalization conflict");
    payloadCache.set(String(eventRow.id), normalized);
    return normalized;
  }
  const plans: Array<{ event: Row; normalized: NormalizedCommasDisputeEvent; projection: Row | undefined; projectionAction: string; createLifecycle: boolean }> = [];
  const counts: Record<string, number> = { alreadyComplete: 0, wouldCreateLifecycle: 0, wouldCreateProjection: 0, wouldAdvanceProjection: 0, staleProjectionEvent: 0, safeTieNoop: 0, ambiguousTie: 0 };
  for (const frozen of manifest.events as Row[]) {
    const event = eventMap.get(String(frozen.provider_event_id));
    if (!event || event.id !== frozen.id || event.evidence_id !== frozen.evidence_id || event.payload_hash !== frozen.payload_hash || event.provider_dispute_id !== frozen.provider_dispute_id || (frozen.event_type && event.event_type !== frozen.event_type) || Date.parse(String(event.provider_updated_at)) !== Date.parse(String(frozen.provider_updated_at))) throw new Error("frozen provider event conflict");
    const normalized = await verified(event);
    const projection = projectionMap.get(String(event.provider_dispute_id));
    const currentEvent = projection ? eventIdMap.get(String(projection.latest_event_id)) : null;
    if (projection && !currentEvent) throw new Error("latest projection event missing");
    const current = currentEvent ? await verified(currentEvent) : null;
    const projectionAction = classifyCommasDisputeProjection(normalized, current);
    const existingLifecycle = lifecycleMap.get(String(event.id));
    if (existingLifecycle && ((existingLifecycle.payload_hash !== null && existingLifecycle.payload_hash !== event.payload_hash) || existingLifecycle.event_type !== event.event_type || existingLifecycle.dispute_id !== projection?.id || existingLifecycle.status !== normalized.status || existingLifecycle.state !== normalized.state || existingLifecycle.reason !== normalized.reason || existingLifecycle.reason_code !== normalized.reasonCode)) throw new Error("lifecycle semantic conflict");
    const createLifecycle = !existingLifecycle;
    if (createLifecycle) counts.wouldCreateLifecycle++;
    if (projectionAction === "create") counts.wouldCreateProjection++;
    if (projectionAction === "advance") counts.wouldAdvanceProjection++;
    if (projectionAction === "stale") counts.staleProjectionEvent++;
    if (projectionAction === "safe_tie_noop") counts.safeTieNoop++;
    if (projectionAction === "ambiguous_tie") counts.ambiguousTie++;
    if (!createLifecycle && projectionAction !== "create" && projectionAction !== "advance") counts.alreadyComplete++;
    plans.push({ event, normalized, projection, projectionAction, createLifecycle });
  }
  if (plans.length !== manifest.events.length) throw new Error("frozen cohort incomplete");
  const mutatingProjectionCounts = new Map<string, number>();
  for (const plan of plans) if (plan.projectionAction === "create" || plan.projectionAction === "advance") mutatingProjectionCounts.set(String(plan.event.provider_dispute_id), (mutatingProjectionCounts.get(String(plan.event.provider_dispute_id)) || 0) + 1);
  if (Array.from(mutatingProjectionCounts.values()).some(count => count > 1)) throw new Error("multiple projection changes for one dispute require separate cohort plans");
  const planHash = createHash("sha256").update(JSON.stringify(plans.map(plan => ({ event: plan.event.id, latest: plan.projection?.latest_event_id || null, action: plan.projectionAction, lifecycle: plan.createLifecycle })))).digest("hex");
  if (apply && arg("--expected-plan-sha256") !== planHash) throw new Error("live plan changed since reviewed dry run");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", manifestSha256: manifestHash, planSha256: planHash, frozenEvents: plans.length, evidenceHashesVerified: payloadCache.size, ...counts }));
  if (!apply) return;
  const writes = { lifecycle: 0, projectionsCreated: 0, projectionsAdvanced: 0 };
  for (const plan of plans) {
    let projection = plan.projection;
    if (plan.projectionAction === "create") {
      const made = await request("/rest/v1/commerce_provider_disputes?select=id", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(projectionRow(plan.normalized, plan.event, String(plan.event.account_id))) });
      projection = made[0]; if (!projection?.id) throw new Error("projection creation failed"); writes.projectionsCreated++;
    } else if (plan.projectionAction === "advance" && projection) {
      const changed = await request(`/rest/v1/commerce_provider_disputes?id=eq.${projection.id}&${scope}&updated_at=lt.${encodeURIComponent(String(plan.normalized.updatedAt))}&select=id`, { method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(projectionRow(plan.normalized, plan.event, String(plan.event.account_id))) });
      if (changed.length !== 1) throw new Error("concurrent projection change; rerun dry-run"); writes.projectionsAdvanced++;
    }
    if (plan.createLifecycle) {
      if (!projection?.id) throw new Error("lifecycle projection unavailable");
      await request("/rest/v1/commerce_provider_dispute_lifecycle_events", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ organization_id: org, connection_id: connection, provider_account_id: account, dispute_id: projection.id, webhook_event_id: plan.event.id, event_type: plan.normalized.eventType, status: plan.normalized.status, state: plan.normalized.state, reason: plan.normalized.reason, reason_code: plan.normalized.reasonCode, observed_at: plan.event.observed_at, payload_hash: plan.event.payload_hash, metadata: { source: "commas_evidence_lifecycle_repair" } }) });
      writes.lifecycle++;
    }
  }
  console.log(JSON.stringify({ mode: "apply_result", ...writes }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "dispute lifecycle reprocessing failed"); process.exitCode = 1; });

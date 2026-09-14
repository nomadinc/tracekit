import { createHash } from "node:crypto";
import { classifyCommasDisputeProjection, normalizeCommasDisputeEvent, type NormalizedCommasDisputeEvent } from "../../api/src/commas-dispute-webhook.ts";

// Operator-only, read-only inspection. Inject the ignored local Supabase env and
// all three explicit commerce scope IDs. Use --gaps-only for the first pass.
// Never print payload values or storage references.
const required = (name: string) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const org = required("TRACEKIT_COMMERCE_ORGANIZATION_ID");
const connection = required("TRACEKIT_COMMERCE_CONNECTION_ID");
const account = required("TRACEKIT_COMMERCE_PROVIDER_ACCOUNT_ID");
const url = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
for (const value of [org, connection, account]) if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Invalid explicit commerce scope");
if (new URL(url).hostname !== "uoeosoiegatlqtzemsfv.supabase.co") throw new Error("Production project mismatch");
const key = required("SUPABASE_SERVICE_ROLE_KEY");
const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
const scope = `organization_id=eq.${encodeURIComponent(org)}&connection_id=eq.${encodeURIComponent(connection)}&provider_account_id=eq.${encodeURIComponent(account)}`;
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

async function rows(table: string, select: string, extra = "") {
  const response = await fetch(`${url}/rest/v1/${table}?select=${select}&${scope}${extra}`, { headers });
  if (!response.ok) throw new Error(`${table} read failed: HTTP ${response.status}`);
  return await response.json() as Row[];
}

function flatten(value: unknown, path = "", out: Record<string, string> = {}) {
  if (Array.isArray(value)) { out[path] = "array"; return out; }
  if (value && typeof value === "object") {
    for (const [name, child] of Object.entries(value)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) continue;
      flatten(child, path ? `${path}.${name}` : name, out);
    }
  } else if (path) out[path] = value === null ? "null" : typeof value;
  return out;
}

const candidate = /(transaction|ord|currency|amount|fee|debit|credit|recover|commission|ledger|economic|event|dispute|status|state|created|updated|opened|closed|payment|gateway|processor|buyer|customer|fan)/i;
async function main() {
  const events = await rows("commerce_dispute_webhook_events", "id,provider_event_id,provider_dispute_id,event_type,evidence_id,payload_hash,provider_created_at,provider_updated_at,observed_at", "&order=observed_at.asc,id.asc&limit=1000");
  if (events.length === 1000) throw new Error("Event cohort exceeds inspection bound");
  const evidence = await rows("commerce_evidence_records", "id,source_object_id,payload_hash,storage_reference,pii_classification,source_object_type,deleted_at", "&source_object_type=eq.commas_dispute_webhook&limit=1000");
  if (evidence.length === 1000) throw new Error("Evidence cohort exceeds inspection bound");
  const lifecycle = await rows("commerce_provider_dispute_lifecycle_events", "webhook_event_id,dispute_id,status,state,observed_at", "&limit=1000");
  if (lifecycle.length === 1000) throw new Error("Lifecycle cohort exceeds inspection bound");
  const projections = await rows("commerce_provider_disputes", "id,provider_dispute_id,latest_event_id,status,state", "&limit=1000");
  if (projections.length === 1000) throw new Error("Projection cohort exceeds inspection bound");
  const byEvidence = new Map(evidence.map(row => [String(row.id), row]));
  const byDispute = new Map(projections.map(row => [String(row.provider_dispute_id), row]));
  const lifecycleIds = new Set(lifecycle.map(row => String(row.webhook_event_id)));
  const fields = new Map<string, { count: number; types: Record<string, number> }>();
  const statuses: Record<string, number> = {};
  const identityPaths = { rootId: 0, rootEventId: 0, dataDisputeId: 0 };
  const observedStates: Array<{ dispute: string; event: string; providerTime: string; eventTime: string; status: string; dataHash: string; normalized: NormalizedCommasDisputeEvent }> = [];
  const daily: Record<string, { events: number; stringAmounts: number; numericAmounts: number }> = {};
  const amountRelations = { comparable: 0, totalEqualsAmountPlusFee: 0, totalEqualsAmount: 0 };
  const gaps: Record<string, number> = { projection_missing: 0, projection_exists: 0, later_lifecycle_exists: 0 };
  let hashesVerified = 0;
  // Verify and inspect the missing-lifecycle cohort first; cap concurrent object reads.
  events.sort((a, b) => Number(lifecycleIds.has(String(a.id))) - Number(lifecycleIds.has(String(b.id))));
  const selected = process.argv.includes("--gaps-only") ? events.filter(row => !lifecycleIds.has(String(row.id))) : events;
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const event = selected[cursor++];
    const ev = byEvidence.get(String(event.evidence_id));
    if (!ev || ev.source_object_type !== "commas_dispute_webhook" || ev.pii_classification !== "restricted" || ev.deleted_at !== null || ev.payload_hash !== event.payload_hash || ev.source_object_id !== event.provider_event_id) throw new Error("Restricted Evidence metadata mismatch");
    const reference = String(ev.storage_reference || "");
    const prefix = `${org}/${connection}/${account}/commas-dispute-webhook/`;
    if (!reference.startsWith(`commerce-evidence/${prefix}`)) throw new Error("Evidence storage scope mismatch");
    const path = reference.slice("commerce-evidence/".length).split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${url}/storage/v1/object/commerce-evidence/${path}`, { headers });
    if (!response.ok) throw new Error(`Restricted Evidence read failed: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== event.payload_hash) throw new Error("Restricted Evidence byte hash mismatch");
    hashesVerified++;
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error("Restricted Evidence JSON parse failed"); }
    const root = record(payload), data = record(root.data), dispute = record(data.dispute || data.chargeback || data.object || data);
    if (root.id !== undefined && root.id !== null) identityPaths.rootId++;
    if (root.event_id !== undefined && root.event_id !== null) identityPaths.rootEventId++;
    if (dispute.dispute_id !== undefined && dispute.dispute_id !== null) identityPaths.dataDisputeId++;
    if (String(root.id || root.event_id || "") !== event.provider_event_id || String(dispute.dispute_id || dispute.chargeback_id || dispute.id || "") !== event.provider_dispute_id || String(root.type || root.event_type || "") !== event.event_type) throw new Error("Provider event identity mismatch");
    for (const [pathName, type] of Object.entries(flatten(payload))) {
      if (!candidate.test(pathName)) continue;
      const entry = fields.get(pathName) || { count: 0, types: {} };
      if (type !== "null") entry.count++;
      entry.types[type] = (entry.types[type] || 0) + 1;
      fields.set(pathName, entry);
    }
    const rawStatus = String(dispute.status || dispute.state || "missing").toLowerCase();
    const status = ["needs_response", "under_review", "won", "lost", "lost_rdr", "missing"].includes(rawStatus) ? rawStatus : "other";
    statuses[status] = (statuses[status] || 0) + 1;
    const normalized = normalizeCommasDisputeEvent(payload);
    if (!normalized) throw new Error("Restricted Evidence normalization failed");
    observedStates.push({ dispute: String(event.provider_dispute_id), event: String(event.id), providerTime: String(dispute.updated_at || dispute.created_at || ""), eventTime: String(root.created_at || ""), status, dataHash: createHash("sha256").update(JSON.stringify(dispute)).digest("hex"), normalized });
    const day = String(event.observed_at).slice(0, 10);
    const dayRow = daily[day] || { events: 0, stringAmounts: 0, numericAmounts: 0 };
    dayRow.events++;
    if (typeof dispute.amount === "string") dayRow.stringAmounts++;
    if (typeof dispute.amount === "number") dayRow.numericAmounts++;
    daily[day] = dayRow;
    const amount = Number(dispute.amount), fee = Number(dispute.dispute_fee), total = Number(dispute.total_amount);
    if ([amount, fee, total].every(Number.isFinite)) {
      amountRelations.comparable++;
      if (Math.abs(total - amount - fee) < 0.000001) amountRelations.totalEqualsAmountPlusFee++;
      if (Math.abs(total - amount) < 0.000001) amountRelations.totalEqualsAmount++;
    }
    if (!lifecycleIds.has(String(event.id))) {
      const projection = byDispute.get(String(event.provider_dispute_id));
      gaps[projection ? "projection_exists" : "projection_missing"]++;
      if (events.some(other => other.provider_dispute_id === event.provider_dispute_id && String(other.observed_at) > String(event.observed_at) && lifecycleIds.has(String(other.id)))) gaps.later_lifecycle_exists++;
    }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  const ordering = { strictlyStale: 0, tiedDifferentEvent: 0, tiedSameStatus: 0, tiedSameData: 0, tiedLaterEventTime: 0, tiedSemanticIdentical: 0, tiedSemanticConflict: 0 };
  if (selected.length === events.length) {
    const grouped = new Map<string, typeof observedStates>();
    for (const row of observedStates) grouped.set(row.dispute, [...(grouped.get(row.dispute) || []), row]);
    for (const [disputeId, group] of Array.from(grouped.entries())) {
      const projection = byDispute.get(disputeId);
      const latest = group.find(row => row.event === projection?.latest_event_id);
      if (!latest) continue;
      const maxTime = group.map(row => row.providerTime).sort().at(-1);
      if (maxTime && latest.providerTime < maxTime) ordering.strictlyStale++;
      else {
        const peers = group.filter(row => row.event !== latest.event && row.providerTime === latest.providerTime);
        if (!peers.length) continue;
        ordering.tiedDifferentEvent++;
        if (peers.every(row => row.status === latest.status)) ordering.tiedSameStatus++;
        if (peers.every(row => row.dataHash === latest.dataHash)) ordering.tiedSameData++;
        if (peers.some(row => row.eventTime > latest.eventTime)) ordering.tiedLaterEventTime++;
        const tieDecisions = peers.map(row => classifyCommasDisputeProjection(row.normalized, latest.normalized));
        if (tieDecisions.includes("ambiguous_tie")) ordering.tiedSemanticConflict++;
        else if (tieDecisions.every(decision => decision === "safe_tie_noop")) ordering.tiedSemanticIdentical++;
      }
    }
  }
  console.log(JSON.stringify({ mode: "read_only", selectedEvents: selected.length, totalEvents: events.length, evidenceHashesVerified: hashesVerified, lifecycleRows: lifecycle.length, gapCount: events.filter(row => !lifecycleIds.has(String(row.id))).length, gaps, statuses, identityPaths, daily, amountRelations, ordering, fieldPaths: Object.fromEntries(Array.from(fields.entries()).sort(([a], [b]) => a.localeCompare(b))) }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Restricted inspection failed"); process.exitCode = 1; });

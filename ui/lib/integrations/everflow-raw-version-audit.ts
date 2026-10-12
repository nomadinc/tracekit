import "server-only";
import { createHash } from "node:crypto";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { EverflowInventoryError } from "./everflow-source-inventory";
import { normalizeEverflowConversion, type EverflowConversion } from "./everflow-conversions";

type Row = Record<string, any>;
const fail = () => { throw new EverflowInventoryError("everflow_retained_evidence_unverified"); };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}
const semanticHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** Only field paths and commitments leave this comparator; values never do. */
export function compareRawPayloads(retained: unknown, source: unknown) {
  const paths: string[] = [];
  function walk(a: any, b: any, path: string, depth: number) {
    if (semanticHash(a ?? null) === semanticHash(b ?? null) && (a === undefined) === (b === undefined)) return;
    if (paths.length >= 100 || depth >= 12) { paths.push(path || "$root"); return; }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) paths.push(`${path}.length`);
      for (let i = 0; i < Math.max(a.length, b.length) && paths.length < 100; i++) walk(a[i], b[i], `${path}[${i}]`, depth + 1);
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort()) {
        if (paths.length >= 100) break;
        const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key) ? key : "<dynamic_key>";
        walk(a[key], b[key], path ? `${path}.${safeKey}` : safeKey, depth + 1);
      }
      return;
    }
    paths.push(path || "$root");
  }
  walk(retained, source, "", 0);
  return { semanticEqual: paths.length === 0, retainedSemanticHash: semanticHash(retained), sourceSemanticHash: semanticHash(source), changedFieldPaths: Array.from(new Set(paths)).sort(), valuesIncluded: false };
}

export async function createEverflowRawVersionAudit(scope: { organizationId: string; connectionId: string; providerAccountId: string }, db = commercePersistenceRequest) {
  const local = new Map<string, Row>();
  const prefix = `organization_id=eq.${scope.organizationId}&connection_id=eq.${scope.connectionId}&provider_account_id=eq.${scope.providerAccountId}`;
  let after = "";
  for (let page = 0; page < 50; page++) {
    const rows = await db(`everflow_conversion_events?${prefix}&select=source_identity,payload_hash,evidence_id,evidence:commerce_evidence_records!everflow_conversion_events_evidence_id_fkey(id,organization_id,connection_id,provider_account_id,source_object_id,source_object_type,payload_hash,deleted_at,metadata)&order=source_identity.asc&limit=1000${after ? `&source_identity=gt.${after}` : ""}`);
    for (const row of rows) {
      const id = String(row.source_identity || "");
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || local.has(id)) fail();
      local.set(id, row);
    }
    if (rows.length < 1000) break;
    after = String(rows[rows.length - 1]?.source_identity || "");
    if (page === 49) throw new EverflowInventoryError("everflow_retained_inventory_bound");
  }
  const differences: Row[] = [];
  let matched = 0;
  let normalizedDifferences = 0;
  const missing: string[] = [];
  return {
    async onPage(sourceRows: EverflowConversion[]) {
      const changed: Array<{ source: EverflowConversion; local: Row }> = [];
      for (const source of sourceRows) {
        const row = local.get(source.sourceIdentity);
        if (!row) { missing.push(source.sourceIdentity); continue; }
        const evidence = row.evidence;
        if (!evidence || evidence.id !== row.evidence_id || evidence.organization_id !== scope.organizationId || evidence.connection_id !== scope.connectionId || evidence.provider_account_id !== scope.providerAccountId || evidence.source_object_type !== "everflow_conversion" || evidence.source_object_id !== source.sourceIdentity || evidence.deleted_at || evidence.metadata?.normalizedPayloadHash !== row.payload_hash) fail();
        matched++;
        if (source.payloadHash !== row.payload_hash) normalizedDifferences++;
        if (source.rawPayloadHash !== evidence.payload_hash) changed.push({ source, local: row });
      }
      if (differences.length + changed.length > 500) throw new EverflowInventoryError("everflow_raw_version_audit_bound");
      for (let offset = 0; offset < changed.length; offset += 50) {
        const batch = changed.slice(offset, offset + 50);
        const ids = batch.map(item => String(item.local.evidence_id));
        if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) fail();
        const retained = await db(`commerce_managed_evidence_payloads?organization_id=eq.${scope.organizationId}&evidence_id=in.(${ids.join(",")})&select=evidence_id,organization_id,payload&limit=50`);
        for (const item of batch) {
          const payloads = retained.filter(row => row.evidence_id === item.local.evidence_id && row.organization_id === scope.organizationId);
          const payload = payloads[0]?.payload as Record<string, unknown> | undefined;
          if (payloads.length !== 1 || !payload || typeof payload !== "object" || Array.isArray(payload) || payload.conversion_id !== item.source.sourceIdentity) fail();
          if ((await normalizeEverflowConversion(payload)).payloadHash !== item.local.payload_hash) fail();
          differences.push({ sourceIdentity: item.source.sourceIdentity, evidenceId: item.local.evidence_id, retainedRawHash: item.local.evidence.payload_hash, sourceRawHash: item.source.rawPayloadHash, normalizedEqual: item.source.payloadHash === item.local.payload_hash, ...compareRawPayloads(payload, item.source.rawPayload) });
        }
      }
    },
    result() { return { readOnly: true, sourceIdentitiesMatched: matched, missingSourceIdentities: missing.sort(), normalizedDifferences, rawVersionDifferences: differences.length, semanticallyEqualRawVersions: differences.filter(row => row.semanticEqual).length, substantivelyDifferentRawVersions: differences.filter(row => !row.semanticEqual).length, differences: differences.sort((a,b) => String(a.sourceIdentity).localeCompare(String(b.sourceIdentity))), valuesIncluded: false }; },
  };
}

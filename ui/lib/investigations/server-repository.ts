import "server-only";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { authorizeInvestigationAccess } from "./authorization";
import { assertClientSafePresentation, type InvestigationPresentation, type SafeInvestigationCandidate, type SafeInvestigationDetail, type SafeInvestigationSummary } from "./presentation";
import { buildInvestigationInspections } from "./inspection-presentation";

type Row = Record<string, unknown>;
const string = (value: unknown) => value == null ? "" : String(value);

async function context() {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("The requested resource is unavailable.");
  return { ...authorizeInvestigationAccess(resolution.session, resolution.session.activeOrganization.id), organizationName: resolution.session.activeOrganization.name };
}

async function investigationRows(organizationId: string, id?: string) {
  const idFilter = id ? `&id=eq.${encodeURIComponent(id)}` : "";
  return commercePersistenceRequest(`tracekit_investigations?organization_id=eq.${encodeURIComponent(organizationId)}${idFilter}&order=updated_at.desc`) as Promise<Row[]>;
}

export async function loadInvestigations(): Promise<SafeInvestigationSummary[]> {
  const scope = await context();
  const investigations = await investigationRows(scope.organizationId);
  return Promise.all(investigations.map(async (investigation) => {
    const versions = await commercePersistenceRequest(`tracekit_investigation_versions?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(string(investigation.id))}&order=version_number.desc&limit=1`) as Row[];
    const freshness=await commercePersistenceRequest(`tracekit_investigation_freshness?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(string(investigation.id))}&limit=1`) as Row[];
    return summary(investigation, versions[0], scope.organizationName, freshness[0]);
  }));
}

export async function loadInvestigationCandidates():Promise<SafeInvestigationCandidate[]> {
  const scope=await context();
  const rows=await commercePersistenceRequest(`tracekit_investigation_candidates?organization_id=eq.${encodeURIComponent(scope.organizationId)}&status=eq.needs_review&order=last_detected_at.desc&limit=20`) as Row[];
  return rows.map((row)=>({id:string(row.id),question:string(row.question),candidateType:string(row.candidate_type).replaceAll("_"," "),metric:string(row.metric),currentValue:row.current_value==null?null:string(row.current_value),baselineValue:row.baseline_value==null?null:string(row.baseline_value),sampleSize:Number(row.sample_size||0),period:`${shortDate(row.period_start)} – ${shortDate(row.period_end)}`,triggerReason:string(row.trigger_reason),status:string(row.status),existingInvestigationId:string(row.existing_investigation_id)||null}));
}

export async function loadInvestigation(id: string): Promise<SafeInvestigationDetail | null> {
  const scope = await context();
  const investigations = await investigationRows(scope.organizationId, id);
  if (!investigations[0]) return null;
  const versions = await commercePersistenceRequest(`tracekit_investigation_versions?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(id)}&order=version_number.desc&limit=1`) as Row[];
  if (!versions[0]) return null;
  const runId = string(versions[0].run_id);
  const runs = await commercePersistenceRequest(`tracekit_investigation_runs?organization_id=eq.${encodeURIComponent(scope.organizationId)}&id=eq.${encodeURIComponent(runId)}&limit=1`) as Row[];
  const presentation = versions[0].presentation as InvestigationPresentation;
  assertClientSafePresentation(presentation);
  const snapshot = (runs[0]?.source_snapshot || {}) as Record<string, unknown>;
  const parentId = string(investigations[0].parent_investigation_id);
  let parent: SafeInvestigationDetail["parent"] = null;
  if (parentId) {
    const parentRows = await investigationRows(scope.organizationId, parentId);
    const parentVersions = await commercePersistenceRequest(`tracekit_investigation_versions?organization_id=eq.${encodeURIComponent(scope.organizationId)}&id=eq.${encodeURIComponent(string(investigations[0].parent_investigation_version_id))}&investigation_id=eq.${encodeURIComponent(parentId)}&limit=1`) as Row[];
    if (!parentRows[0] || !parentVersions[0]) throw new Error("The requested resource is unavailable.");
    parent = { id: parentId, title: string(parentRows[0].title), question: string(parentRows[0].question), version: Number(parentVersions[0].version_number), branchSignal: string(investigations[0].branch_signal), branchReason: string(investigations[0].branch_reason) };
  }
  const branchRows = await commercePersistenceRequest(`tracekit_investigations?organization_id=eq.${encodeURIComponent(scope.organizationId)}&parent_investigation_id=eq.${encodeURIComponent(id)}&order=updated_at.desc`) as Row[];
  const branches = await Promise.all(branchRows.map(async branch => {
    const branchVersions = await commercePersistenceRequest(`tracekit_investigation_versions?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(string(branch.id))}&order=version_number.desc&limit=1`) as Row[];
    const branchFreshness=await commercePersistenceRequest(`tracekit_investigation_freshness?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(string(branch.id))}&limit=1`) as Row[];
    return summary(branch, branchVersions[0], scope.organizationName,branchFreshness[0]);
  }));
  const freshnessRows=await commercePersistenceRequest(`tracekit_investigation_freshness?organization_id=eq.${encodeURIComponent(scope.organizationId)}&investigation_id=eq.${encodeURIComponent(id)}&limit=1`) as Row[];
  const detail:Omit<SafeInvestigationDetail,"inspections"> = {
    ...summary(investigations[0], versions[0], scope.organizationName,freshnessRows[0]), runId,
    warnings: (((runs[0]?.warnings || []) as unknown[]) as Array<Record<string, unknown>>).map((item) => ({ code: string(item.code), message: string(item.message) })),
    versions: {
      commerce: string(runs[0]?.commerce_reconciliation_version), journey: string(runs[0]?.journey_linkage_version),
      dispute: string(runs[0]?.dispute_reconciliation_version), reason: string(runs[0]?.reason_normalization_version),
      cohort: string(runs[0]?.cohort_definition_version), algorithm: string(runs[0]?.algorithm_version),
    },
    presentation: { ...presentation, provenance: { ...presentation.provenance, evidenceRecords: string(snapshot.evidence_summary) || presentation.provenance.evidenceRecords } },
    parent, branches,
  };
  const inspections=buildInvestigationInspections(detail);
  assertClientSafePresentation(inspections,"inspections");
  return {...detail,inspections};
}

function summary(investigation: Row, version: Row | undefined, organizationName: string, freshness?:Row): SafeInvestigationSummary {
  return {
    id: string(investigation.id), title: string(investigation.title), organization: organizationName,
    type: string(investigation.trigger_type).replaceAll("_", " "),
    status: string(version?.status || investigation.status) as SafeInvestigationSummary["status"],
    period: version ? `${shortDate(version.period_start)} – ${shortDate(version.period_end)}` : "Analysis pending",
    primarySignal: string(version?.primary_signal) || "Analysis pending",
    evidenceQuality: string(version?.evidence_quality) || "pending",
    lastUpdated: string(version?.published_at || investigation.updated_at), version: Number(version?.version_number || 0),
    parentInvestigationId: string(investigation.parent_investigation_id) || null,
    freshnessStatus:(string(freshness?.freshness_status)||"current") as SafeInvestigationSummary["freshnessStatus"],
  };
}
function shortDate(value: unknown) { if (!value) return "Open"; return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(String(value))); }

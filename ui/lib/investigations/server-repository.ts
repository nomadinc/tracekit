import "server-only";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { authorizeInvestigationAccess } from "./authorization";
import { assertClientSafePresentation, type InvestigationPresentation, type SafeInvestigationDetail, type SafeInvestigationSummary } from "./presentation";

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
    return summary(investigation, versions[0], scope.organizationName);
  }));
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
  return {
    ...summary(investigations[0], versions[0], scope.organizationName), runId,
    warnings: (((runs[0]?.warnings || []) as unknown[]) as Array<Record<string, unknown>>).map((item) => ({ code: string(item.code), message: string(item.message) })),
    versions: {
      commerce: string(runs[0]?.commerce_reconciliation_version), journey: string(runs[0]?.journey_linkage_version),
      dispute: string(runs[0]?.dispute_reconciliation_version), reason: string(runs[0]?.reason_normalization_version),
      cohort: string(runs[0]?.cohort_definition_version), algorithm: string(runs[0]?.algorithm_version),
    },
    presentation: { ...presentation, provenance: { ...presentation.provenance, evidenceRecords: string(snapshot.evidence_summary) || presentation.provenance.evidenceRecords } },
  };
}

function summary(investigation: Row, version: Row | undefined, organizationName: string): SafeInvestigationSummary {
  return {
    id: string(investigation.id), title: string(investigation.title), organization: organizationName,
    type: string(investigation.trigger_type).replaceAll("_", " "),
    status: string(version?.status || investigation.status) as SafeInvestigationSummary["status"],
    period: version ? `${shortDate(version.period_start)} – ${shortDate(version.period_end)}` : "Analysis pending",
    primarySignal: string(version?.primary_signal) || "Analysis pending",
    evidenceQuality: string(version?.evidence_quality) || "pending",
    lastUpdated: string(version?.published_at || investigation.updated_at), version: Number(version?.version_number || 0),
  };
}
function shortDate(value: unknown) { if (!value) return "Open"; return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(String(value))); }

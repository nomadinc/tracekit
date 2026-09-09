import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

export type EverflowMetadataResource = "affiliates" | "offers";

export async function startEverflowMetadataSyncAudit(input: {
  organizationId: string;
  connectionId: string;
  resource: EverflowMetadataResource;
  requestId: string;
}) {
  const rows = await commercePersistenceRequest("everflow_metadata_sync_runs", {
    method: "POST",
    body: JSON.stringify({ organization_id: input.organizationId, connection_id: input.connectionId, resource: input.resource, request_id: input.requestId }),
  });
  if (!rows[0]?.id) throw new Error("Everflow metadata sync audit could not be started.");
  return String(rows[0].id);
}

export async function finishEverflowMetadataSyncAudit(input: {
  auditId: string;
  organizationId: string;
  providerAccountId?: string | null;
  status: "succeeded" | "failed";
  pages?: number;
  recordsSeen?: number;
  recordsPersisted?: number;
  errorCode?: string | null;
}) {
  await commercePersistenceRequest(`everflow_metadata_sync_runs?id=eq.${encodeURIComponent(input.auditId)}&organization_id=eq.${encodeURIComponent(input.organizationId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      provider_account_id: input.providerAccountId || null,
      status: input.status,
      pages: input.pages || 0,
      records_seen: input.recordsSeen || 0,
      records_persisted: input.recordsPersisted || 0,
      error_code: input.errorCode ? input.errorCode.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 100) : null,
      completed_at: new Date().toISOString(),
    }),
  });
}

export function everflowMetadataErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) return String((error as { code?: unknown }).code || "metadata_sync_failed");
  return "metadata_sync_failed";
}

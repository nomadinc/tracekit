export type ImportJobInsertPayloadInput = {
  id?: string | null;
  workspace_id?: string | null;
  platform: string;
  connector_id?: string | null;
  job_type?: string | null;
  phase?: string | null;
  module?: string | null;
  status: string;
  from: string;
  to: string;
  filter?: string | null;
  metadata?: Record<string, any> | null;
  progress: Record<string, any> | null;
};

export function normalizeImportJobMetadata(metadata: Record<string, any> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata;
}

export function buildImportJobInsertPayload(args: ImportJobInsertPayloadInput, now = new Date().toISOString()) {
  return {
    ...(args.id ? { id: args.id } : {}),
    workspace_id: String(args.workspace_id || "default").trim() || "default",
    platform: args.platform,
    connector_id: args.connector_id ?? null,
    job_type: args.job_type ?? null,
    phase: args.phase ?? null,
    module: args.module ?? null,
    status: args.status,
    from_date: args.from,
    to_date: args.to,
    requested_from: args.from,
    requested_to: args.to,
    filter: args.filter ?? null,
    metadata: normalizeImportJobMetadata(args.metadata),
    progress: args.progress,
    requested_at: now,
    updated_at: now,
  };
}

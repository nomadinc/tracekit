import { createShopifyBulkReader, parseShopifyBulkJsonl, type ShopifyBulkOperation } from "./bulk-reader";
import { createShopifyNormalizedWriter } from "./normalized-writer";
import { recordsForShopifyPage } from "./persistence";
import { initialShopifyCheckpoint, normalizeShopifyCheckpoint, type ShopifyResource, type ShopifySyncPage } from "./resources";

const BULK_PREFIX = "shopify_bulk";

type Scope = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
};

type BulkRun = {
  id: string;
  status: string;
  metadata?: Record<string, unknown> | null;
};

type BulkStateStore = {
  latest(scope: Scope): Promise<BulkRun | null>;
  create(scope: Scope, metadata: Record<string, unknown>): Promise<BulkRun>;
  update(scope: Scope, runId: string, body: Record<string, unknown>): Promise<void>;
};

type BulkReader = {
  start(args: { resource: ShopifyResource; before: string }): Promise<ShopifyBulkOperation>;
  get(operationId: string): Promise<ShopifyBulkOperation | null>;
  download(url: string): Promise<string>;
};

type BulkWriter = (records: ReturnType<typeof recordsForShopifyPage>, provenance: { syncRunId: string; page: ShopifySyncPage }) => Promise<void>;

export async function runShopifyBulkHistoricalResource(args: Scope & {
  historicalCutoff: string;
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}) {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) throw new Error("Shopify bulk historical persistence is unavailable.");

  const reader = createShopifyBulkReader({
    shopDomain: args.shopDomain,
    accessToken: args.accessToken,
    apiVersion: args.apiVersion,
  });
  const store = createShopifyBulkStateStore({ url, serviceRoleKey });
  const writer = createShopifyNormalizedWriter({ url, serviceRoleKey });
  return advanceShopifyBulkBackfill({
    ...args,
    historicalCutoff: normalizeCutoff(args.historicalCutoff),
    reader,
    store,
    writer,
  });
}

export async function advanceShopifyBulkBackfill(args: Scope & {
  historicalCutoff: string;
  reader: BulkReader;
  store: BulkStateStore;
  writer: BulkWriter;
}) {
  const cutoff = normalizeCutoff(args.historicalCutoff);
  let run = await args.store.latest(args);

  if (run?.status === "completed" && metadataCutoff(run.metadata) === cutoff) {
    return { outcome: "complete" as const, runId: run.id, alreadyComplete: true, records: metadataNumber(run.metadata, "records_seen") };
  }

  if (!run || metadataCutoff(run.metadata) !== cutoff || run.status === "failed") {
    const operation = await args.reader.start({ resource: args.resource, before: cutoff });
    run = await args.store.create(args, operationMetadata(operation, cutoff));
    return { outcome: "started" as const, runId: run.id, operationId: operation.id, status: operation.status };
  }

  const expectedOperationId = metadataString(run.metadata, "bulk_operation_id");
  if (!expectedOperationId) throw new Error("Shopify bulk run is missing its operation id.");
  const operation = await args.reader.get(expectedOperationId);
  if (!operation) {
    throw new Error("Shopify bulk operation is no longer available for the persisted TraceKit run.");
  }
  if (operation.id !== expectedOperationId) {
    throw new Error("Shopify bulk operation id does not match the persisted TraceKit run.");
  }

  if (isFailure(operation.status)) {
    await args.store.update(args, run.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      last_error_code: operation.errorCode || "shopify_bulk_failed",
      last_error_summary: `Shopify bulk operation ended with status ${operation.status}.`,
      metadata: operationMetadata(operation, cutoff),
    });
    return { outcome: "failed" as const, runId: run.id, operationId: operation.id, status: operation.status };
  }

  if (operation.status !== "COMPLETED") {
    await args.store.update(args, run.id, { metadata: operationMetadata(operation, cutoff) });
    return { outcome: "waiting" as const, runId: run.id, operationId: operation.id, status: operation.status };
  }

  if (!operation.url) throw new Error("Completed Shopify bulk operation is missing its result URL.");
  const jsonl = await args.reader.download(operation.url);
  const nodes = parseShopifyBulkJsonl(args.resource, jsonl);
  const checkpoint = normalizeShopifyCheckpoint({ ...initialShopifyCheckpoint(), historicalCutoff: cutoff, page: 1 });
  const nextCheckpoint = normalizeShopifyCheckpoint({ ...checkpoint, cursor: null, page: 2 });
  const page: ShopifySyncPage = {
    resource: args.resource,
    nodes,
    checkpoint,
    nextCheckpoint,
    hasNextPage: false,
  };
  const records = recordsForShopifyPage({
    organizationId: args.organizationId,
    connectionId: args.connectionId,
    providerAccountId: args.providerAccountId,
    page,
  });
  await args.writer(records, { syncRunId: run.id, page });
  const completedAt = new Date().toISOString();
  await args.store.update(args, run.id, {
    status: "completed",
    completed_at: completedAt,
    pages_completed: 1,
    records_seen: records.length,
    last_error_code: null,
    last_error_summary: null,
    metadata: { ...operationMetadata(operation, cutoff), records_seen: records.length, persisted_at: completedAt },
  });
  return { outcome: "complete" as const, runId: run.id, operationId: operation.id, records: records.length, alreadyComplete: false };
}

export function createShopifyBulkStateStore(config: { url: string; serviceRoleKey: string; fetchImpl?: typeof fetch }): BulkStateStore {
  const baseUrl = String(config.url || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(config.serviceRoleKey || "").trim();
  if (!baseUrl || !serviceRoleKey) throw new Error("Shopify bulk persistence requires Supabase URL and service-role credentials.");
  const fetchImpl = config.fetchImpl || fetch;

  async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`Shopify bulk persistence failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const syncType = (resource: ShopifyResource) => `${BULK_PREFIX}_${resource}`;
  const scopeQuery = (scope: Scope) => [
    `organization_id=eq.${encodeURIComponent(scope.organizationId)}`,
    `connection_id=eq.${encodeURIComponent(scope.connectionId)}`,
    `provider_account_id=eq.${encodeURIComponent(scope.providerAccountId)}`,
  ].join("&");

  return {
    async latest(scope) {
      const rows = await request<BulkRun[]>(`commerce_sync_runs?${scopeQuery(scope)}&sync_type=eq.${encodeURIComponent(syncType(scope.resource))}&select=id,status,metadata&order=created_at.desc&limit=1`);
      return rows[0] || null;
    },
    async create(scope, metadata) {
      const rows = await request<BulkRun[]>("commerce_sync_runs?select=id,status,metadata", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: scope.organizationId,
          connection_id: scope.connectionId,
          provider_account_id: scope.providerAccountId,
          sync_type: syncType(scope.resource),
          mode: "shadow",
          status: "running",
          started_at: new Date().toISOString(),
          metadata,
        }),
      });
      if (!rows[0]?.id) throw new Error("Shopify bulk sync run was not created.");
      return rows[0];
    },
    async update(scope, runId, body) {
      await request(`commerce_sync_runs?${scopeQuery(scope)}&id=eq.${encodeURIComponent(runId)}&sync_type=eq.${encodeURIComponent(syncType(scope.resource))}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      });
    },
  };
}

function operationMetadata(operation: ShopifyBulkOperation, cutoff: string) {
  return {
    bulk_operation_id: operation.id,
    bulk_status: operation.status,
    bulk_error_code: operation.errorCode,
    bulk_object_count: operation.objectCount,
    bulk_file_size: operation.fileSize,
    bulk_created_at: operation.createdAt,
    bulk_completed_at: operation.completedAt,
    historical_cutoff: cutoff,
  };
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = String(metadata?.[key] ?? "").trim();
  return value || null;
}

function metadataCutoff(metadata: Record<string, unknown> | null | undefined) {
  const value = metadataString(metadata, "historical_cutoff");
  return value ? normalizeCutoff(value) : null;
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(metadata?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function isFailure(status: string) {
  return status === "FAILED" || status === "CANCELED" || status === "EXPIRED";
}

function normalizeCutoff(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) throw new Error("Shopify bulk historical cutoff is invalid.");
  return date.toISOString();
}

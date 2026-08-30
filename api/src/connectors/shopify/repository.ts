import { normalizeShopifyCheckpoint, type ShopifyCheckpoint, type ShopifyResource, type ShopifySyncPage } from "./resources";
import { recordsForShopifyPage, type ShopifyPersistence, type ShopifyPersistedRecord, type ShopifySyncState } from "./persistence";

export type CommerceRepositoryClient = {
  latestShopifyRun(args: Scope & { resource: ShopifyResource }): Promise<{ id: string; status: string } | null>;
  latestShopifyCheckpoint(args: Scope & { syncRunId: string; resource: ShopifyResource }): Promise<{ metadata?: Record<string, unknown>; state?: string } | null>;
  createShopifyRun(args: Scope & { resource: ShopifyResource; checkpoint: ShopifyCheckpoint }): Promise<{ id: string }>;
  appendShopifyCheckpoint(args: Scope & { syncRunId: string; page: ShopifySyncPage }): Promise<void>;
  finishShopifyRun(args: Scope & { syncRunId: string; resource: ShopifyResource; checkpoint: ShopifyCheckpoint; pagesCompleted: number; recordsSeen: number }): Promise<void>;
  failShopifyRun(args: Scope & { syncRunId: string; resource: ShopifyResource; checkpoint: ShopifyCheckpoint; pagesCompleted: number; recordsSeen: number; error: string }): Promise<void>;
};

export type ShopifyRecordWriter = (
  records: ShopifyPersistedRecord[],
  context: { syncRunId: string; page: ShopifySyncPage },
) => Promise<void>;

type Scope = { organizationId: string; connectionId: string; providerAccountId: string };
type ActiveRun = { syncRunId: string; pagesCompleted: number; recordsSeen: number };

export function createShopifyPersistenceRepository(args: {
  client: CommerceRepositoryClient;
  writeRecords: ShopifyRecordWriter;
}): ShopifyPersistence {
  const active = new Map<string, ActiveRun>();

  return {
    async loadState(input) {
      const scope = requireScope(input);
      const run = await args.client.latestShopifyRun({ ...scope, resource: input.resource });
      if (!run) return null;
      const row = await args.client.latestShopifyCheckpoint({ ...scope, syncRunId: run.id, resource: input.resource });
      const checkpoint = checkpointFromMetadata(row?.metadata);
      return {
        ...scope,
        resource: input.resource,
        checkpoint,
        status: run.status === "failed" ? "failed" : "idle",
        lastError: null,
      } satisfies ShopifySyncState;
    },

    async begin(input) {
      const scope = requireScope(input);
      const run = await args.client.createShopifyRun({ ...scope, resource: input.resource, checkpoint: normalizeShopifyCheckpoint(input.checkpoint) });
      active.set(key(scope, input.resource), { syncRunId: run.id, pagesCompleted: 0, recordsSeen: 0 });
    },

    async persistPage(input) {
      const scope = requireScope(input);
      const run = requireActive(active, scope, input.page.resource);
      const records = recordsForShopifyPage({ ...scope, page: input.page });
      await args.writeRecords(records, { syncRunId: run.syncRunId, page: input.page });
      await args.client.appendShopifyCheckpoint({ ...scope, syncRunId: run.syncRunId, page: input.page });
      run.pagesCompleted += 1;
      run.recordsSeen += records.length;
    },

    async complete(input) {
      const scope = requireScope(input);
      const runKey = key(scope, input.resource);
      const run = requireActive(active, scope, input.resource);
      await args.client.finishShopifyRun({ ...scope, syncRunId: run.syncRunId, resource: input.resource, checkpoint: normalizeShopifyCheckpoint(input.checkpoint), pagesCompleted: run.pagesCompleted, recordsSeen: run.recordsSeen });
      active.delete(runKey);
    },

    async fail(input) {
      const scope = requireScope(input);
      const runKey = key(scope, input.resource);
      const run = active.get(runKey);
      if (!run) return;
      await args.client.failShopifyRun({ ...scope, syncRunId: run.syncRunId, resource: input.resource, checkpoint: normalizeShopifyCheckpoint(input.checkpoint), pagesCompleted: run.pagesCompleted, recordsSeen: run.recordsSeen, error: input.error });
      active.delete(runKey);
    },
  };
}

export function checkpointMetadata(checkpoint: ShopifyCheckpoint) {
  return { shopify_checkpoint: normalizeShopifyCheckpoint(checkpoint) };
}

export function checkpointFromMetadata(metadata: Record<string, unknown> | null | undefined): ShopifyCheckpoint {
  const raw = metadata?.shopify_checkpoint;
  return normalizeShopifyCheckpoint(raw && typeof raw === "object" ? raw as Partial<ShopifyCheckpoint> : null);
}

function requireScope(input: Scope): Scope {
  const organizationId = String(input.organizationId || "").trim();
  const connectionId = String(input.connectionId || "").trim();
  const providerAccountId = String(input.providerAccountId || "").trim();
  if (!organizationId || !connectionId || !providerAccountId) throw new Error("Shopify repository requires tenant, connection, and provider account scope.");
  return { organizationId, connectionId, providerAccountId };
}

function key(scope: Scope, resource: ShopifyResource) {
  return `${scope.organizationId}:${scope.connectionId}:${scope.providerAccountId}:${resource}`;
}

function requireActive(active: Map<string, ActiveRun>, scope: Scope, resource: ShopifyResource) {
  const run = active.get(key(scope, resource));
  if (!run) throw new Error(`Shopify ${resource} sync has no active commerce sync run.`);
  return run;
}

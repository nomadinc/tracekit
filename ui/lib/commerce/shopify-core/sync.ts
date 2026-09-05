import { initialShopifyCheckpoint, normalizeShopifyCheckpoint, type ShopifyCheckpoint, type ShopifyResource, type ShopifySyncPage } from "./resources";
import type { ShopifyPersistence } from "./persistence";

export type ShopifyPageReader = (args: {
  resource: ShopifyResource;
  checkpoint: ShopifyCheckpoint;
}) => Promise<ShopifySyncPage>;

export type RunShopifyReadSyncArgs = {
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  resource: ShopifyResource;
  readPage: ShopifyPageReader;
  persistence: ShopifyPersistence;
  maxPages?: number;
};

export type ShopifyReadSyncResult = {
  resource: ShopifyResource;
  pages: number;
  records: number;
  checkpoint: ShopifyCheckpoint;
};

export type ShopifySyncFailureStage =
  | "state_load"
  | "run_begin"
  | "source_read"
  | "page_validate"
  | "page_persist"
  | "run_complete"
  | "run_fail";

export class ShopifySyncStageError extends Error {
  readonly stage: ShopifySyncFailureStage;
  readonly code: string;
  readonly diagnosticMessage: string;

  constructor(stage: ShopifySyncFailureStage, code: string, error: unknown) {
    super(code);
    this.name = "ShopifySyncStageError";
    this.stage = stage;
    this.code = code;
    this.diagnosticMessage = error instanceof Error ? error.message : String(error);
  }
}

export async function runShopifyReadSync(args: RunShopifyReadSyncArgs): Promise<ShopifyReadSyncResult> {
  const scope = requireScope(args);
  let existing: Awaited<ReturnType<ShopifyPersistence["loadState"]>>;
  try {
    existing = await args.persistence.loadState({ ...scope, resource: args.resource });
  } catch (error) {
    throw asStageError("state_load", "shopify_state_load_failed", error);
  }

  let checkpoint = normalizeShopifyCheckpoint(existing?.checkpoint || initialShopifyCheckpoint());
  const maxPages = Number.isInteger(args.maxPages) && Number(args.maxPages) > 0 ? Number(args.maxPages) : 1000;

  try {
    await args.persistence.begin({ ...scope, resource: args.resource, checkpoint });
  } catch (error) {
    throw asStageError("run_begin", "shopify_run_begin_failed", error);
  }

  let pages = 0;
  let records = 0;
  try {
    while (pages < maxPages) {
      let page: ShopifySyncPage;
      try {
        page = await args.readPage({ resource: args.resource, checkpoint });
      } catch (error) {
        throw asStageError("source_read", "shopify_source_read_failed", error);
      }

      try {
        if (page.resource !== args.resource) throw new Error("Shopify page resource does not match requested sync resource.");
        const normalizedPageCheckpoint = normalizeShopifyCheckpoint(page.checkpoint);
        if (normalizedPageCheckpoint.page !== checkpoint.page || normalizedPageCheckpoint.cursor !== checkpoint.cursor) {
          throw new Error("Shopify page checkpoint does not match requested checkpoint.");
        }
      } catch (error) {
        throw asStageError("page_validate", "shopify_page_validation_failed", error);
      }

      try {
        await args.persistence.persistPage({ ...scope, page });
      } catch (error) {
        throw asStageError("page_persist", "shopify_page_persist_failed", error);
      }

      pages += 1;
      records += page.nodes.length;
      checkpoint = normalizeShopifyCheckpoint(page.nextCheckpoint);

      if (!page.hasNextPage) {
        try {
          await args.persistence.complete({ ...scope, resource: args.resource, checkpoint });
        } catch (error) {
          throw asStageError("run_complete", "shopify_run_complete_failed", error);
        }
        return { resource: args.resource, pages, records, checkpoint };
      }
    }

    throw asStageError("page_validate", "shopify_max_pages_exceeded", new Error(`Shopify sync exceeded maxPages=${maxPages}.`));
  } catch (error) {
    const staged = error instanceof ShopifySyncStageError
      ? error
      : asStageError("page_validate", "shopify_sync_unclassified_failed", error);

    try {
      await args.persistence.fail({
        ...scope,
        resource: args.resource,
        checkpoint,
        error: `${staged.code}: ${staged.diagnosticMessage}`,
      });
    } catch (failError) {
      throw new ShopifySyncStageError(
        "run_fail",
        "shopify_run_fail_record_failed",
        `${staged.code}; fail_record=${failError instanceof Error ? failError.message : String(failError)}`,
      );
    }
    throw staged;
  }
}

function asStageError(stage: ShopifySyncFailureStage, code: string, error: unknown) {
  return error instanceof ShopifySyncStageError ? error : new ShopifySyncStageError(stage, code, error);
}

function requireScope(args: Pick<RunShopifyReadSyncArgs, "organizationId" | "connectionId" | "providerAccountId">) {
  const organizationId = String(args.organizationId || "").trim();
  const connectionId = String(args.connectionId || "").trim();
  const providerAccountId = String(args.providerAccountId || "").trim();
  if (!organizationId || !connectionId || !providerAccountId) throw new Error("Shopify sync requires tenant, connection, and provider account scope.");
  return { organizationId, connectionId, providerAccountId };
}

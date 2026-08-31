import assert from "node:assert/strict";
import test from "node:test";
import { createShopifyPersistenceRepository, checkpointMetadata, type CommerceRepositoryClient } from "./connectors/shopify/repository";
import { runShopifyReadSync } from "./connectors/shopify/sync";
import type { ShopifyCheckpoint, ShopifyResource, ShopifySyncPage } from "./connectors/shopify/resources";

const scope = { organizationId: "org-1", connectionId: "conn-1", providerAccountId: "acct-1" };

test("Shopify persistence keeps tenant scope on every record and resumes after the last durable page", async () => {
  let currentRun: { id: string; status: string } | null = null;
  let checkpointRow: { metadata: Record<string, unknown>; state: string } | null = null;
  let runNumber = 0;
  const written: Array<{ organizationId: string; connectionId: string; providerAccountId: string; providerObjectId: string }> = [];

  const client: CommerceRepositoryClient = {
    async latestShopifyRun() { return currentRun; },
    async latestShopifyCheckpoint() { return checkpointRow; },
    async createShopifyRun() { currentRun = { id: `run-${++runNumber}`, status: "running" }; return { id: currentRun.id }; },
    async appendShopifyCheckpoint(args) {
      checkpointRow = { metadata: checkpointMetadata(args.page.nextCheckpoint), state: "completed" };
    },
    async finishShopifyRun() { if (currentRun) currentRun.status = "completed"; },
    async failShopifyRun() { if (currentRun) currentRun.status = "failed"; },
  };

  const makePersistence = () => createShopifyPersistenceRepository({
    client,
    writeRecords: async (records) => {
      for (const record of records) written.push({
        organizationId: record.organizationId,
        connectionId: record.connectionId,
        providerAccountId: record.providerAccountId,
        providerObjectId: record.providerObjectId,
      });
    },
  });

  const firstPages: ShopifySyncPage[] = [
    page("orders", { cursor: null, updatedAt: null, page: 1 }, { cursor: "cursor-1", updatedAt: "2026-08-30T20:00:00Z", page: 2 }, ["gid://shopify/Order/1"]),
  ];
  let firstRead = 0;
  await assert.rejects(() => runShopifyReadSync({
    ...scope,
    resource: "orders",
    persistence: makePersistence(),
    readPage: async () => {
      if (firstRead++ === 0) return firstPages[0];
      throw new Error("temporary Shopify failure");
    },
  }), /temporary Shopify failure/);

  assert.equal(currentRun?.status, "failed");
  assert.deepEqual(checkpointRow?.metadata.shopify_checkpoint, { cursor: "cursor-1", updatedAt: "2026-08-30T20:00:00.000Z", page: 2 });

  let resumedFrom: ShopifyCheckpoint | null = null;
  const result = await runShopifyReadSync({
    ...scope,
    resource: "orders",
    persistence: makePersistence(),
    readPage: async ({ checkpoint }) => {
      resumedFrom = checkpoint;
      return page("orders", checkpoint, { cursor: null, updatedAt: "2026-08-30T20:05:00Z", page: 3 }, ["gid://shopify/Order/2"], false);
    },
  });

  assert.deepEqual(resumedFrom, { cursor: "cursor-1", updatedAt: "2026-08-30T20:00:00.000Z", page: 2 });
  assert.equal(result.records, 1);
  assert.equal(currentRun?.status, "completed");
  assert.deepEqual(written.map((record) => record.providerObjectId), ["gid://shopify/Order/1", "gid://shopify/Order/2"]);
  assert.ok(written.every((record) => record.organizationId === scope.organizationId && record.connectionId === scope.connectionId && record.providerAccountId === scope.providerAccountId));
});

test("Shopify sync rejects missing tenant scope before reading provider data", async () => {
  const persistence = createShopifyPersistenceRepository({
    client: noopClient(),
    writeRecords: async () => undefined,
  });
  await assert.rejects(() => runShopifyReadSync({ ...scope, organizationId: "", resource: "orders", persistence, readPage: async () => { throw new Error("should not read"); } }), /requires tenant/);
});

function page(resource: ShopifyResource, checkpoint: ShopifyCheckpoint, nextCheckpoint: ShopifyCheckpoint, ids: string[], hasNextPage = true): ShopifySyncPage {
  return { resource, checkpoint, nextCheckpoint, hasNextPage, nodes: ids.map((id) => ({ id, updatedAt: nextCheckpoint.updatedAt })) };
}

function noopClient(): CommerceRepositoryClient {
  return {
    async latestShopifyRun() { return null; },
    async latestShopifyCheckpoint() { return null; },
    async createShopifyRun() { return { id: "run" }; },
    async appendShopifyCheckpoint() {},
    async finishShopifyRun() {},
    async failShopifyRun() {},
  };
}

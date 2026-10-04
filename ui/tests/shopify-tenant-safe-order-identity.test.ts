import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveShopifyOrderWriteIdentity } from "../lib/commerce/shopify-core/normalized-writer";

const tenantA = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
  providerAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
  shopDomain: "shared.myshopify.com",
};
const tenantB = {
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  connectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
  providerAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
  accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03",
  shopDomain: "shared.myshopify.com",
};
const order = {
  platform_order_id: "shopify:shared.myshopify.com:gid://shopify/Order/42",
  provider_order_id: "gid://shopify/Order/42",
};
const mappingA = { id: "map-a", canonicalObjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa42" };
const mappingB = { id: "map-b", canonicalObjectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb42" };

type Row = {
  platform_order_id: string;
  canonical_order_id: string | null;
  organization_id: string | null;
  connection_id: string | null;
  provider_account_id: string | null;
  provider_order_id: string | null;
};

function requestWith(scoped: Row[], compatibility: Row[]) {
  const paths: string[] = [];
  const request = async (path: string) => {
    paths.push(path);
    return path.includes("connection_id=eq.") ? scoped : compatibility;
  };
  return { request: request as any, paths };
}

function row(context: typeof tenantA, mapping = mappingA, platformOrderId = order.platform_order_id): Row {
  return {
    platform_order_id: platformOrderId,
    canonical_order_id: mapping.canonicalObjectId,
    organization_id: context.organizationId,
    connection_id: context.connectionId,
    provider_account_id: context.providerAccountId,
    provider_order_id: order.provider_order_id,
  };
}

test("tenant A reuses its existing normalized Order identity on replay", async () => {
  const existing = row(tenantA);
  const { request, paths } = requestWith([existing], []);
  assert.equal(await resolveShopifyOrderWriteIdentity(request, tenantA, order, mappingA), existing.platform_order_id);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /connection_id=eq\.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01/);
  assert.match(paths[0], /provider_account_id=eq\.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02/);
  assert.match(paths[0], /provider_order_id=eq\.gid%3A%2F%2Fshopify%2FOrder%2F42/);
});

test("tenant B receives a deterministic scoped locator when tenant A owns the compatibility locator", async () => {
  const { request } = requestWith([], [row(tenantA)]);
  const identity = await resolveShopifyOrderWriteIdentity(request, tenantB, order, mappingB);
  assert.equal(identity, `shopify:${tenantB.connectionId}:${tenantB.providerAccountId}:${order.provider_order_id}`);
  assert.notEqual(identity, order.platform_order_id);
});

test("different connections in one organization remain distinct provider/source identities", async () => {
  const secondConnection = { ...tenantA, connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99", providerAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa98" };
  const secondMapping = { id: "map-second", canonicalObjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99" };
  const { request } = requestWith([], [row(tenantA)]);
  const identity = await resolveShopifyOrderWriteIdentity(request, secondConnection, order, secondMapping);
  assert.equal(identity, `shopify:${secondConnection.connectionId}:${secondConnection.providerAccountId}:${order.provider_order_id}`);
});

test("ambiguous unowned legacy compatibility rows fail closed", async () => {
  const legacy = row(tenantA);
  legacy.organization_id = null;
  legacy.connection_id = null;
  legacy.provider_account_id = null;
  const { request } = requestWith([], [legacy]);
  await assert.rejects(
    resolveShopifyOrderWriteIdentity(request, tenantA, order, mappingA),
    /refused ambiguous legacy Order ownership/,
  );
});

test("canonical disagreement in the same provider/source scope fails closed", async () => {
  const inconsistent = row(tenantA, { ...mappingA, canonicalObjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0099" });
  const { request } = requestWith([inconsistent], []);
  await assert.rejects(
    resolveShopifyOrderWriteIdentity(request, tenantA, order, mappingA),
    /refused inconsistent scoped Order ownership/,
  );
});

test("same-scope compatibility ownership without the authoritative source match fails closed", async () => {
  const { request } = requestWith([], [row(tenantA)]);
  await assert.rejects(
    resolveShopifyOrderWriteIdentity(request, tenantA, order, mappingA),
    /refused an inconsistent same-scope Order identity/,
  );
});

for (const relativePath of [
  "lib/commerce/shopify-core/normalized-writer.ts",
  "../api/src/connectors/shopify/normalized-writer.ts",
]) {
  test(`${relativePath} writes by provider/source scope without permitting canonical reassignment`, () => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
    assert.match(source, /platform_orders\?on_conflict=connection_id,provider_account_id,provider_order_id/);
    assert.doesNotMatch(source, /platform_orders\?on_conflict=platform_order_id/);
    assert.match(source, /canonical_order_id: mapping\.canonicalObjectId/);
    assert.match(source, /existing\.canonical_order_id !== mapping\.canonicalObjectId/);
    assert.match(source, /refused ambiguous legacy Order ownership/);
  });
}

test("migration exposes the scoped provider/source identity as an inferable conflict target", () => {
  const source = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/20261004024308_shopify_tenant_safe_order_identity.sql"),
    "utf8",
  );
  assert.match(source, /create unique index if not exists platform_orders_provider_source_conflict_uidx/);
  assert.match(source, /\(connection_id, provider_account_id, provider_order_id\)/);
  assert.doesNotMatch(source, /where\s+connection_id is not null/i);
  assert.doesNotMatch(source, /cascade|drop constraint|delete from|update public\.platform_orders/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../lib/commerce/evidence-store";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";

const scope = { organizationId: "10000000-0000-0000-0000-000000000001", connectionId: "20000000-0000-0000-0000-000000000001", providerAccountId: "30000000-0000-0000-0000-000000000001", sourceObjectType: "transaction_page" };

function storageHarness() {
  const objects = new Map<string, Uint8Array>();
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic-service-role";
  const requests: RequestInit[] = [];
  globalThis.fetch = async (input, init = {}) => {
    requests.push(init);
    const path = new URL(String(input)).pathname.replace("/storage/v1/object/commerce-evidence/", "");
    if (init.method === "POST") {
      if (objects.has(path)) return new Response(JSON.stringify({ message: "Duplicate" }), { status: 400 });
      objects.set(path, new Uint8Array(init.body as ArrayBufferLike));
      return Response.json({ Key: path }, { status: 200 });
    }
    if (init.method === "DELETE") { objects.delete(path); return new Response(null, { status: 200 }); }
    const value = objects.get(path);
    return value ? new Response(Buffer.from(value), { status: 200 }) : new Response(null, { status: 404 });
  };
  return { objects, requests, restore: () => { globalThis.fetch = originalFetch; } };
}

test("durable Evidence is hash-addressed, idempotent, private-path scoped, and erasable", async () => {
  const harness = storageHarness();
  try {
    const store = new SupabaseCommerceEvidenceStore();
    const payload = new TextEncoder().encode('{"email":"synthetic@example.invalid"}');
    const first = await store.putImmutable({ ...scope, payload, contentType: "application/json" });
    const repeated = await store.putImmutable({ ...scope, payload, contentType: "application/json" });
    assert.equal(first.storageReference, repeated.storageReference);
    assert.equal(harness.objects.size, 1);
    const firstHeaders = new Headers(harness.requests[0].headers);
    assert.equal(firstHeaders.get("apikey"), "sb_secret_synthetic-service-role");
    assert.equal(firstHeaders.has("authorization"), false);
    assert.equal("cache" in harness.requests[0], false);
    assert.match(first.storageReference, new RegExp(`${scope.organizationId}/${scope.connectionId}/${scope.providerAccountId}/transaction_page/[a-f0-9]{64}$`));
    assert.doesNotMatch(first.storageReference, /synthetic@example/);
    assert.equal(await store.verifyHash({ organizationId: scope.organizationId, storageReference: first.storageReference, payloadHash: first.payloadHash }), true);
    assert.equal(await store.getAuthorized({ organizationId: "90000000-0000-0000-0000-000000000009", storageReference: first.storageReference }), null);
    await store.markErased({ organizationId: scope.organizationId, storageReference: first.storageReference });
    assert.equal(await store.getAuthorized({ organizationId: scope.organizationId, storageReference: first.storageReference }), null);
  } finally { harness.restore(); }
});

test("tampered existing Evidence is detected and cannot be overwritten", async () => {
  const harness = storageHarness();
  try {
    const store = new SupabaseCommerceEvidenceStore();
    const payload = new TextEncoder().encode("expected");
    const hash = await sha256Hex(payload);
    const path = `${scope.organizationId}/${scope.connectionId}/${scope.providerAccountId}/${scope.sourceObjectType}/${hash}`;
    harness.objects.set(path, new TextEncoder().encode("tampered"));
    await assert.rejects(() => store.putImmutable({ ...scope, payload, contentType: "application/json" }), /immutably/);
    assert.equal(new TextDecoder().decode(harness.objects.get(path)), "tampered");
  } finally { harness.restore(); }
});

test("duplicate storage response retries verification and reuses only a matching immutable object", async () => {
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic-service-role";
  const payload = new TextEncoder().encode("retryable");
  const hash = await sha256Hex(payload);
  const path = `${scope.organizationId}/${scope.connectionId}/${scope.providerAccountId}/${scope.sourceObjectType}/${hash}`;
  let gets = 0;
  globalThis.fetch = async (input, init = {}) => {
    const requestPath = new URL(String(input)).pathname.replace("/storage/v1/object/commerce-evidence/", "");
    if (init.method === "POST") return new Response(null, { status: 409 });
    if (init.method === "GET" && requestPath === path) {
      gets += 1;
      return gets === 1 ? new Response(null, { status: 503 }) : new Response(payload, { status: 200 });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const stored = await new SupabaseCommerceEvidenceStore().putImmutable({ ...scope, payload, contentType: "application/json" });
    assert.equal(stored.payloadHash, hash);
    assert.equal(gets, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("non-conflict storage failure is classified without an unsafe GET or overwrite", async () => {
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic-service-role";
  let gets = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method === "GET") gets += 1;
    return new Response(null, { status: 500 });
  };
  try {
    await assert.rejects(() => new SupabaseCommerceEvidenceStore().putImmutable({ ...scope, payload: new TextEncoder().encode("server-failure"), contentType: "application/json" }), /storage POST failed/);
    assert.equal(gets, 0);
  } finally { globalThis.fetch = originalFetch; }
});

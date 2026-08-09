import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "../lib/commerce/evidence-store";
import { SupabaseCommerceEvidenceStore } from "../lib/commerce/supabase-evidence-store-core";

const scope = { organizationId: "10000000-0000-0000-0000-000000000001", connectionId: "20000000-0000-0000-0000-000000000001", providerAccountId: "30000000-0000-0000-0000-000000000001", sourceObjectType: "transaction_page" };

function storageHarness() {
  const objects = new Map<string, Uint8Array>();
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
  globalThis.fetch = async (input, init = {}) => {
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
  return { objects, restore: () => { globalThis.fetch = originalFetch; } };
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

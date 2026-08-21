import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseIdentityTenancyRepository } from "../lib/identity/supabase-identity-repository";

const envKeys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

async function withFakeSupabase(key: string, responseFor: (url: string) => unknown, run: (headers: Array<Record<string, string>>) => Promise<void>) {
  const previous = Object.fromEntries(envKeys.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  const headers: Array<Record<string, string>> = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  globalThis.fetch = (async (input, init) => {
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response(JSON.stringify(responseFor(String(input))), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(headers);
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of envKeys) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("new sb_secret keys use apikey authentication without JWT Bearer", async () => {
  await withFakeSupabase("sb_secret_test", () => [], async (headers) => {
    assert.equal(await new SupabaseIdentityTenancyRepository().isEmptyInstallation(), true);
    assert.equal(headers.length, 3);
    for (const requestHeaders of headers) {
      assert.equal(requestHeaders.apikey, "sb_secret_test");
      assert.equal(requestHeaders.authorization, undefined);
    }
  });
});

test("legacy JWT service-role keys retain Bearer authentication", async () => {
  await withFakeSupabase("eyJhbGciOiJIUzI1NiJ9.legacy", () => [], async (headers) => {
    await new SupabaseIdentityTenancyRepository().isEmptyInstallation();
    assert.match(headers[0].authorization || "", /^Bearer eyJ/);
  });
});

test("empty-installation detection distinguishes bootstrap from ordinary no-membership", async () => {
  await withFakeSupabase("sb_secret_test", (url) => url.includes("tracekit_organizations") ? [{ id: "org_existing" }] : [], async () => {
    assert.equal(await new SupabaseIdentityTenancyRepository().isEmptyInstallation(), false);
  });
  await withFakeSupabase("sb_secret_test", () => [], async () => {
    assert.equal(await new SupabaseIdentityTenancyRepository().isEmptyInstallation(), true);
  });
});

test("synchronizeUser updates an existing WorkOS identity without merge-upsert", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({ method: init?.method || "GET", url });
    return new Response(JSON.stringify([{ id: "user-1", workos_user_id: "workos-1", primary_email: "user@example.invalid", display_name: "Test User", status: "active" }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await new SupabaseIdentityTenancyRepository().synchronizeUser({ id: "workos-1", email: "user@example.invalid", firstName: "Test", lastName: "User", profilePictureUrl: null });
    assert.equal(result.id, "user-1");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "PATCH");
    assert.match(requests[0].url, /tracekit_users\?workos_user_id=eq\.workos-1$/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

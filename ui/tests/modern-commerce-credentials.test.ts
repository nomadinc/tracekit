import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { commercePersistenceRequest, commercePersistenceCount } from "../lib/commerce/supabase-control-repository";

const keys = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"] as const;
async function runWith(secret: string | undefined, alias: string | undefined, run: (requests: Request[]) => Promise<void>) {
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const original = globalThis.fetch;
  const requests: Request[] = [];
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret !== undefined) process.env.SUPABASE_SECRET_KEY = secret;
  if (alias !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = alias;
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json([{ id: "user-1", workos_user_id: "workos-1", primary_email: "test@example.invalid", display_name: "Test", status: "active" }], {headers:{"content-range":"0-0/1"}});
  };
  try { await run(requests); }
  finally {
    globalThis.fetch = original;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}

test("commerce request/count select modern secret ahead of a stale legacy binding", async () => {
  await runWith("sb_secret_synthetic_modern", "eyJstale.legacy.jwt", async requests => {
    await commercePersistenceRequest("canonical_offers", {method:"PATCH",body:"{}"});
    assert.equal(await commercePersistenceCount("canonical_offers"),1);
    const count = requests.pop()!;
    assert.equal(count.headers.get("authorization"),null);
    assert.equal(count.headers.get("apikey"),"sb_secret_synthetic_modern");
    assert.equal(count.headers.get("prefer"),"count=exact");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "PATCH");
    assert.equal(requests[0].headers.get("apikey"), "sb_secret_synthetic_modern");
    assert.equal(requests[0].headers.get("authorization"), null);
  });
});

test("invalid explicit modern credentials never fall back or reach transport", async () => {
  for (const key of ["", "eyJlegacy.jwt", "sb_publishable_synthetic", " sb_secret_synthetic", "sb_secret_synthetic\n"]) {
    await runWith(key, "sb_secret_valid_alias", async requests => {
      await assert.rejects(() => commercePersistenceRequest("canonical_offers"), /modern Supabase secret/i);
      await assert.rejects(() => commercePersistenceCount("canonical_offers"), /modern Supabase secret/i);
      assert.equal(requests.length, 0);
    });
  }
});

test("missing modern key cannot silently reuse a legacy JWT or a publishable key", async () => {
  for (const alias of [undefined, "eyJlegacy.jwt", "sb_publishable_synthetic"]) {
    await runWith(undefined, alias, async requests => {
      await assert.rejects(() => commercePersistenceRequest("canonical_offers"), /modern Supabase secret/i);
      await assert.rejects(() => commercePersistenceCount("canonical_offers"), /modern Supabase secret/i);
      assert.equal(requests.length, 0);
    });
  }
});

test("credential selector cannot be imported under the client module condition", () => {
  const moduleUrl = new URL("../lib/identity/supabase-server-secret.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl)})`], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be imported from a Client Component module/);
});

test("modern secret stored under the historical alias supports request and count", async () => {
 await runWith(undefined,"sb_secret_valid_alias",async requests=>{
  await commercePersistenceRequest("canonical_offers");
  assert.equal(await commercePersistenceCount("canonical_offers"),1);
  for(const request of requests){assert.equal(request.headers.get("apikey"),"sb_secret_valid_alias");assert.equal(request.headers.get("authorization"),null);}
 });
});

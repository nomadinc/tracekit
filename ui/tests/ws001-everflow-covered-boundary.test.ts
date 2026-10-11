import assert from "node:assert/strict";
import test from "node:test";
import { everflowIncrementalWindow, markEverflowIncrementalChunkSuccess } from "../lib/integrations/everflow-incremental";
import { everflowClickIncrementalWindow, markEverflowClickIncrementalChunkSuccess } from "../lib/integrations/everflow-click-incremental";

test("finishing an old source window cannot skip uncovered days", () => {
  const now = new Date("2026-10-11T21:55:00Z");
  for (const window of [everflowIncrementalWindow, everflowClickIncrementalWindow]) {
    const recovered = window({now,lastSuccessfulAt:now.toISOString(),boundary:{providerFrom:"2026-10-04 00:00:00",providerTo:"2026-10-04 23:59:59"},overlapDays:2});
    assert.equal(recovered.from, "2026-10-02 00:00:00");
    assert.equal(recovered.targetTo, "2026-10-11 23:59:59");
    assert.equal(recovered.resumed, false);
    const active = window({now,lastSuccessfulAt:now.toISOString(),boundary:{incrementalCursorFrom:"2026-10-02 00:00:00",incrementalTargetTo:"2026-10-04 23:59:59",incrementalPage:4}});
    assert.equal(active.from,"2026-10-02 00:00:00");
    assert.equal(active.targetTo,"2026-10-04 23:59:59");
    assert.equal(active.resumed,true);
    assert.equal(window({now,lastSuccessfulAt:now.toISOString(),overlapDays:2}).from,"2026-10-09 00:00:00");
    assert.throws(() => window({now,lastSuccessfulAt:now.toISOString(),boundary:{providerTo:"2026-08-01 23:59:59"}}), /governed recovery outside/);
  }
});

test("persisting an old final page records its source boundary without claiming current freshness", async () => {
  const original = globalThis.fetch;
  const originalURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic";
  const patches: any[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PATCH") patches.push(JSON.parse(String(init.body)));
    return Response.json([]);
  };
  try {
    const result = await markEverflowIncrementalChunkSuccess({organizationId:"org",connectionId:"connection",providerAccountId:"provider",completedAt:"2026-10-11T21:55:00Z",syncRunId:"run",from:"2026-10-04 00:00:00",to:"2026-10-04 23:59:59",targetTo:"2026-10-04 23:59:59",overlapDays:2,bootstrap:false,seen:1,sourceComplete:true});
    assert.equal(result.windowComplete,true);
    assert.equal(patches[0].status,"stale");
    assert.equal(patches[0].last_stability_boundary.providerTo,"2026-10-04 23:59:59");
    assert.equal(everflowIncrementalWindow({now:new Date("2026-10-11T22:00:00Z"),lastSuccessfulAt:patches[0].last_successful_at,boundary:patches[0].last_stability_boundary}).from,"2026-10-02 00:00:00");
    await markEverflowClickIncrementalChunkSuccess({organizationId:"org",connectionId:"connection",providerAccountId:"provider",completedAt:"2026-10-11T21:55:00Z",from:"2026-10-04 00:00:00",to:"2026-10-04 23:59:59",targetTo:"2026-10-04 23:59:59",overlapDays:2,bootstrap:false,seen:1});
    assert.equal(patches[1].status,"stale");
    assert.equal(everflowClickIncrementalWindow({now:new Date("2026-10-11T22:00:00Z"),lastSuccessfulAt:patches[1].last_successful_at,boundary:patches[1].last_stability_boundary,overlapDays:2}).from,"2026-10-02 00:00:00");
    await markEverflowIncrementalChunkSuccess({organizationId:"org",connectionId:"connection",providerAccountId:"provider",completedAt:"2026-10-11T21:55:00Z",syncRunId:"run",from:"2026-10-11 00:00:00",to:"2026-10-11 23:59:59",targetTo:"2026-10-11 23:59:59",overlapDays:2,bootstrap:false,seen:1,sourceComplete:true});
    assert.equal(patches[2].status,"current");
  } finally {
    globalThis.fetch = original;
    if (originalURL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalURL;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

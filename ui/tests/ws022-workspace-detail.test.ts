import test from "node:test";
import assert from "node:assert/strict";
import { currentWorkspaceDetail } from "../lib/navigation/workspace-detail";
import { verifyManagedPreview } from "../scripts/verify-managed-preview.mjs";

test("detail remains loading until a matching request resolves; old row or scope is hidden synchronously", () => {
  const scope = {}, foreignScope = {};
  const previous = { scope, id: "A", status: "ready" as const, value: { id: "A" } };
  assert.equal(currentWorkspaceDetail(null, scope, "A").status, "loading");
  assert.equal(currentWorkspaceDetail(previous, scope, "B").value, null);
  assert.equal(currentWorkspaceDetail(previous, foreignScope, "A").value, null);
  assert.equal(currentWorkspaceDetail(previous, scope, "A").value?.id, "A");
  assert.equal(currentWorkspaceDetail({ ...previous, status: "unavailable", value: null }, scope, "A").status, "unavailable");
  assert.equal(currentWorkspaceDetail({ ...previous, status: "missing", value: null }, scope, "A").status, "missing");
});
test("managed Preview build validates identity pairing and refuses wrong project without forwarding a secret", async () => {
  const env = { VERCEL_ENV: "preview", VERCEL_PROJECT_ID: "prj_KPHnqsNayx17VXmMIp7Rasrsp7gc", VERCEL_GIT_COMMIT_REF: "ws022/acceptance-runtime-diagnosis", VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_URL: "tracekit-test.vercel.app", NEXT_PUBLIC_SUPABASE_URL: "https://uoeosoiegatlqtzemsfv.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic", TRACEKIT_USE_STAGING_CORE_CREDENTIAL: "enabled" };
  let calls = 0;
  const request: typeof fetch = async (input, options) => { calls++; assert.equal(new URL(String(input)).searchParams.get("limit"), "0"); assert.equal(options?.redirect, "error"); return new Response("[]"); };
  assert.equal((await verifyManagedPreview(env, request)).ok, true);
  assert.equal(calls, 1);
  await assert.rejects(verifyManagedPreview({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://foreign.supabase.co" }, request));
  assert.equal(calls, 1);
  await assert.rejects(verifyManagedPreview({ ...env, SUPABASE_SERVICE_ROLE_KEY: "" }, request));
  assert.equal(calls, 1);
  assert.equal((await verifyManagedPreview({ VERCEL_ENV: "production" }, request)).phase, "outside-ws022-preview");
});

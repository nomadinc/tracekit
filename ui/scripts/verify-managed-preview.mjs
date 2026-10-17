import { EXPECTED, checkIdentity } from "./ws022-preview-preflight.mjs";

/** @param {Record<string, string | undefined>} env */
export async function verifyManagedPreview(env = process.env, request = fetch) {
  // Existing builds in other workstreams and Production keep their own workflow.
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== EXPECTED.branch)
    return { ok: true, phase: "outside-ws022-preview" };
  if (!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA || "")
    || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL || ""))
    throw new Error("runtime_binding_mismatch");
  return checkIdentity(env, request, { sha: env.VERCEL_GIT_COMMIT_SHA, host: env.VERCEL_URL });
}

if (process.argv[1]?.endsWith("/verify-managed-preview.mjs")) {
  try { console.log(JSON.stringify(await verifyManagedPreview())); }
  catch { console.error(JSON.stringify({ ok: false, code: "managed_preview_preflight_failed" })); process.exitCode = 1; }
}

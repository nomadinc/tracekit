const stagingURL = "https://joahiwgidfbzwzyslrbq.supabase.co";
export async function verifyWS021Staging(env = process.env, request = fetch) {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "ws021/invitation-onboarding-recovery" || env.NEXT_PUBLIC_SUPABASE_URL !== stagingURL) return;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("WS021 staging database credential is missing.");
  const headers = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  let response;
  try { response = await request(`${stagingURL}/rest/v1/tracekit_roles?select=id&limit=1`, { headers, signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("WS021 staging database credential check could not reach staging."); }
  if (!response.ok) throw new Error(`WS021 staging database credential check failed (HTTP ${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("WS021 staging database credential cannot read the server-only role catalog.");
  console.log("ws021_staging_database_credential_check=passed");
}

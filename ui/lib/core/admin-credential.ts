export function traceKitCoreAdminSecret(env:NodeJS.ProcessEnv=process.env){
  const useStaging=String(env.TRACEKIT_USE_STAGING_CORE_CREDENTIAL||"").trim()==="enabled";
  if(useStaging){
    const staging=String(env.TK_SECRET_KEY_STAGING||"").trim();
    if(!staging)throw new Error("tracekit_staging_core_credential_unavailable");
    return staging;
  }
  return String(env.TK_SECRET_KEY||env.TRACEKIT_TK_SECRET||"").trim();
}

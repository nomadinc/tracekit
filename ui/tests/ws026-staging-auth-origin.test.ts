import assert from "node:assert/strict";
import test from "node:test";
import { stagingAuthOriginDecision as decide, WS026_AUTH_ORIGIN as origin } from "../lib/identity/staging-auth-origin";
const env = {NODE_ENV:"production",TRACEKIT_STAGING_AUTH_ORIGIN:origin,VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"workstream/ws-026-product-recovery",WORKOS_CLIENT_ID:"client_01KZ1RW7ZH5X45Y1A8M3YAYDP5",NEXT_PUBLIC_SUPABASE_URL:"https://joahiwgidfbzwzyslrbq.supabase.co",WORKOS_REDIRECT_URI:`${origin}/auth/callback`,NEXT_PUBLIC_WORKOS_REDIRECT_URI:`${origin}/auth/callback`} as NodeJS.ProcessEnv;
test("approved stable origin continues sign-in and callback without moving code/state",()=>{for(const path of ["/auth/sign-in","/auth/callback?code=fixture&state=fixture","/"])assert.deepEqual(decide(origin+path,env),{kind:"continue"});});
test("immutable preview entry moves to stable host before authorization without query forwarding",()=>assert.deepEqual(decide("https://tracekit-staging-ed3vnaz8m-tracekit.vercel.app/auth/sign-in?returnTo=https://evil.invalid&state=fixture",env),{kind:"redirect",url:origin+"/auth/sign-in"}));
test("off-origin callback fails closed and never forwards OAuth parameters",()=>assert.deepEqual(decide("https://other.invalid/auth/callback?code=fixture&state=fixture",env),{kind:"reject-callback"}));
test("production target, client, deployment and cookie-domain mismatches stop before AuthKit",()=>{for(const change of [{NEXT_PUBLIC_SUPABASE_URL:"https://uoeosoiegatlqtzemsfv.supabase.co"},{WORKOS_CLIENT_ID:"production-client"},{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"other"},{WORKOS_COOKIE_DOMAIN:".vercel.app"},{WORKOS_REDIRECT_URI:"https://app.trace-kit.io/auth/callback"},{NEXT_PUBLIC_WORKOS_REDIRECT_URI:"https://other.invalid/auth/callback"},{TRACEKIT_STAGING_AUTH_ORIGIN:"https://evil.invalid"}])assert.deepEqual(decide(origin,{...env,...change}),{kind:"unavailable"});});
test("unconfigured branches retain existing behavior",()=>assert.deepEqual(decide("https://app.trace-kit.io/",{NODE_ENV:"production"}),{kind:"continue"}));

test("double slash paths cannot change the approved redirect host",()=>{const result=decide("https://other.invalid//evil.invalid/path?code=fixture",env);assert.equal(result.kind,"redirect");if(result.kind==="redirect"){assert.equal(new URL(result.url).origin,origin);assert.equal(new URL(result.url).search,"");}});

test("committed staging URLs are exact literal HTTPS origins",()=>{
  assert.equal(origin,"https://staging.trace-kit.io");
  assert.equal(new URL(origin).origin,origin);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,"https://joahiwgidfbzwzyslrbq.supabase.co");
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL!).origin,env.NEXT_PUBLIC_SUPABASE_URL);
});
test("Markdown-formatted staging configuration fails closed",()=>{
  for(const field of ["TRACEKIT_STAGING_AUTH_ORIGIN","NEXT_PUBLIC_SUPABASE_URL","WORKOS_REDIRECT_URI","NEXT_PUBLIC_WORKOS_REDIRECT_URI"]){
    const value=env[field];
    assert.deepEqual(decide(origin,{...env,[field]:`[${value}](${value})`}),{kind:"unavailable"});
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { verifyWS021Staging } from "../scripts/ws021-staging-check.mjs";
test("staging build checks private database access without exposing credential failures", async () => {
 const env = {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"ws021/invitation-onboarding-recovery",NEXT_PUBLIC_SUPABASE_URL:"https://joahiwgidfbzwzyslrbq.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-private-credential"};
 let calls=0;
 await verifyWS021Staging(env,async(url,options)=>{calls++;assert.equal(options.headers.Authorization,"Bearer test-private-credential");assert.equal(new URL(url).hostname,"joahiwgidfbzwzyslrbq.supabase.co");return Response.json([{id:"role"}]);});
 await assert.rejects(verifyWS021Staging(env,async()=>new Response("private error body",{status:401})),error=>!error.message.includes("private") && /HTTP 401/.test(error.message));
 await assert.rejects(verifyWS021Staging(env,async()=>Response.json([])),/server-only/);
 await assert.rejects(verifyWS021Staging(env,async()=>{throw Error("private error body");}),error=>!error.message.includes("private") && /could not reach/.test(error.message));
 await verifyWS021Staging({...env,VERCEL_ENV:"production"},async()=>{throw Error("must not probe production");});
 assert.equal(calls,1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CommasProviderRequestError, fetchProviderPage } from "../lib/commerce/commas-continuous-worker";

const response=(status:number)=>new Response(status===200?"{}":"",{status,headers:{"x-ratelimit-limit":"10000","x-ratelimit-remaining":"9998"}});
const run=async(statuses:Array<number|Error>)=>{let calls=0;const request=async()=>{const value=statuses[calls++]!;if(value instanceof Error)throw value;return response(value)};try{await fetchProviderPage("secret",1,100,"correlation",3,{request:request as typeof fetch,wait:async()=>{}});return{calls,error:null}}catch(error){return{calls,error:error as CommasProviderRequestError}}};

test("provider authentication and authorization fail permanently after one accounted request",async()=>{
  for(const [status,code] of [[401,"provider_authentication_failed"],[403,"provider_authorization_failed"]] as const){const result=await run([status]);assert.equal(result.calls,1);assert.equal(result.error?.attempts,1);assert.equal(result.error?.errorCode,code);assert.equal(result.error?.retryable,false)}
});

test("rate limit, 5xx, timeout, and network exhaustion retain every provider attempt",async()=>{
  for(const [values,code] of [[[429,429,429],"provider_rate_limited"],[[503,503,503],"provider_http_5xx"],[[new Error("timeout"),new Error("timeout"),new Error("timeout")],"provider_timeout"],[[new Error("network"),new Error("network"),new Error("network")],"provider_network_failure"]] as const){const result=await run([...values]);assert.equal(result.calls,3);assert.equal(result.error?.attempts,3);assert.equal(result.error?.errorCode,code);assert.equal(result.error?.retryable,true)}
});

test("transient provider recovery returns the total request count",async()=>{let calls=0;const result=await fetchProviderPage("secret",1,100,"correlation",3,{request:(async()=>response(++calls<3?503:200)) as typeof fetch,wait:async()=>{}});assert.equal(calls,3);assert.equal(result.attempts,3)});

test("worker failure terminalization persists partial progress without advancing success intelligence",()=>{
  const source=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8");
  const failure=source.slice(source.lastIndexOf("} catch(error) {"));
  for(const contract of ["provider_request_count:Math.max(providerRequests,progress.providerRequests+failedAttempts)","failure_stage:failureStage","automatic_recovery:\"next_scheduled_cycle\"","p_transition:\"failed\"","p_error_code:failureCode"])assert.match(failure,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.doesNotMatch(failure,/last_successful_at|last_stability_boundary|provider_total_observed|latest_provider_transaction_at/);
});

test("expired lease recovery is advisory locked, fail closed, and service-role only",()=>{
  const sql=readFileSync(new URL("../../supabase/migrations/20260829064137_commerce_failure_visibility_and_expired_lease_recovery.sql",import.meta.url),"utf8");
  for(const contract of ["pg_advisory_xact_lock","status='running'","lease_expires_at<p_now","status='failed'","stopping_reason='lease_expired'","lease_owner=null","lease_expires_at=null","service_role"])assert.match(sql,new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
});

test("a rejected heartbeat stops before another provider page",()=>{const source=readFileSync(new URL("../lib/commerce/commas-continuous-worker.ts",import.meta.url),"utf8"),loop=source.slice(source.indexOf("while(queueIndex"),source.indexOf("} catch(error) {",source.indexOf("while(queueIndex")));assert.match(loop,/failureStage="lease_heartbeat"/);assert.match(loop,/if\(\(heartbeat as unknown\[\]\)\[0\]!==true\)throw new Error\("lease_lost"\)/);assert.ok(loop.lastIndexOf("heartbeat")>loop.lastIndexOf("fetchProviderPage"))});

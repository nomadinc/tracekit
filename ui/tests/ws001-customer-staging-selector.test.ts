import assert from "node:assert/strict";
import test from "node:test";
import { ProductionCustomerRepository } from "../lib/customers/production-repository";
const names=["TRACEKIT_USE_STAGING_CORE_CREDENTIAL","TK_SECRET_KEY_STAGING","TK_SECRET_KEY","TRACEKIT_TK_SECRET","TRACEKIT_API_BASE_URL"];
const scope:any={authenticated:true,organizationId:"org_fixture",workspaceId:"untrusted_workspace",session:{}};
async function probe(env:Record<string,string>, run:(calls:any[])=>Promise<void>){
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]])); const original=globalThis.fetch;const calls:any[]=[];
 try{for(const k of names)delete process.env[k];Object.assign(process.env,env,{TRACEKIT_API_BASE_URL:"https://core.fixture.invalid"});globalThis.fetch=async(input,init)=>{calls.push({url:String(input),init});return new Response('{"customers":[]}',{status:200});};await run(calls);}finally{globalThis.fetch=original;for(const k of names){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
const repo=new ProductionCustomerRepository();
test("staging selects only staging credential and preserves scoped GET",async()=>probe({TRACEKIT_USE_STAGING_CORE_CREDENTIAL:"enabled",TK_SECRET_KEY_STAGING:"synthetic-stage",TK_SECRET_KEY:"synthetic-production"},async calls=>{await repo.listCustomers(scope);assert.equal(calls.length,1);assert.equal(calls[0].init.headers["x-tk-secret"],"synthetic-stage");assert.equal(calls[0].init.method,"GET");assert.equal(calls[0].init.cache,"no-store");assert.equal(new URL(calls[0].url).searchParams.get("workspace_id"),"org_fixture");}));
for(const invalid of [undefined,""," ","stage\n"," stage","sta\tge","stage\u0001","stage\u007f"]){test(`invalid staging ${JSON.stringify(invalid)} denies without fallback`,async()=>probe({TRACEKIT_USE_STAGING_CORE_CREDENTIAL:"enabled",TK_SECRET_KEY:"synthetic-production",TRACEKIT_TK_SECRET:"synthetic-fallback",...(invalid===undefined?{}:{TK_SECRET_KEY_STAGING:invalid})},async calls=>{await assert.rejects(repo.listCustomers(scope),/^Error: tracekit_staging_core_credential_unavailable$/);assert.equal(calls.length,0);}));}
for(const key of ["TK_SECRET_KEY","TRACEKIT_TK_SECRET"]){test(`production preserves ${key}`,async()=>probe({[key]:"synthetic-production",TK_SECRET_KEY_STAGING:"synthetic-stage"},async calls=>{await repo.listCustomers(scope);assert.equal(calls[0].init.headers["x-tk-secret"],"synthetic-production");}));}
test("missing organization denies before network",async()=>probe({TK_SECRET_KEY:"synthetic-production"},async calls=>{await assert.rejects(repo.listCustomers({...scope,organizationId:null}),/customer_repository_scope_unavailable/);assert.equal(calls.length,0);}));

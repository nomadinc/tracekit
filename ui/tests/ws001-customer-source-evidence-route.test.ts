import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";

test("customer evidence audit requires permissions, certified request, and both exact tenant scopes before protected reads",async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/commerce/connections/[connectionId]/customer-source-audit/route.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/application-session|authorization-gateway|server-control-plane|evidence-store|supabase-control-repository|customer-source-evidence-audit/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('application-session')?`export async function resolveApplicationSession(){return fixture.session;}`:a.path.includes('authorization-gateway')?`export function requirePermission(s,p){if(!fixture.permissions.includes(p))throw new Error('denied');}`:a.path.includes('server-control-plane')?`export function createCommerceControlPlane(){return {async getConnection(s,id){return id===fixture.ef.id?fixture.ef:fixture.commas;},async listProviderAccounts(){return fixture.accounts;}};}`:a.path.includes('evidence-store')?`export class MemoryCommerceEvidenceStore{}`:a.path.includes('supabase-control')?`export async function commercePersistenceRequest(path,init){if(init)throw new Error('unexpected mutation');fixture.database.push(path);return path.startsWith('commerce_sync_runs')?fixture.runs:[{id:fixture.commas.id}];}`:`export class CustomerSourceAuditError extends Error{};export async function auditCustomerSourceEvidence(scope){fixture.audit=scope;return {readOnly:true,writes:0,contactValuesIncluded:false};}`}));
 }}]});
 const org='c98d44be-5f7f-41a2-a9d3-ae67a811a872',conn='3532796e-8091-4f54-bf18-4ccd96ccea07',run='c4ab5bbd-2455-4bbd-adc0-f39b08427e21',commas='8030cf89-88f3-433f-99ec-c2083c4e5698';
 for(const failure of ['none','permission','ef_tenant','uncertified','commas_tenant','account_tenant','cross_origin']){
  const fixture:any={session:{kind:'authenticated',session:{activeOrganization:{id:org}}},permissions:failure==='permission'?['connectors.manage','imports.manage']:['connectors.manage','imports.manage','customers.view'],ef:{id:conn,organizationId:failure==='ef_tenant'?'other':org,provider:'everflow'},commas:{id:commas,organizationId:failure==='commas_tenant'?'other':org,provider:'commas'},accounts:[{id:'account',organizationId:failure==='account_tenant'?'other':org,connectionId:commas,status:'active',provisional:true}],runs:[{metadata:{source_coverage_certification:{state:failure==='uncertified'?'unverified':'certified'}}}],database:[]};
  const module={exports:{} as any};runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),fixture,Response,URL,Date});
  const response=await module.exports.POST(new Request(`https://tracekit.invalid/api/commerce/connections/${conn}/customer-source-audit`,{method:'POST',headers:failure==='cross_origin'?{origin:'https://other.invalid','sec-fetch-site':'cross-site'}:{'content-type':'application/json'},body:JSON.stringify({runId:run,organizationId:'forged'})}),{params:Promise.resolve({connectionId:conn})});
  if(failure!=='none'){assert.notEqual(response.status,200);assert.equal(fixture.audit,undefined);continue;}
  assert.equal(response.status,200);assert.equal(fixture.audit.organizationId,org);assert.equal(fixture.audit.connectionId,commas);assert.equal(fixture.audit.externalMerchantIdentityVerified,false);assert.equal((await response.json()).writes,0);assert.equal(fixture.database.every((path:string)=>path.includes(`organization_id=eq.${org}`)),true);
 }
});

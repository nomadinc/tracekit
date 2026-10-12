import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";
import {gunzipSync} from "node:zlib";

test("inventory download requires both operator permissions, exact tenant/account/run scope and performs only provider/database reads",async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/commerce/connections/[connectionId]/historical-source-inventory/route.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/application-session|authorization-gateway|server-control-plane|evidence-store|supabase-control-repository|everflow-client|everflow-source-inventory/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('application-session')?`export async function resolveApplicationSession(){return fixture.session;}`:a.path.includes('authorization-gateway')?`export function requirePermission(s,p){if(!fixture.permissions.includes(p))throw new Error('denied');}`:a.path.includes('server-control-plane')?`export function createCommerceControlPlane(){return {async getConnection(){return fixture.connection;},async listProviderAccounts(){return fixture.accounts;},async resolveCredentialForExecution(){fixture.credentials++;return 'synthetic';}};}`:a.path.includes('evidence-store')?`export class MemoryCommerceEvidenceStore{}`:a.path.includes('supabase-control')?`export async function commercePersistenceRequest(path,init){fixture.database.push({path,init});return fixture.runs;}`:a.path.includes('everflow-client')?`export class EverflowHealthError extends Error{};export async function getEverflowNetworkIdentity(p){fixture.network=p;}`:`export class EverflowInventoryError extends Error{};export async function captureEverflowSourceInventory(p){fixture.capture=p;return {readOnly:true,sourceTotal:1,rows:[['id','hash','rawhash']]};}`}));
 }}]});
 const org='c98d44be-5f7f-41a2-a9d3-ae67a811a872',conn='3532796e-8091-4f54-bf18-4ccd96ccea07',run='c4ab5bbd-2455-4bbd-adc0-f39b08427e21';
 for(const failure of ['none','permission','tenant','account','run','cross_origin']){
  const fixture:any={session:{kind:'authenticated',session:{activeOrganization:{id:org},correlationId:'correlation'}},permissions:failure==='permission'?['connectors.manage']:['connectors.manage','imports.manage'],connection:{organizationId:failure==='tenant'?'other':org,provider:'everflow',status:'connected',capabilities:{everflowNetwork:{timezoneId:80,currencyId:'USD',networkId:'3453'}}},accounts:[{id:'account',organizationId:org,connectionId:failure==='account'?'other':conn,status:'active',provisional:false,externalId:'3453'}],runs:failure==='run'?[]:[{id:run,metadata:{from:'2026-10-01 00:00:00',to:'2026-10-11 23:59:59'}}],database:[],credentials:0};
  const module={exports:{} as any};runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),fixture,Response,URL,Buffer,Uint8Array,Date});
  const request=new Request(`https://tracekit.invalid/api/commerce/connections/${conn}/historical-source-inventory?runId=${run}`,{headers:failure==='cross_origin'?{origin:'https://other.invalid','sec-fetch-site':'cross-site'}:{}});
  const response=await module.exports.GET(request,{params:Promise.resolve({connectionId:conn})});
  if(failure!=='none'){assert.notEqual(response.status,200);assert.equal(fixture.credentials,0);assert.equal(fixture.capture,undefined);continue;}
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-disposition'),/json.gz/);
  const body=JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());assert.equal(body.importId,run);assert.equal(body.organizationId,org);assert.equal(body.readOnly,true);assert.equal(body.apiKey,undefined);
  assert.equal(fixture.database.every((r:any)=>r.init===undefined),true);assert.match(fixture.database[0].path,new RegExp(`organization_id=eq.${org}`));assert.match(fixture.database[0].path,new RegExp(`connection_id=eq.${conn}`));assert.match(fixture.database[0].path,/provider_account_id=eq.account/);
  assert.equal(fixture.network.networkId,'3453');assert.equal(fixture.capture.from,'2026-10-01 00:00:00');assert.equal(fixture.capture.to,'2026-10-11 23:59:59');
 }
});

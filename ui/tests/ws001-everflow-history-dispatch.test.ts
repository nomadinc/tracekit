import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
test('history passes resume every page, retain failed pages and create scoped durable fingerprints',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../lib/integrations/everflow-scheduled-worker.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/supabase-control-repository|credential-crypto|everflow-conversions$|^server-only$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path.includes('supabase-control')?`
 export class CommercePersistenceError extends Error{}
 export async function commercePersistenceRequest(path,init){
 if(init?.method==='PATCH'){fixture.patches.push(JSON.parse(init.body));return [];}
 if(path.startsWith('commerce_sync_runs?')){fixture.query=path;return [fixture.run];}
 if(path.startsWith('commerce_provider_credentials'))return [{secret_iv:'',secret_ciphertext:''}];
 if(path.startsWith('commerce_provider_connections'))return [{account_id:'account',capabilities:{everflowNetwork:{timezoneId:80,currencyId:'USD'}}}];return [];}
 export class SupabaseCommerceControlRepository{async claimSyncRun(input){fixture.claim=input;return fixture.run;}async beginCheckpoint(input){fixture.checkpoints.push(input);return {id:'cp-'+input.page};}async updateCheckpoint(id,org,conn,patch){fixture.completed.push({id,org,conn,patch});}async heartbeatSyncRun(){}}
 `:a.path.includes('credential-crypto')?`export function decodeCommerceCredentialKey(){};export async function decryptCommerceCredential(){return 'synthetic';}`:`
 export async function listEverflowConversionsPage(input){fixture.pages.push(input.page);if(fixture.failPage===input.page)throw new Error('provider timeout');return {totalCount:10000,pageSize:200,conversions:Array.from({length:200},(_,i)=>({sourceIdentity:input.page+':'+i,payloadHash:'hash'}))};}
 export async function persistEverflowConversions(input){fixture.persisted.push(input);return input.conversions.length;}
 `}));}}]});
 for(const failPage of [null,3,-1]){
 const fixture:any={run:{id:'existing',organization_id:'org',connection_id:'conn',provider_account_id:'provider',status:'queued',metadata:{from:'2026-10-01 00:00:00',to:'2026-10-11 23:59:59'}},patches:[],checkpoints:[],completed:[],pages:[],persisted:[],failPage};
 if(failPage===-1)fixture.run.metadata={...fixture.run.metadata,next_page:42,records_seen:7600};
 const module={exports:{} as any};runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),process:{env:{COMMERCE_CREDENTIALS_KEY_ID:'synthetic'}},fixture,Buffer,Uint8Array,Date,setTimeout,clearTimeout,AbortController,fetch});
 const result=await module.exports.runQueuedHistoricalImport({deadlineAtMs:Date.now()+60000,nowMs:()=>Date.now()});
 assert.match(fixture.query,/order=heartbeat_at.asc.nullsfirst,created_at.asc/);assert.equal(fixture.claim.runId,'existing');assert.equal(fixture.claim.organizationId,'org');
 if(failPage===-1){assert.equal(result.status,'failed');assert.match(result.error,/page coverage is inconsistent/);assert.equal(fixture.pages.length,0);continue;}
 const count=failPage?2:10;assert.equal(fixture.persisted.length,count);assert.equal(fixture.completed.length,count);assert.equal(result.nextPage,count+1);assert.equal(fixture.patches.at(-1).metadata.next_page,count+1);assert.equal(fixture.patches.at(-1).pages_completed,count);
 assert.equal(fixture.completed.every((c:any)=>c.org==='org'&&c.conn==='conn'&&/^[0-9a-f]{64}$/.test(c.patch.pageFingerprint)),true);assert.deepEqual(Array.from(fixture.pages),Array.from({length:count+(failPage?1:0)},(_,i)=>i+1));
 }
});

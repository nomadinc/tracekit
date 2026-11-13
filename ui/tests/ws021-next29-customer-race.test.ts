import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import ts from 'typescript';
for(const scenario of ['fresh','race23505','other-error','ambiguous','foreign-winner','inactive-person'])test(`actual runtime customer ${scenario}`,async()=>{
 const scope={organizationId:randomUUID(),connectionId:randomUUID(),providerAccountId:randomUUID(),accountId:randomUUID()};
 const winner=randomUUID(), customer='customer-103104';let captured:any,identity:any=null,person:any=null;const calls:any[]=[];
 class CommercePersistenceError extends Error{databaseCode:string;constructor(code:string){super('synthetic');this.databaseCode=code;}}
 const request=async(path:string,init:any={})=>{const method=init.method||'GET';calls.push({path,method});const table=path.split('?')[0];
  if(table==='person_source_identities'&&method==='GET'){
   if(!identity)return [];
   return scenario==='ambiguous'?[identity,identity]:[identity];
  }
  if(table==='people'&&method==='POST'){person=JSON.parse(init.body);return [person];}
  if(table==='person_source_identities'&&method==='POST'){
   if(scenario==='other-error')throw new CommercePersistenceError('23503');
   identity={...JSON.parse(init.body),person_id:scenario==='fresh'?person.id:winner};
   if(scenario==='foreign-winner')identity.organization_id=randomUUID();
   if(scenario==='race23505'||scenario==='foreign-winner'||scenario==='inactive-person')throw new CommercePersistenceError('23505');
   return [identity];
  }
  if(table==='people'&&method==='GET')return [{id:identity.person_id,organization_id:scope.organizationId,workspace_id:scope.organizationId,status:scenario==='inactive-person'?'inactive':'active'}];
  throw Error(`Unexpected ${method} ${table}`);
 };
 const code=ts.transpileModule(readFileSync(new URL('../lib/commerce/next29-runtime-persistence.ts',import.meta.url),'utf8')+'\nexport const factory=createNext29RuntimePersistence;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:any={};new Function('require','exports',code)((name:string)=>{
  if(name==='node:crypto')return {randomUUID,createHash};
  if(name==='./supabase-control-repository')return {commercePersistenceRequest:request,CommercePersistenceError};
  if(name.endsWith('/repository.ts'))return {createNext29HistoricalPersistence:(client:any)=>{captured=client;return client;}};
  if(name.endsWith('/subscription-repository.ts'))return {createNext29SubscriptionPersistence:()=>({})};
  if(name.endsWith('/dispute-repository.ts'))return {createNext29DisputePersistence:()=>({})};return {};
 },exports);exports.factory({...scope,environment:'production',client:{}});
 const run=()=>captured.upsertCustomerIdentity({...scope,evidenceId:randomUUID(),expansion:{customer:{providerCustomerId:customer,displayName:null,email:null,phone:null}}});
 if(['fresh','race23505'].includes(scenario))await run();else await assert.rejects(run);
 assert.equal(calls.filter(c=>c.path==='person_source_identities'&&c.method==='POST').length,1);
 assert.ok(calls.every(c=>c.method!=='DELETE'));
 for(const c of calls.filter(c=>c.path.startsWith('person_source_identities?')))for(const key of ['organizationId','connectionId','providerAccountId'])assert.ok(c.path.includes(scope[key as keyof typeof scope]));
});

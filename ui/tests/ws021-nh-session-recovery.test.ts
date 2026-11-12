import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { hasPermission } from '../lib/identity/authorization';
import { ACTIVE_ORGANIZATION_COOKIE, sealActiveOrganization } from '../lib/identity/active-organization-cookie';
import { ACTIVE_BUSINESS_CONTEXT_COOKIE, sealActiveBusinessContext } from '../lib/identity/active-business-context-cookie';
import { requireResourceScope } from '../lib/identity/authorization-gateway';

// Existing-identity, multi-organization fixture; no provider or database calls.
const user = {id:'existing-user',primaryEmail:'existing@example.test',displayName:'Existing customer',status:'active'};
const nh='nh-organization', stem='existing-authorized-organization';
const member=(org:string)=>({id:`membership-${org}`,userId:user.id,organizationId:org,accountId:null,role:'client-read-only',status:'active',effectiveFrom:'2026-01-01T00:00:00Z',effectiveUntil:null});
const org=(id:string)=>({id,name:id,owningAccountId:`account-${id}`,status:'active'});
const originalEnv={WORKOS_CLIENT_ID:process.env.WORKOS_CLIENT_ID,WORKOS_API_KEY:process.env.WORKOS_API_KEY,WORKOS_COOKIE_PASSWORD:process.env.WORKOS_COOKIE_PASSWORD};
test.before(()=>{process.env.WORKOS_CLIENT_ID='fixture-client';process.env.WORKOS_API_KEY='fixture-not-a-key';process.env.WORKOS_COOKIE_PASSWORD='fixture-only-cookie-signing-password-long-enough';});
test.after(()=>{for(const[k,v]of Object.entries(originalEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;});
function fixture(){
  const jar=new Map<string,{value:string}>();
  const state={memberships:[member(stem),member(nh)],revoked:false,contextRevoked:false,auth:true,synchronizations:0,audits:[] as any[],cookieWrites:0};
  const cookies={has:(n:string)=>jar.has(n),get:(n:string)=>jar.get(n),set:(n:string,v:string)=>{state.cookieWrites++;jar.set(n,{value:v});},delete:(n:string)=>{state.cookieWrites++;jar.delete(n);}};
  class Repository {
    async synchronizeUser(identity:any){assert.equal(identity.id,'existing-workos-subject');state.synchronizations++;return user;}
    async membershipsForUser(id:string){assert.equal(id,user.id);return state.memberships.map(m=>({...m,status:state.revoked&&m.organizationId===nh?'revoked':m.status}));}
    async organizationsForMembership(m:any){return [org(m.organizationId)];}
    async permissionOverrides(id:string){return id===`membership-${nh}`?['financials.view','orders.view_financials'].map(capability=>({capability,effect:'deny'})):[];}
    async accountById(id:string){return{id,name:id,accountType:'client',status:'active'};}
    async businessContexts(_id:string,organizationId:string){return state.contextRevoked&&organizationId===nh?[]:[{id:`context-${organizationId}`,organizationId,name:organizationId,status:'active'}];}
    async recordAuditEvent(e:any){state.audits.push(e);}
    async isEmptyInstallation(){return false;}
  }
  const base=new URL('../lib/identity/application-session.ts',import.meta.url);
  const require=createRequire(base);
  const mod:any={exports:{}};
  const compiled=ts.transpileModule(readFileSync(base,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',compiled)((name:string)=>{
    if(name==='@workos-inc/authkit-nextjs')return {withAuth:async()=>({user:state.auth?{id:'existing-workos-subject',email:user.primaryEmail,emailVerified:true}:null})};
    if(name==='next/headers')return {cookies:async()=>cookies,headers:async()=>new Headers()};
    if(name==='./supabase-identity-repository')return {SupabaseIdentityTenancyRepository:Repository};
    return require(name);
  },mod,mod.exports);
  const select=(organizationId:string)=>jar.set(ACTIVE_ORGANIZATION_COOKIE,{value:sealActiveOrganization({userId:user.id,organizationId,expiresAt:Date.now()+60000})});
  return {state,jar,cookies,select,resolve:mod.exports.resolveApplicationSession as ()=>Promise<any>,Repository};
}
test('NH existing membership resolves with both financial denials in server AND client shell',async()=>{
  const f=fixture();f.select(nh);const r=await f.resolve();assert.equal(r.kind,'authenticated');
  assert.equal(r.session.membership.id,`membership-${nh}`);assert.equal(r.session.activeBusinessContextId,`context-${nh}`);
  for(const p of ['orders.view','customers.view','offers.view']){assert.ok(r.session.effectivePermissions.includes(p));assert.equal(hasPermission(r.legacySession.identity,p as any),true);}
  for(const p of ['financials.view','orders.view_financials','organizations.manage','users.invite','admin.impersonate']){assert.equal(r.session.effectivePermissions.includes(p),false);assert.equal(hasPermission(r.legacySession.identity,p as any),false);}
  assert.equal(f.state.synchronizations,1);assert.equal(f.state.cookieWrites,0);assert.equal(f.state.memberships.length,2);
});
test('signed organization selection persists on refresh, uses NH override not Stem permissions',async()=>{
  const f=fixture();assert.equal((await f.resolve()).session.activeOrganization.id,stem);f.select(nh);
  for(let i=0;i<2;i++){const r=await f.resolve();assert.equal(r.session.activeOrganization.id,nh);assert.equal(hasPermission(r.legacySession.identity,'financials.view'),false);}
  f.select(stem);const r=await f.resolve();assert.equal(r.session.activeOrganization.id,stem);assert.equal(hasPermission(r.legacySession.identity,'financials.view'),true);
});
test('unassigned organization cookie cannot authorize foreign resources',async()=>{
  const f=fixture();f.select('foreign-unassigned');const r=await f.resolve();assert.notEqual(r.session.activeOrganization.id,'foreign-unassigned');
  assert.throws(()=>requireResourceScope(r.session,'foreign-unassigned','orders.view'),/unavailable/);
});
test('stale foreign Business Context and revoked context do not survive NH resolution',async()=>{
  const f=fixture();f.select(nh);
  f.jar.set(ACTIVE_BUSINESS_CONTEXT_COOKIE,{value:sealActiveBusinessContext({userId:user.id,organizationId:stem,businessContextId:`context-${stem}`,expiresAt:Date.now()+60000})});
  assert.equal((await f.resolve()).session.activeBusinessContextId,`context-${nh}`);
  f.state.contextRevoked=true;assert.equal((await f.resolve()).session.activeBusinessContextId,null);
});
test('NH membership revocation removes NH selection on next resolution; existing Stem remains',async()=>{
  const f=fixture();f.select(nh);f.state.revoked=true;const r=await f.resolve();assert.equal(r.session.activeOrganization.id,stem);assert.equal(r.session.availableOrganizations.some((x:any)=>x.id===nh),false);
});
test('no WorkOS session is unauthenticated and never synchronizes or creates identity',async()=>{
  const f=fixture();f.state.auth=false;assert.equal((await f.resolve()).kind,'unauthenticated');assert.equal(f.state.synchronizations,0);assert.equal(f.state.audits.length,0);
});

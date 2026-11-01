import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportingClient,ReportingDenied,PROJECT} from './client.ts';
const kp=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const publicJwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
const b64=(x:Uint8Array)=>Buffer.from(x).toString('base64url');
const config={origin:`https://${PROJECT}.supabase.co`,publishableKey:'sb_publishable_SYNTHETIC',issuer:'synthetic',publicJwk};
const manifest={customer:{relation:'reporting_customer',columns:['organization_id','workspace_id','id'],financial:false,permission:'customers.view',organizationColumn:'organization_id',workspaceColumn:'workspace_id'},profit:{relation:'reporting_profit',columns:['organization_id','workspace_id','revenue'],financial:true,permission:'financials.view',organizationColumn:'organization_id',workspaceColumn:'workspace_id'}};
async function fixture(change:any={}){
 let now=100,requests:any[]=[];let membership:any={active:true,subject:'user1',organization:'org1',workspace:'workspace1',version:'v1',permissions:['customers.view','financials.view','orders.view_financials']};
 const claims={iss:'synthetic',aud:'authenticated',purpose:'tracekit-staging-reporting',sub:'user1',organization_id:'org1',workspace_id:'workspace1',membership_version:'v1',role:'tk_stg_financial_reader',permissions:['customers.view','financials.view','orders.view_financials'],iat:90,exp:130,...change};
 const raw=b64(new TextEncoder().encode(JSON.stringify({alg:'EdDSA',typ:'JWT'})))+'.'+b64(new TextEncoder().encode(JSON.stringify(claims)));
 const token=raw+'.'+b64(new Uint8Array(await crypto.subtle.sign('Ed25519',kp.privateKey,new TextEncoder().encode(raw))));
 let rows:any=[{organization_id:'org1',workspace_id:'workspace1',id:'customer1',revenue:0,secret:'SENSITIVE'}];
 const client=createReportingClient(config,manifest,{now:()=>now,currentMembership:async()=>membership,fetch:async(u:any,o:any)=>{requests.push({u:String(u),o});return Response.json(rows);}});
 return {client,token,requests,setNow:(x:number)=>{now=x},setMembership:(x:any)=>{membership={...membership,...x}},setRows:(x:any)=>{rows=x}};
}
const scope={organization:'org1',workspace:'workspace1'};
test('authorized explicit projection, GET only, strips unselected fields',async()=>{const f=await fixture();assert.deepEqual(await f.client.read(f.token,'customer',scope),[{organization_id:'org1',workspace_id:'workspace1',id:'customer1'}]);assert.equal(f.requests[0].o.method,'GET');assert.match(f.requests[0].u,/select=organization_id%2Cworkspace_id%2Cid/);assert.equal(f.requests[0].o.redirect,'error');});
for(const key of ['organization','workspace'])test('foreign '+key+' denies before transport',async()=>{const f=await fixture();await assert.rejects(f.client.read(f.token,'customer',{...scope,[key]:'foreign'}),ReportingDenied);assert.equal(f.requests.length,0)});
test('financial positive preserves genuine zero',async()=>{const f=await fixture();assert.equal((await f.client.read(f.token,'profit',scope))[0].revenue,0)});
test('reader cannot request financial projection',async()=>{const f=await fixture({role:'tk_stg_reporting_reader'});await assert.rejects(f.client.read(f.token,'profit',scope));assert.equal(f.requests.length,0)});
test('both financial permissions required',async()=>{const f=await fixture({permissions:['financials.view']});await assert.rejects(f.client.read(f.token,'profit',scope));assert.equal(f.requests.length,0)});
test('expired token',async()=>{const f=await fixture();f.setNow(130);await assert.rejects(f.client.read(f.token,'customer',scope));assert.equal(f.requests.length,0)});
test('revoked membership',async()=>{const f=await fixture();f.setMembership({active:false});await assert.rejects(f.client.read(f.token,'customer',scope));assert.equal(f.requests.length,0)});
test('stale membership version',async()=>{const f=await fixture();f.setMembership({version:'v2'});await assert.rejects(f.client.read(f.token,'customer',scope));assert.equal(f.requests.length,0)});
for(const op of ['delete','rpc/admin','toString','__proto__'])test('closed operation denies '+op,async()=>{const f=await fixture();await assert.rejects(f.client.read(f.token,op,scope));assert.equal(f.requests.length,0)});
test('foreign returned row denied',async()=>{const f=await fixture();f.setRows([{organization_id:'foreign',workspace_id:'workspace1'}]);await assert.rejects(f.client.read(f.token,'customer',scope))});
test('unavailable amount remains null',async()=>{const f=await fixture();f.setRows([{organization_id:'org1',workspace_id:'workspace1',revenue:null}]);assert.equal((await f.client.read(f.token,'profit',scope))[0].revenue,null)});
test('invalid signature denies',async()=>{const f=await fixture();await assert.rejects(f.client.read(f.token.slice(0,-3)+'ABC','customer',scope));assert.equal(f.requests.length,0)});
test('no service credential fallback',()=>{assert.throws(()=>createReportingClient({...config,publishableKey:''},manifest,{} as any));assert.throws(()=>createReportingClient({...config,publishableKey:'sb_secret_SYNTHETIC'},manifest,{} as any));assert.throws(()=>createReportingClient({...config,origin:'https://production.supabase.co'},manifest,{} as any))});
test('unknown manifest denies all reads',async()=>{const f=await fixture();const c=createReportingClient(config,{}, {now:()=>100,currentMembership:async()=>{throw Error('must not call')},fetch:async()=>{throw Error('must not call')}});await assert.rejects(c.read(f.token,'customer',scope))});
test('membership revoked after response blocks transmission',async()=>{
 const f=await fixture({permissions:['customers.view'],role:'tk_stg_reporting_reader'});let calls=0;
 const c=createReportingClient(config,manifest,{now:()=>100,currentMembership:async()=>({active:++calls===1,subject:'user1',organization:'org1',workspace:'workspace1',version:'v1',permissions:['customers.view']}),fetch:async()=>Response.json([{organization_id:'org1',workspace_id:'workspace1',id:'c'}])});
 await assert.rejects(c.read(f.token,'customer',scope));assert.equal(calls,2);
});
test('issuer, audience and privileged-role substitutions deny',async()=>{
 for(const change of [{iss:'foreign'},{aud:'foreign'},{role:'service_role'},{role:'postgres'}]){const f=await fixture(change);await assert.rejects(f.client.read(f.token,'customer',scope));assert.equal(f.requests.length,0)}
});
test('missing membership evidence denies',async()=>{const f=await fixture();f.setMembership({active:false});await assert.rejects(f.client.read(f.token,'customer',scope))});

test('financial permission loss without version bump still denies stale token',async()=>{const f=await fixture();f.setMembership({permissions:['customers.view']});await assert.rejects(f.client.read(f.token,'customer',scope));assert.equal(f.requests.length,0)});

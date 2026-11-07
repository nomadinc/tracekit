import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import {EventEmitter} from 'node:events';
import {listCommasWebhookSubscriptions,verifiedCommasUrl,isPublicCommasAddress,resolveCommasApiKey,TARGET_URL} from '../scripts/inspect-commas-webhooks';
import {sanitizeWebhookUrl,summarizeWebhookSubscription,exactTargetMatch} from '../lib/commerce/commas-webhook-inspector';
import {inspectCommasTestDeliveryReadiness,resolveApprovedCommasTestDeliveryTarget} from '../lib/mcp/m14-commas-target-resolver';
import type {TraceKitSessionContext} from '../lib/identity/persistent-types';
const secret='fixture-credential-never-real';
test('URL userinfo, query and fragments are redacted without manufacturing target identity',()=>{
 const raw=TARGET_URL.replace('https://','https://user:password@')+'#private';
 const summary=summarizeWebhookSubscription({id:42,webhook_url:raw,event_types:['dispute.created']});
 assert.equal(summary.webhookUrl,TARGET_URL);assert.equal(exactTargetMatch([summary],TARGET_URL),false);
 assert.doesNotMatch(sanitizeWebhookUrl('https://user:password@example.com/?access_token=value#fragment'),/user|password|value|fragment|access_token/);
 assert.equal(sanitizeWebhookUrl('file:///etc/passwd'),'[invalid-url]');
});
test('only verified origin is accepted',()=>{
 const old=process.env.COMMAS_BASE_URL;
 try{for(const url of ['http://www.fanbasis.com','https://localhost','https://www.fanbasis.com:444','https://user:pass@www.fanbasis.com','https://www.fanbasis.com.evil.example','https://www.fanbasis.com/private','https://www.fanbasis.com/?secret=1']){process.env.COMMAS_BASE_URL=url;assert.throws(verifiedCommasUrl,/not approved/);}process.env.COMMAS_BASE_URL='https://www.fanbasis.com';assert.equal(verifiedCommasUrl().pathname,'/public-api/webhook-subscriptions');}
 finally{if(old===undefined)delete process.env.COMMAS_BASE_URL;else process.env.COMMAS_BASE_URL=old;}
});
test('private and reserved IP destinations fail closed',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.0.1','192.0.2.1','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','2001:100::1','2002::1'])assert.equal(isPublicCommasAddress(ip),false,ip);
 assert.equal(isPublicCommasAddress('93.184.216.34'),true);assert.equal(isPublicCommasAddress('2606:4700::1111'),true);
});
test('native transport pins DNS and bounds redirects, failures, bytes and time',async t=>{
 t.mock.method(dns,'lookup',async()=>[{address:'93.184.216.34',family:4}]);
 let status=200,body=JSON.stringify({data:[{id:'subscription-42',webhook_url:TARGET_URL,event_types:['dispute.created'],status:secret,unused:secret}]}),calls=0,stall=false;
 t.mock.method(https,'request',(options:Record<string,unknown>,callback:(r:unknown)=>void)=>{
 calls++;assert.equal(options.hostname,'93.184.216.34');assert.equal(options.servername,'www.fanbasis.com');assert.equal(options.method,'GET');assert.equal(options.agent,false);
 const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void};req.destroy=()=>{};
 req.end=()=>queueMicrotask(()=>{if(stall)return;const res=new EventEmitter() as EventEmitter&{statusCode:number;destroy:()=>void};res.statusCode=status;res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(body));res.emit('end');});return req;
 });
 const subscriptions=await listCommasWebhookSubscriptions(secret);assert.equal(subscriptions[0].id,'subscription-42');assert.doesNotMatch(JSON.stringify(subscriptions),new RegExp(secret));assert.equal(calls,1);
 status=302;await assert.rejects(listCommasWebhookSubscriptions(secret),/redirects are prohibited/);assert.equal(calls,2);
 status=500;body=secret;await assert.rejects(listCommasWebhookSubscriptions(secret),e=>e instanceof Error&&e.message==='Commas webhook subscription read failed (500).');
 status=200;body='x'.repeat(262145);await assert.rejects(listCommasWebhookSubscriptions(secret),/size limit/);
 body=secret;await assert.rejects(listCommasWebhookSubscriptions(secret),/response was invalid/);
 t.mock.method(dns,'lookup',async()=>[{address:'127.0.0.1',family:4}]);const before=calls;await assert.rejects(listCommasWebhookSubscriptions(secret),/prohibited destination/);assert.equal(calls,before);
 t.mock.method(dns,'lookup',async()=>[{address:'93.184.216.34',family:4}]);stall=true;
 t.mock.timers.enable({apis:['setTimeout']});const pending=listCommasWebhookSubscriptions(secret);t.mock.timers.tick(8000);await assert.rejects(pending,/timed out/);
});
test('session and tenant denial precede persistence and global resolver is CLI-only',async t=>{
 let reads=0;t.mock.method(globalThis,'fetch',async()=>{reads++;throw new Error('Unexpected persistence access');});
 for(const session of [{user:null},{user:{status:'active'},activeOrganization:{id:'other'},membership:{status:'active',organizationId:'other',role:'customer-read-only'},effectivePermissions:['customers.view'],availableOrganizations:[{id:'other'}]},{user:{status:'active'},activeOrganization:{id:'other'},membership:{status:'active',organizationId:'tenant-a'},effectivePermissions:['actions.execute'],availableOrganizations:[{id:'other'}]}]){
 await assert.rejects(inspectCommasTestDeliveryReadiness(session as unknown as TraceKitSessionContext));
 await assert.rejects(resolveApprovedCommasTestDeliveryTarget(session as unknown as TraceKitSessionContext));}
 assert.equal(reads,0);await assert.rejects(resolveCommasApiKey(),/CLI-only/);assert.equal(reads,0);
});
test('authorized scoped readiness decrypts fixture only and performs GET without a mutation',async t=>{
 const {encryptCommerceCredential}=await import('../lib/commerce/credential-crypto');
 const key=new Uint8Array(32).fill(7),envelope=await encryptCommerceCredential(secret,key,'local-fixture');
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://persistence.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-only',COMMERCE_CREDENTIALS_KEY_ID:'local-fixture',COMMERCE_CREDENTIALS_ENCRYPTION_VERSION:'1',COMMERCE_CREDENTIALS_ENC_KEY:Buffer.from(key).toString('base64')};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 let reads=0;
 t.mock.method(globalThis,'fetch',async(url:unknown)=>{const text=String(url);assert.match(text,/organization_id=eq.tenant-a/);reads++;return new Response(JSON.stringify(text.includes('commerce_provider_connections?')?[{id:'connection-a',organization_id:'tenant-a'}]:[{encryption_key_id:'local-fixture',encryption_version:1,secret_iv:Buffer.from(envelope.iv).toString('hex'),secret_ciphertext:Buffer.from(envelope.ciphertext).toString('hex')}]));});
 t.mock.method(dns,'lookup',async()=>[{address:'93.184.216.34',family:4}]);
 t.mock.method(https,'request',(options:Record<string,unknown>,callback:(r:unknown)=>void)=>{assert.equal(options.method,'GET');const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void};req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter() as EventEmitter&{statusCode:number;destroy:()=>void};res.statusCode=200;res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify({data:[{id:42,webhook_url:TARGET_URL,event_types:['dispute.created']}]})));res.emit('end');});return req;});
 const session={user:{status:'active'},activeOrganization:{id:'tenant-a',name:'Fixture'},membership:{status:'active',organizationId:'tenant-a'},effectivePermissions:['actions.execute'],availableOrganizations:[{id:'tenant-a'}]} as unknown as TraceKitSessionContext;
 const report=await inspectCommasTestDeliveryReadiness(session);assert.equal(report.ready,true);assert.equal(report.providerRequestMethod,'GET');assert.equal(report.providerCredentialRequired,true);assert.equal(reads,2);assert.doesNotMatch(JSON.stringify(report),new RegExp(secret));
 const target=await resolveApprovedCommasTestDeliveryTarget(session);assert.equal(target.plan.subscriptionId,'42');assert.equal(reads,4);
});

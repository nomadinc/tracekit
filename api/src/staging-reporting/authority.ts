import {readAuthoritySession} from './session.ts';
import {createReportingClient,ReportingDenied,PROJECT,type Claims} from './client.ts';
type Member={subject:string;application_user_id:string;organization_id:string;workspace_id:string;version:string;permissions:string[];active:boolean;valid_until:string};
export type AuthorityEnv={REPORTING_PUBLIC_JWK:string;REPORTING_PRIVATE_JWK:string;REPORTING_ISSUER:string;REPORTING_PUBLISHABLE_KEY:string;MEMBERSHIP_READER_TOKEN:string;WORKOS_REPORTING_JWKS:string;WORKOS_REPORTING_ISSUER:string;WORKOS_CLIENT_ID:string};
const origin=`https://${PROJECT}.supabase.co`;
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function workos(token:string,e:AuthorityEnv,now:number){
 const p=token.split('.');if(p.length!==3||token.length>16000)throw new ReportingDenied();const h=JSON.parse(new TextDecoder().decode(decode(p[0]))),c=JSON.parse(new TextDecoder().decode(decode(p[1])));
 if(!['RS256','ES256'].includes(h.alg)||!h.kid||h.jku||h.jwk)throw new ReportingDenied();
 const keys=JSON.parse(e.WORKOS_REPORTING_JWKS).keys.filter((k:any)=>k.kid===h.kid&&(!k.alg||k.alg===h.alg)&&!k.d);if(keys.length!==1)throw new ReportingDenied();
 const algorithm=h.alg==='RS256'?{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}:{name:'ECDSA',namedCurve:'P-256'};
 const key=await crypto.subtle.importKey('jwk',keys[0],algorithm,false,['verify']);
 const verify=h.alg==='RS256'?{name:'RSASSA-PKCS1-v1_5'}:{name:'ECDSA',hash:'SHA-256'};
 if(!await crypto.subtle.verify(verify,key,decode(p[2]),new TextEncoder().encode(p[0]+'.'+p[1]))||c.iss!==e.WORKOS_REPORTING_ISSUER||!(c.aud===e.WORKOS_CLIENT_ID||Array.isArray(c.aud)&&c.aud.includes(e.WORKOS_CLIENT_ID))||typeof c.sub!=='string'||!Number.isSafeInteger(c.exp)||c.exp<=now||(c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf>now))||(c.iat!==undefined&&(!Number.isSafeInteger(c.iat)||c.iat>now)))throw new ReportingDenied();return c;
}
export function createAuthority(e:AuthorityEnv,transport:typeof fetch=fetch,now=()=>Math.floor(Date.now()/1000)){
 async function lookup(subject:string,organization:string,workspace:string,application=false):Promise<Member>{
  if(![subject,organization,workspace].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x)))throw new ReportingDenied();
  if(!e.MEMBERSHIP_READER_TOKEN||!e.REPORTING_PUBLISHABLE_KEY.startsWith('sb_publishable_')||organization!==workspace)throw new ReportingDenied(503);
  const payload=JSON.parse(new TextDecoder().decode(decode(e.MEMBERSHIP_READER_TOKEN.split('.')[1]||'')));if(payload.role!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
  const u=new URL(origin+'/rest/v1/current_memberships');u.searchParams.set('select','subject,application_user_id,organization_id,workspace_id,version,permissions,active,valid_until');for(const [k,v]of Object.entries({[application?'application_user_id':'subject']:subject,organization_id:organization,workspace_id:workspace}))u.searchParams.set(k,'eq.'+v);u.searchParams.set('limit','2');
  const r=await transport(u,{method:'GET',redirect:'error',cache:'no-store',headers:{apikey:e.REPORTING_PUBLISHABLE_KEY,authorization:`Bearer ${e.MEMBERSHIP_READER_TOKEN}`,'accept-profile':'staging_reporting_private'}});if(!r.ok||r.headers.get('x-tracekit-db-login')!=='authenticator'||r.headers.get('x-tracekit-db-session-authorization')!=='authenticator'||r.headers.get('x-tracekit-db-role')!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
  const rows=await r.json() as Member[];if(!Array.isArray(rows)||rows.length!==1)throw new ReportingDenied();const m=rows[0];
  if(m[application?'application_user_id':'subject']!==subject||!m.application_user_id||m.organization_id!==organization||m.workspace_id!==workspace||!m.active||(!Number.isFinite(Date.parse(m.valid_until))||Date.parse(m.valid_until)<=now()*1000)||!Array.isArray(m.permissions)||!m.version)throw new ReportingDenied();return m;
 }
 const verifier=createReportingClient({origin,publishableKey:e.REPORTING_PUBLISHABLE_KEY,issuer:e.REPORTING_ISSUER,publicJwk:JSON.parse(e.REPORTING_PUBLIC_JWK)},{},{fetch:transport,now,currentMembership:async()=>{throw new ReportingDenied()}});
 return {async fetch(request:Request){
  const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
  try{
   const requestUrl=new URL(request.url),path=requestUrl.pathname;
   if(path==='/v1/session'){if(request.method!=='GET'||requestUrl.search)throw new ReportingDenied();const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw new ReportingDenied();const identity=await workos(auth.slice(7),e,now());return reply(200,await readAuthoritySession(e,identity.sub,identity.exp,transport,now));}
   if(request.method==='GET'&&path==='/.well-known/jwks.json'){const key=JSON.parse(e.REPORTING_PUBLIC_JWK);if(key.d||key.kty!=='OKP'||key.crv!=='Ed25519')throw new ReportingDenied(503);return reply(200,{keys:[key]});}if(request.method!=='POST'||!['/issue','/current-membership'].includes(path))throw new ReportingDenied();
   const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw new ReportingDenied();const token=auth.slice(7),body=await request.json() as any;
   if(path==='/issue'){
    const identity=await workos(token,e,now());if(Object.keys(body).sort().join(',')!=='organization,workspace')throw new ReportingDenied();
    const m=await lookup(identity.sub,body.organization,body.workspace),iat=now(),exp=Math.min(iat+45,identity.exp,Math.floor(Date.parse(m.valid_until)/1000));if(exp<=iat)throw new ReportingDenied();
    const role=['financials.view','orders.view_financials'].every(p=>m.permissions.includes(p))?'tk_stg_financial_reader':'tk_stg_reporting_reader';
    const claims:Claims={iss:e.REPORTING_ISSUER,aud:'authenticated',purpose:'tracekit-staging-reporting',sub:m.application_user_id,organization_id:m.organization_id,workspace_id:m.workspace_id,membership_version:m.version,permissions:m.permissions.filter(p=>['customers.view','orders.view','financials.view','orders.view_financials','customers.view_sensitive_data'].includes(p)),role,iat,exp};
    const h=b64(new TextEncoder().encode(JSON.stringify({alg:'EdDSA',typ:'JWT',...(JSON.parse(e.REPORTING_PUBLIC_JWK).kid?{kid:JSON.parse(e.REPORTING_PUBLIC_JWK).kid}:{})}))),p=b64(new TextEncoder().encode(JSON.stringify(claims)));const key=await crypto.subtle.importKey('jwk',JSON.parse(e.REPORTING_PRIVATE_JWK),{name:'Ed25519'},false,['sign']);
    const signed=h+'.'+p+'.'+b64(new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(h+'.'+p))));await verifier.authenticate(signed);return reply(200,{token:signed,expires:exp,subject:m.application_user_id});
   }
   const c=await verifier.authenticate(token),m=await lookup(c.sub,c.organization_id,c.workspace_id,true);if(body.subject!==c.sub||body.organization!==c.organization_id||body.workspace!==c.workspace_id||body.version!==c.membership_version||m.version!==c.membership_version)throw new ReportingDenied();
   return reply(200,{active:true,subject:m.application_user_id,organization:m.organization_id,workspace:m.workspace_id,version:m.version,permissions:m.permissions});
  }catch(err){return reply(err instanceof ReportingDenied?err.status:503,{error:'reporting_unavailable'});}
 }};
}

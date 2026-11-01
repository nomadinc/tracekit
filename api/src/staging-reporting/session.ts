import {projectReadOnlySession} from '../../../ui/lib/identity/staging-read-only-session.ts';
import {ReportingDenied,PROJECT} from './client.ts';
const fields='subject,application_user_id,organization_id,workspace_id,version,permissions,active,valid_until,session_context';
const readPermissions=['organizations.view','offers.view','customers.view','customers.view_sensitive_data','orders.view','orders.view_financials','financials.view'];
export const SESSION_CLIENT='client_01KZ1RW7ZH5X45Y1A8M3YAYDP5';
export type SessionRegistryEnv={REPORTING_ISSUER:string;REPORTING_PUBLISHABLE_KEY:string;MEMBERSHIP_READER_TOKEN:string;WORKOS_CLIENT_ID:string};
const obj=(x:any)=>!!x&&typeof x==='object'&&!Array.isArray(x);
const identity=(x:any)=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
// Uses the exact WS-021 projection/validation implementation, never a parallel session model.
export async function readAuthoritySession(e:SessionRegistryEnv,subject:string,workosExpiry:number,transport:typeof fetch,now:()=>number){
 if(e.WORKOS_CLIENT_ID!==SESSION_CLIENT||e.REPORTING_ISSUER!=='https://staging.trace-kit.io/reporting-authority'||!e.REPORTING_PUBLISHABLE_KEY?.startsWith('sb_publishable_')||!e.MEMBERSHIP_READER_TOKEN)throw new ReportingDenied(503);
 if(!identity(subject))throw new ReportingDenied();
 let reader:any;try{reader=JSON.parse(BufferlessDecode(e.MEMBERSHIP_READER_TOKEN.split('.')[1]||''));}catch{throw new ReportingDenied(503)}
 if(reader.role!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
 const url=new URL(`https://${PROJECT}.supabase.co/rest/v1/current_memberships`);url.searchParams.set('select',fields);url.searchParams.set('subject','eq.'+subject);url.searchParams.set('active','eq.true');url.searchParams.set('limit','2');
 const response=await transport(url,{method:'GET',cache:'no-store',redirect:'error',headers:{apikey:e.REPORTING_PUBLISHABLE_KEY,authorization:`Bearer ${e.MEMBERSHIP_READER_TOKEN}`,'accept-profile':'staging_reporting_private',accept:'application/json'}});
 if(!response.ok||response.headers.get('x-tracekit-db-login')!=='authenticator'||response.headers.get('x-tracekit-db-session-authorization')!=='authenticator'||response.headers.get('x-tracekit-db-role')!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
 const rows=await response.json();if(!Array.isArray(rows)||rows.length!==1)throw new ReportingDenied();const m=rows[0],context=m.session_context;
 if(!obj(m)||m.subject!==subject||!identity(m.application_user_id)||!identity(m.organization_id)||m.workspace_id!==m.organization_id||!identity(m.version)||m.active!==true||typeof m.valid_until!=='string'||!Number.isFinite(Date.parse(m.valid_until))||!Array.isArray(m.permissions)||m.permissions.some((p:any)=>typeof p!=='string')||new Set(m.permissions).size!==m.permissions.length)throw new ReportingDenied();
 if(!obj(context)||context.subject!==subject||context.membershipVersion!==m.version||context.workspaceId!==m.workspace_id||!obj(context.user)||context.user.id!==m.application_user_id||context.user.emailVerified!==true||!obj(context.organization)||context.organization.id!==m.organization_id||context.organization.status!=='active')throw new ReportingDenied();
 const permissions=m.permissions.filter((p:string)=>readPermissions.includes(p));
 if(!Array.isArray(context.permissions)||new Set(context.permissions).size!==context.permissions.length||[...context.permissions].sort().join('\0')!==[...permissions].sort().join('\0'))throw new ReportingDenied();
 const issuedAt=now()*1000,expiresAt=Math.min(issuedAt+45000,workosExpiry*1000,Date.parse(m.valid_until),context.membership?.effectiveUntil===null?Infinity:Date.parse(context.membership?.effectiveUntil));
 if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(expiresAt)||expiresAt<=issuedAt)throw new ReportingDenied();
 const candidate={version:1,subject,membershipVersion:m.version,workspaceId:m.workspace_id,issuedAt,expiresAt,user:context.user,account:context.account,organization:context.organization,membership:context.membership,permissions,businessContexts:context.businessContexts,activeBusinessContextId:context.activeBusinessContextId};
 let s;try{s=projectReadOnlySession(candidate,subject,now()*1000);}catch{throw new ReportingDenied()}
 // No raw registry JSON, secret, arbitrary permission or internal context survives.
 const result={version:1,subject,membershipVersion:m.version,issuedAt,expiresAt,workspaceId:m.workspace_id,user:{id:s.user.id,workosUserId:subject,primaryEmail:s.user.primaryEmail,displayName:s.user.displayName,status:s.user.status},account:s.activeAccount,organization:s.activeOrganization,membership:s.membership,permissions:s.effectivePermissions,businessContexts:s.accessibleBusinessContexts,activeBusinessContextId:s.activeBusinessContextId};
 // Live check after transport and projection: no stale issuance after an expiry wait.
 try{projectReadOnlySession(result,subject,now()*1000);}catch{throw new ReportingDenied()}
 return result;
}
function BufferlessDecode(s:string){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));}

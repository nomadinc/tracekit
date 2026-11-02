import {ReportingDenied,PROJECT} from './client.ts';
import {createPageSessionReader,resolvePageSession,type Registry} from './page-session.ts';
import {completeRead,singleComplete,readProof} from './completeness.ts';
import {AUTHORIZATION_CONTRACT} from '../../../ui/lib/identity/authorization-completeness.ts';
export const SESSION_CLIENT='client_01KZ1RW7ZH5X45Y1A8M3YAYDP5';
export type SessionRegistryEnv={REPORTING_ISSUER:string;REPORTING_PUBLISHABLE_KEY:string;MEMBERSHIP_READER_TOKEN:string;WORKOS_CLIENT_ID:string;SESSION_READER_TOKEN?:string;REPORTING_AUTHORIZATION_SNAPSHOT_CONTRACT?:string};
export async function readAuthoritySession(e:SessionRegistryEnv,subject:string,workosExpiry:number,transport:typeof fetch,now:()=>number,organization:string|null=null){
 if(e.REPORTING_AUTHORIZATION_SNAPSHOT_CONTRACT!==AUTHORIZATION_CONTRACT||e.WORKOS_CLIENT_ID!==SESSION_CLIENT||e.REPORTING_ISSUER!=='https://staging.trace-kit.io/reporting-authority'||!e.REPORTING_PUBLISHABLE_KEY?.startsWith('sb_publishable_')||!e.MEMBERSHIP_READER_TOKEN)throw new ReportingDenied(503);
 const registry=async(s:string,o:string,w:string)=>{
  let payload;try{payload=JSON.parse(atob(e.MEMBERSHIP_READER_TOKEN.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new ReportingDenied(503)}
  if(payload.role!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
  const url=new URL(`https://${PROJECT}.supabase.co/rest/v1/current_memberships`);
  url.searchParams.set('select','subject,application_user_id,organization_id,workspace_id,version,permissions,active,valid_until');
  for(const [key,value]of Object.entries({subject:s,organization_id:o,workspace_id:w}))url.searchParams.set(key,'eq.'+value);
  url.searchParams.set('limit','2');url.searchParams.set('order','subject.asc,organization_id.asc,workspace_id.asc');
  const response=await transport(url,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),headers:{apikey:e.REPORTING_PUBLISHABLE_KEY,authorization:`Bearer ${e.MEMBERSHIP_READER_TOKEN}`,'accept-profile':'staging_reporting_private',prefer:'count=exact'}});
  if(response.headers.get('x-tracekit-db-login')!=='authenticator'||response.headers.get('x-tracekit-db-session-authorization')!=='authenticator'||response.headers.get('x-tracekit-db-role')!=='tk_stg_membership_verifier')throw new ReportingDenied(503);
  if(response.status!==200)throw new ReportingDenied(503);
  const rows=await completeRead(response,'current_memberships','tk_stg_membership_verifier',1);
  const row=singleComplete(rows,'current_memberships'),proof=readProof(row,'current_memberships');
  return {...row,authorizationRead:{source:'current_memberships',total:proof.total,returned:proof.rowCount}} as Registry;
 };
 return resolvePageSession(subject,organization,workosExpiry,createPageSessionReader(e,transport,now),registry,now);
}

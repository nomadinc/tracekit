import { createReportingClient, ReportingDenied, type Claims } from './client.ts';
import { OPERATIONS,REPORTING_MANIFEST } from './manifest.ts';
import {compute,type Operation} from './computed.ts';
import {financial} from './repository.ts';
import {projectReportingRead} from './projection.ts';
type Env={REPORTING_SUPABASE_URL:string;REPORTING_PUBLISHABLE_KEY:string;REPORTING_ISSUER:string;REPORTING_PUBLIC_JWK:string;REPORTING_AUTHORITY?:{fetch:typeof fetch}};
export default {async fetch(request:Request,env:Env):Promise<Response> {
 const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 if(request.method!=='GET')return reply(405,{error:'reporting_unavailable'});
 try{
  const url=new URL(request.url),m=/^\/reporting\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
  if(!m||!Object.hasOwn(OPERATIONS,m[1])||url.searchParams.getAll('organization').length!==1||url.searchParams.getAll('workspace').length!==1)throw new ReportingDenied();
  const allowed=new Set(['organization','workspace','connector_id','platform','event_source','include_executive_performance','includeExecutivePerformance','person_id','journey_id','order_id','offset','limit','search','cursor','from','to','journey_status','has_purchase','has_attribution','has_commission','identity_status','source','source_platform','affiliate_id','offer_id','currency']);
  for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)throw new ReportingDenied();
  const h=request.headers.get('authorization');if(!h?.startsWith('Bearer ')||!env.REPORTING_AUTHORITY)throw new ReportingDenied();
  const client=createReportingClient({origin:env.REPORTING_SUPABASE_URL,publishableKey:env.REPORTING_PUBLISHABLE_KEY,issuer:env.REPORTING_ISSUER,publicJwk:JSON.parse(env.REPORTING_PUBLIC_JWK)},REPORTING_MANIFEST,{fetch,now:()=>Math.floor(Date.now()/1000),currentMembership:async(token:string,c:Readonly<Claims>)=>{
   const r=await env.REPORTING_AUTHORITY!.fetch(new Request('https://reporting-authority.internal/current-membership',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({subject:c.sub,organization:c.organization_id,workspace:c.workspace_id,version:c.membership_version})}));
   if(!r.ok)throw new ReportingDenied();return r.json();
  }});
  const token=h.slice(7),operation=m[1] as Operation,permissions=OPERATIONS[operation],c=await client.authorize(token,{organization:url.searchParams.get('organization')!,workspace:url.searchParams.get('workspace')!},permissions);
  if(url.searchParams.has('has_commission')&&!financial(c))throw new ReportingDenied();if(url.searchParams.has('has_purchase')&&!c.permissions.includes('orders.view'))throw new ReportingDenied();
  const revalidate=()=>client.revalidate(token,c,permissions);
  const result=await compute(operation,url,c,token,env.REPORTING_PUBLISHABLE_KEY,revalidate);
  await revalidate();return reply(200,projectReportingRead(result,{effectivePermissions:c.permissions}));
 }catch(e){return reply(e instanceof ReportingDenied?e.status:(e as any)?.status===404?404:503,{error:(e as any)?.publicCode||'reporting_unavailable'});}
}};

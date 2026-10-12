import {resolveApplicationSession} from "@/lib/identity/application-session";
import {requirePermission} from "@/lib/identity/authorization-gateway";
import {createCommerceControlPlane} from "@/lib/commerce/server-control-plane";
import {MemoryCommerceEvidenceStore} from "@/lib/commerce/evidence-store";
import {commercePersistenceRequest} from "@/lib/commerce/supabase-control-repository";
import {auditCustomerSourceEvidence,CustomerSourceAuditError} from "@/lib/commerce/customer-source-evidence-audit";
export const maxDuration=300;
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const unavailable=()=>Response.json({ok:false,code:"resource_unavailable"},{status:404,headers});
export async function POST(request:Request,context:{params:Promise<{connectionId:string}>}){
 try{
  const url=new URL(request.url),site=request.headers.get("sec-fetch-site"),origin=request.headers.get("origin");if((site&&site!=="same-origin"&&site!=="none")||(origin&&origin!==url.origin))return unavailable();
  const resolution=await resolveApplicationSession();if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return unavailable();
  requirePermission(resolution.session,"connectors.manage");requirePermission(resolution.session,"imports.manage");requirePermission(resolution.session,"customers.view");
  const text=await request.text();if(text.length>512)return unavailable();const body=JSON.parse(text) as {runId?:unknown};const runId=String(body.runId||""),{connectionId}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(runId)||!/^[0-9a-f-]{36}$/i.test(connectionId))return unavailable();
  const organizationId=resolution.session.activeOrganization.id,plane=createCommerceControlPlane({evidenceStore:new MemoryCommerceEvidenceStore()});
  const connection=await plane.getConnection(resolution.session,connectionId);if(connection.organizationId!==organizationId||connection.provider!=="everflow")return unavailable();
  const runs=await commercePersistenceRequest(`commerce_sync_runs?id=eq.${runId}&organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&sync_type=eq.everflow_conversions_historical&select=metadata&limit=1`);
  if(runs.length!==1||(runs[0].metadata as any)?.source_coverage_certification?.state!=="certified")return unavailable();
  const connections=await commercePersistenceRequest(`commerce_provider_connections?organization_id=eq.${organizationId}&provider=eq.commas&status=eq.connected&select=id&limit=2`);if(connections.length!==1)return unavailable();
  const commasId=String(connections[0].id);const commas=await plane.getConnection(resolution.session,commasId);if(commas.organizationId!==organizationId||commas.provider!=="commas")return unavailable();
  const accounts=(await plane.listProviderAccounts(resolution.session,commasId)).filter(account=>account.status==="active");if(accounts.length!==1||accounts[0].organizationId!==organizationId||accounts[0].connectionId!==commasId)return unavailable();
  const result=await auditCustomerSourceEvidence({organizationId,connectionId:commasId,providerAccountId:accounts[0].id,externalMerchantIdentityVerified:!accounts[0].provisional});
  return Response.json({ok:true,...result},{headers});
 }catch(error){return Response.json({ok:false,code:error instanceof CustomerSourceAuditError?error.code:"customer_source_audit_unavailable"},{status:409,headers});}
}

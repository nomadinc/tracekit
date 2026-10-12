import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { MemoryCommerceEvidenceStore } from "@/lib/commerce/evidence-store";
import { commercePersistenceRequest, CommercePersistenceError } from "@/lib/commerce/supabase-control-repository";
import { getEverflowNetworkIdentity, EverflowHealthError } from "@/lib/integrations/everflow-client";
import { EverflowInventoryError } from "@/lib/integrations/everflow-source-inventory";
import { certifyEverflowCoverage } from "@/lib/integrations/everflow-coverage-certificate";

export const maxDuration=300;
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const unavailable=()=>Response.json({ok:false,code:"resource_unavailable"},{status:404,headers});

export async function POST(request:Request,context:{params:Promise<{connectionId:string}>}) {
  try {
    const url=new URL(request.url),site=request.headers.get("sec-fetch-site"),origin=request.headers.get("origin");
    if((site&&site!=="same-origin"&&site!=="none")||(origin&&origin!==url.origin))return unavailable();
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return unavailable();
    requirePermission(resolution.session,"connectors.manage");requirePermission(resolution.session,"imports.manage");
    const text=await request.text();if(text.length>512)return unavailable();
    const body=JSON.parse(text) as {runId?:unknown};
    const runId=String(body.runId||"");const {connectionId}=await context.params;
    if(!/^[0-9a-f-]{36}$/i.test(runId)||!/^[0-9a-f-]{36}$/i.test(connectionId))return unavailable();
    const organizationId=resolution.session.activeOrganization.id;
    const plane=createCommerceControlPlane({evidenceStore:new MemoryCommerceEvidenceStore()});
    const connection=await plane.getConnection(resolution.session,connectionId);
    if(connection.organizationId!==organizationId||connection.provider!=="everflow"||connection.status!=="connected")return unavailable();
    const accounts=(await plane.listProviderAccounts(resolution.session,connectionId)).filter(a=>a.status==="active"&&!a.provisional);
    if(accounts.length!==1)return unavailable();
    const account=accounts[0];if(account.organizationId!==organizationId||account.connectionId!==connectionId)return unavailable();
    const runs=await commercePersistenceRequest(`commerce_sync_runs?id=eq.${runId}&organization_id=eq.${organizationId}&connection_id=eq.${connectionId}&provider_account_id=eq.${account.id}&sync_type=eq.everflow_conversions_historical&select=id,status,metadata,records_seen,records_created,records_failed,pages_completed,lease_owner,lease_expires_at,last_error_code,last_error_summary,started_at,completed_at&limit=1`);
    if(runs.length!==1)return unavailable();
    const network=connection.capabilities?.everflowNetwork as Record<string,unknown>|undefined;
    if(Number(network?.timezoneId)!==80||String(network?.currencyId)!=="USD"||String(network?.networkId)!==account.externalId)return unavailable();
    if((runs[0].metadata as any)?.source_coverage_certification)return Response.json({ok:true,certificate:(runs[0].metadata as any).source_coverage_certification},{headers});
    if(runs[0].status!=="failed"||runs[0].lease_owner)return Response.json({ok:false,code:"everflow_certification_request_not_eligible"},{status:409,headers});
    const apiKey=await plane.resolveCredentialForExecution(resolution.session,connectionId);
    await getEverflowNetworkIdentity({apiKey,networkId:account.externalId,correlationId:resolution.session.correlationId});
    const certificate=await certifyEverflowCoverage({apiKey,networkId:account.externalId,organizationId,connectionId,providerAccountId:account.id,actorUserId:resolution.session.user.id,accountId:connection.accountId,correlationId:resolution.session.correlationId,run:runs[0]});
    return Response.json({ok:true,certificate},{headers});
  } catch(error) {
    if(error instanceof CommercePersistenceError)return Response.json({ok:false,code:"everflow_certification_persistence_failed",databaseCode:error.databaseCode,resource:error.resource},{status:409,headers});
    const code=error instanceof EverflowInventoryError||error instanceof EverflowHealthError?error.code:"everflow_certification_unavailable";
    return Response.json({ok:false,code},{status:409,headers});
  }
}

import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { GovernedActionHistoryRepository } from "@/lib/mcp/governed-action-history-repository";

const unavailable=()=>NextResponse.json({error:"The requested resource is unavailable."},{status:404});
export async function GET(request:Request,context:{params:Promise<{intentId:string}>}){
  try{
    if(new URL(request.url).searchParams.size)return unavailable();
    const resolution=await resolveApplicationSession();
    if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return unavailable();
    requirePermission(resolution.session,"audit_logs.view");
    const{intentId}=await context.params;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId))return unavailable();
    const history=await new GovernedActionHistoryRepository().readForOrganization(resolution.session.activeOrganization.id,intentId);
    return history?NextResponse.json({ok:true,history}):unavailable();
  }catch{return unavailable();}
}

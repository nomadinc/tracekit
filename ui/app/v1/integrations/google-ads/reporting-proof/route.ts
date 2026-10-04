import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runGoogleAdsReportingProof } from "@/lib/integrations/google-ads-reporting-proof";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const resolution=await resolveApplicationSession();
 if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization||!resolution.session.effectivePermissions.includes("connectors.manage"))return NextResponse.json({ok:false,code:"resource_unavailable",message:"The requested resource is unavailable."},{status:404});
 const body=await request.json().catch(()=>null) as {connectionId?:unknown;days?:unknown}|null;
 const connectionId=typeof body?.connectionId==="string"?body.connectionId:"";
 const days=body?.days===30?30:7;
 if(!connectionId)return NextResponse.json({ok:false,code:"connection_required",message:"Google Ads connection is required."},{status:400});
 try{
  const proof=await runGoogleAdsReportingProof({organizationId:resolution.session.activeOrganization.id,connectionId,days});
  return NextResponse.json({ok:true,proof},{headers:{"cache-control":"no-store"}});
 }catch{return NextResponse.json({ok:false,code:"google_ads_reporting_proof_failed",message:"The bounded Google Ads reporting proof could not be completed."},{status:502});}
}

import { NextRequest,NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { ingestGoogleAdsReportingBounded } from "@/lib/integrations/google-ads-reporting-ingestion";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 const resolution=await resolveApplicationSession();
 if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization||!resolution.session.effectivePermissions.includes("connectors.manage"))return NextResponse.json({ok:false,code:"resource_unavailable",message:"The requested resource is unavailable."},{status:404});
 const body=await request.json().catch(()=>null) as {connectionId?:unknown}|null,connectionId=typeof body?.connectionId==="string"?body.connectionId:"";
 if(!connectionId)return NextResponse.json({ok:false,code:"connection_required",message:"Google Ads connection is required."},{status:400});
 try{const result=await ingestGoogleAdsReportingBounded({accountId:resolution.session.activeOrganization.owningAccountId,organizationId:resolution.session.activeOrganization.id,connectionId,days:7});return NextResponse.json({ok:true,result},{headers:{"cache-control":"no-store"}})}
 catch{return NextResponse.json({ok:false,code:"google_ads_bounded_ingestion_failed",message:"The bounded Google Ads reporting ingestion could not be completed."},{status:502})}
}

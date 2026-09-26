import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { buildGoogleAdsManagementState } from "@/lib/integrations/google-ads-management";
import { listGoogleEvidenceHistory } from "@/lib/integrations/google-ads-evidence";
const h=(id:string)=>({"x-tracekit-request-id":id});
function flat(nodes:any[]):any[]{return nodes.flatMap(n=>[n,...flat(n.children||[])]);}
export async function GET(request:Request){const requestId=randomUUID();try{const r=await resolveApplicationSession();if(r.kind!=="authenticated"||!r.session.activeOrganization||!r.session.effectivePermissions.includes("connectors.view"))return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:h(requestId)});
 const u=new URL(request.url),connectionId=u.searchParams.get("connectionId")||"",providerAccountId=u.searchParams.get("providerAccountId")||"",sourceObjectId=u.searchParams.get("sourceObjectId")||"";
 const state=await buildGoogleAdsManagementState({organizationId:r.session.activeOrganization.id});const c=state.connections.find((x:any)=>x.id===connectionId);const a=c?flat(c.accounts).find((x:any)=>x.id===providerAccountId):null;if(!c||!a)return NextResponse.json({ok:false,message:"The requested resource is unavailable.",requestId},{status:404,headers:h(requestId)});
 const items=sourceObjectId?await listGoogleEvidenceHistory({organizationId:r.session.activeOrganization.id,connectionId,providerAccountId,sourceObjectId}):[];
 return NextResponse.json({ok:true,items,requestId},{headers:h(requestId)});
}catch{return NextResponse.json({ok:false,message:"Google Ads evidence is unavailable.",requestId},{status:500,headers:h(requestId)});}}

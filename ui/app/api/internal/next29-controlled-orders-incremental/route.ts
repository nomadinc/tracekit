import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runStoredNext29ControlledIncremental } from "@/lib/commerce/next29-production-certification";
export const runtime="nodejs";
function authorized(request:Request){const e=String(process.env.TRACEKIT_NEXT29_PRODUCTION_CERTIFICATION_TOKEN||"");const s=String(request.headers.get("x-tracekit-certification-token")||"");if(!e||!s)return false;const a=Buffer.from(e),b=Buffer.from(s);return a.length===b.length&&timingSafeEqual(a,b);}
export async function POST(request:Request){const requestId=randomUUID();try{
 if(process.env.VERCEL_ENV!=="production"||String(process.env.TRACEKIT_NEXT29_PRODUCTION_CERTIFICATION_ENV||"").toLowerCase()!=="production") return NextResponse.json({ok:false,code:"unavailable",requestId},{status:404});
 if(!authorized(request)) return NextResponse.json({ok:false,code:"unauthorized",requestId},{status:401});
 const resolution=await resolveApplicationSession(); if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization||!resolution.session.activeAccount)return NextResponse.json({ok:false,code:"resource_unavailable",requestId},{status:404});
 const body=await request.json().catch(()=>null) as {connectionId?:unknown;resource?:unknown}|null; const connectionId=String(body?.connectionId??"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(connectionId))return NextResponse.json({ok:false,code:"invalid_request",requestId},{status:400});
 const resource=String(body?.resource??"").trim(); if(!["orders","subscriptions","disputes"].includes(resource))return NextResponse.json({ok:false,code:"invalid_resource",requestId},{status:400});
 const result=await runStoredNext29ControlledIncremental({session:resolution.session,connectionId,resource:resource as "orders"|"subscriptions"|"disputes"});
 return NextResponse.json({ok:true,requestId,result},{status:200});
}catch(error){const message=(error instanceof Error?error.message:"failed").replace(/Bearer\s+[^\s]+/gi,"Bearer <redacted>").slice(0,300);console.error("next29_controlled_incremental_failed",{requestId,error:message});return NextResponse.json({ok:false,code:"controlled_incremental_failed",message,requestId},{status:409});}}

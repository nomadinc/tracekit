import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { runStoredNext29ProductionCertification } from "@/lib/commerce/next29-production-certification";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = String(process.env.TRACEKIT_NEXT29_PRODUCTION_CERTIFICATION_TOKEN || "");
  const supplied = String(request.headers.get("x-tracekit-certification-token") || "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
function h(requestId:string){return {"x-tracekit-request-id":requestId,"cache-control":"no-store"};}

export async function POST(request: Request) {
  const requestId=randomUUID();
  try {
    if (process.env.VERCEL_ENV !== "production" || String(process.env.TRACEKIT_NEXT29_PRODUCTION_CERTIFICATION_ENV||"").toLowerCase() !== "production") {
      return NextResponse.json({ok:false,code:"unavailable",requestId},{status:404,headers:h(requestId)});
    }
    if (!authorized(request)) return NextResponse.json({ok:false,code:"unauthorized",requestId},{status:401,headers:h(requestId)});
    const resolution=await resolveApplicationSession();
    if (resolution.kind!=="authenticated" || !resolution.session.activeOrganization || !resolution.session.activeAccount) {
      return NextResponse.json({ok:false,code:"resource_unavailable",requestId},{status:404,headers:h(requestId)});
    }
    const body=await request.json().catch(()=>null) as {connectionId?:unknown}|null;
    const connectionId=String(body?.connectionId??"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(connectionId)) return NextResponse.json({ok:false,code:"invalid_request",requestId},{status:400,headers:h(requestId)});
    const report=await runStoredNext29ProductionCertification({session:resolution.session,connectionId});
    return NextResponse.json({ok:true,status:"completed",requestId,certification:report},{status:200,headers:h(requestId)});
  } catch(error) {
    const message=(error instanceof Error?error.message:"29Next Production certification failed.").replace(/Bearer\s+[^\s]+/gi,"Bearer <redacted>").slice(0,300);
    console.error("next29_production_certification_failed",{requestId,error:message});
    return NextResponse.json({ok:false,code:"production_certification_failed",message,requestId},{status:409,headers:h(requestId)});
  }
}

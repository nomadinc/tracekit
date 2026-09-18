import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { createCommerceControlPlane } from "@/lib/commerce/server-control-plane";
import { SupabaseCommerceEvidenceStore } from "@/lib/commerce/supabase-evidence-store";
import { syncEverflowConversions } from "@/lib/integrations/everflow-conversions";

const fail=(status:number,code:string,message:string)=>NextResponse.json({ok:false,code,message},{status});
export async function POST(request:Request,context:{params:Promise<{connectionId:string}>}){
 try{
  const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
  if((origin&&origin!==new URL(request.url).origin)||(site&&site!=="same-origin"))return fail(403,"request_verification_failed","Request verification failed.");
  const resolution=await resolveApplicationSession();
  if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return fail(404,"resource_unavailable","The requested resource is unavailable.");
  requirePermission(resolution.session,"connectors.manage");
  const {connectionId}=await context.params;
  const body=await request.json().catch(()=>null) as {startDate?:string;endDate?:string}|null;
  const start=String(body?.startDate||""),end=String(body?.endDate||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return fail(400,"invalid_date_range","Start and end dates are required.");
  const startMs=Date.parse(start+"T00:00:00Z"),endMs=Date.parse(end+"T00:00:00Z");
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs>endMs)return fail(400,"invalid_date_range","Historical import date range is invalid.");
  if(endMs-startMs>30*86400000)return fail(400,"historical_import_range_too_large","Historical imports are limited to 31 calendar days per run.");
  const plane=createCommerceControlPlane({evidenceStore:new SupabaseCommerceEvidenceStore()});
  const result=await syncEverflowConversions({plane,session:resolution.session,organizationId:resolution.session.activeOrganization.id,connectionId,from:start+" 00:00:00",to:end+" 23:59:59",syncType:"everflow_conversions_historical",providerTimeoutMs:30000});
  return NextResponse.json({ok:true,code:"everflow_historical_import_completed",message:`Imported ${result.persisted} Everflow conversion records from ${start} through ${end}.`,result});
 }catch(error){return fail(500,"everflow_historical_import_failed",error instanceof Error?error.message:"Historical Everflow import failed.");}
}
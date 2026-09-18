import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

const fail=(status:number,code:string,message:string)=>NextResponse.json({ok:false,code,message},{status});
async function scope(connectionId:string,organizationId:string){
 const connections=await commercePersistenceRequest(`commerce_provider_connections?id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.everflow&select=id,account_id&limit=1`) as Record<string,any>[];
 if(!connections[0])return null;
 const accounts=await commercePersistenceRequest(`commerce_provider_accounts?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=id&limit=2`) as Record<string,any>[];
 return accounts.length===1?{accountId:String(connections[0].account_id),providerAccountId:String(accounts[0].id)}:null;
}
export async function GET(_request:Request,context:{params:Promise<{connectionId:string}>}){
 const resolution=await resolveApplicationSession(); if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return fail(404,"resource_unavailable","The requested resource is unavailable.");
 requirePermission(resolution.session,"connectors.manage"); const {connectionId}=await context.params,organizationId=resolution.session.activeOrganization.id;
 const s=await scope(connectionId,organizationId); if(!s)return fail(404,"resource_unavailable","The requested resource is unavailable.");
 const rows=await commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&sync_type=eq.everflow_conversions_historical&select=id,status,created_at,started_at,completed_at,heartbeat_at,lease_expires_at,last_error_code,last_error_summary,records_seen,records_created,records_updated,pages_completed,metadata&order=created_at.desc&limit=1`) as Record<string,any>[];
 return NextResponse.json({ok:true,run:rows[0]||null});
}
export async function POST(request:Request,context:{params:Promise<{connectionId:string}>}){
 try{
  const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site"); if((origin&&origin!==new URL(request.url).origin)||(site&&site!=="same-origin"))return fail(403,"request_verification_failed","Request verification failed.");
  const resolution=await resolveApplicationSession(); if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return fail(404,"resource_unavailable","The requested resource is unavailable."); requirePermission(resolution.session,"connectors.manage");
  const {connectionId}=await context.params,organizationId=resolution.session.activeOrganization.id,body=await request.json().catch(()=>null) as {startDate?:string;endDate?:string}|null,start=String(body?.startDate||""),end=String(body?.endDate||"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return fail(400,"invalid_date_range","Start and end dates are required.");
  const startMs=Date.parse(start+"T00:00:00Z"),endMs=Date.parse(end+"T00:00:00Z"); if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs>endMs)return fail(400,"invalid_date_range","Historical import date range is invalid."); if(endMs-startMs>30*86400000)return fail(400,"historical_import_range_too_large","Historical imports are limited to 31 calendar days per run.");
  const s=await scope(connectionId,organizationId); if(!s)return fail(409,"historical_import_scope_invalid","This Everflow connection must have exactly one active provider account.");
  const existing=await commercePersistenceRequest(`commerce_sync_runs?connection_id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}&sync_type=eq.everflow_conversions_historical&status=in.(queued,running)&select=id,status,lease_expires_at&order=created_at.desc&limit=1`) as Record<string,any>[];
  if(existing[0]&&!(existing[0].status==="running"&&existing[0].lease_expires_at&&Date.parse(existing[0].lease_expires_at)<Date.now()))return NextResponse.json({ok:true,code:"everflow_historical_import_already_active",message:"A historical Everflow import is already queued or running.",runId:existing[0].id},{status:202});
  const id=randomUUID(),now=new Date().toISOString();
  await commercePersistenceRequest("commerce_sync_runs",{method:"POST",body:JSON.stringify({id,organization_id:organizationId,connection_id:connectionId,provider_account_id:s.providerAccountId,sync_type:"everflow_conversions_historical",mode:"shadow",status:"queued",metadata:{historical_import:true,from:start+" 00:00:00",to:end+" 23:59:59",requested_at:now,requested_by_user_id:resolution.session.user.id}})});
  return NextResponse.json({ok:true,code:"everflow_historical_import_queued",message:`Historical Everflow import queued for ${start} through ${end}.`,runId:id},{status:202});
 }catch(error){return fail(500,"everflow_historical_import_queue_failed",error instanceof Error?error.message:"Historical Everflow import could not be queued.");}
}
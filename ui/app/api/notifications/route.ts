import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { OPERATIONAL_ACCESS_POLICY } from "@/lib/identity/operational-tenant-boundary";
import { queryGovernedActionNotifications } from "@/lib/mcp/action-notifications";
import type { TraceKitNotification } from "@/lib/notifications";

const emptyCounts={total:0,unread:0,read:0,resolved:0,dismissed:0,critical:0,warning:0,info:0,healthy:0};
function count(rows:TraceKitNotification[]){return rows.reduce((out,row)=>{out.total++;out[row.status]++;out[row.severity]++;return out;},{...emptyCounts});}

export async function GET(req:Request){
 const incoming=new URL(req.url),requestedLimit=Math.min(100,Math.max(1,Number(incoming.searchParams.get("limit")||25))),requestedCursor=Math.max(0,Number(incoming.searchParams.get("cursor")||0));
 const bounded=new URL(incoming);bounded.searchParams.set("limit","100");bounded.searchParams.set("cursor","0");
 const result=await scopedCoreGet("/v1/notifications",bounded.toString(),OPERATIONAL_ACCESS_POLICY.notificationRead);
 if(result.status!==200)return NextResponse.json(result.body,{status:result.status});
 try{
  const body=result.body as any,workspaceId=String(body.workspace_id||"");if(!workspaceId)throw new Error("notification_scope_unavailable");
  const governed=await queryGovernedActionNotifications(workspaceId,{status:incoming.searchParams.get("status"),severity:incoming.searchParams.get("severity"),search:incoming.searchParams.get("search"),limit:100,cursor:0});
  const category=incoming.searchParams.get("category"),from=incoming.searchParams.get("from"),to=incoming.searchParams.get("to");
  const governedRows=governed.notifications.filter(row=>(!category||category==="all"||category==="platform")&&(!from||row.created_at>=from)&&(!to||row.created_at<=to));
  const combined=[...(Array.isArray(body.notifications)?body.notifications:[]),...governedRows].sort((a:TraceKitNotification,b:TraceKitNotification)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
  const page=combined.slice(requestedCursor,requestedCursor+requestedLimit),counts=count(combined),next=requestedCursor+requestedLimit<combined.length?String(requestedCursor+requestedLimit):null;
  return NextResponse.json({...body,counts,notifications:page,next_cursor:next,has_more:Boolean(next),page:{limit:requestedLimit,cursor:String(requestedCursor)},governed_source:"available"},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,error:"governed_notification_source_unavailable",message:"Governed action notifications are temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});}
}

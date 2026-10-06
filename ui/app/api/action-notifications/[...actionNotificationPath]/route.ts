import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { TENANT_HINT_KEYS } from "@/lib/identity/operational-tenant-boundary";
import { listGovernedActionNotifications, updateGovernedActionNotificationState } from "@/lib/mcp/action-notifications";

async function path(context:any){const params=await context?.params,parts=Array.isArray(params?.actionNotificationPath)?params.actionNotificationPath:[];return parts.map((value:string)=>decodeURIComponent(value));}
const unavailable=()=>NextResponse.json({error:"The requested resource is unavailable."},{status:404,headers:{"Cache-Control":"no-store"}});
function queryAllowed(request:Request){const params=new URL(request.url).searchParams;return !TENANT_HINT_KEYS.some(key=>params.has(key))&&Array.from(params.keys()).length===0;}
function sameOrigin(request:Request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}

export async function GET(request:Request,context:any){try{if(!queryAllowed(request))return unavailable();const resolution=await resolveApplicationSession();if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return unavailable();requirePermission(resolution.session,"organizations.view");const parts=await path(context),id=parts.join("/"),item=(await listGovernedActionNotifications(resolution.session.activeOrganization.id)).find(row=>row.id===id);return item?NextResponse.json({ok:true,notification:item},{headers:{"Cache-Control":"no-store"}}):unavailable();}catch{return unavailable();}}
export async function POST(request:Request,context:any){try{if(!sameOrigin(request)||!queryAllowed(request))return unavailable();const resolution=await resolveApplicationSession();if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)return unavailable();requirePermission(resolution.session,"actions.execute");const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==0)return unavailable();const parts=await path(context),action=parts.pop(),id=parts.join("/");if(action!=="read"&&action!=="dismiss")return unavailable();const item=await updateGovernedActionNotificationState(resolution.session.activeOrganization.id,id,action);return NextResponse.json({ok:true,notification:item},{headers:{"Cache-Control":"no-store"}});}catch{return unavailable();}}

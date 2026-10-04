import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission, AuthorizationDeniedError } from "@/lib/identity/authorization-gateway";

function apiBaseUrl(){return String(process.env.TRACEKIT_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE_URL||process.env.NEXT_PUBLIC_API_BASE||"http://127.0.0.1:8787").replace(/\/+$/,"");}
function adminSecret(){return String(process.env.TK_SECRET_KEY||process.env.TRACEKIT_TK_SECRET||"").trim();}
async function readJsonSafe(res:Response){const text=await res.text().catch(()=>"");try{return text?JSON.parse(text):{};}catch{return{ok:false,error:"invalid_json",message:text.slice(0,400)};}}
async function authorizedScope(){
 const resolution=await resolveApplicationSession();
 if(resolution.kind!=="authenticated"||!resolution.session.activeOrganization)throw new AuthorizationDeniedError();
 requirePermission(resolution.session,"organizations.view");
 return{workspaceId:resolution.session.activeOrganization.id,actorId:resolution.session.user.id};
}
async function workItemFetch(pathAndQuery:string,init:RequestInit={}){const secret=adminSecret();if(!secret)return{status:500,body:{ok:false,error:"admin_auth_not_configured",message:"TK_SECRET_KEY is required on the UI server for Work Item requests."}};const res=await fetch(`${apiBaseUrl()}${pathAndQuery}`,{...init,cache:"no-store",headers:{accept:"application/json","content-type":"application/json","x-tk-secret":secret,...(init.headers||{})}});return{status:res.status,body:await readJsonSafe(res)};}
export async function GET(req:Request){try{const scope=await authorizedScope(),url=new URL(req.url);url.searchParams.set("workspace_id",scope.workspaceId);const result=await workItemFetch(`/v1/work-items?${url.searchParams.toString()}`,{method:"GET"});return NextResponse.json(result.body,{status:result.status});}catch(error){if(error instanceof AuthorizationDeniedError)return NextResponse.json({ok:false,error:"resource_unavailable"},{status:404});return NextResponse.json({ok:false,error:"resource_unavailable"},{status:404});}}

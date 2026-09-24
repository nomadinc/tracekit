import { NextResponse } from "next/server";
import { mcpResourceMetadata } from "@/lib/mcp/bearer-auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{return NextResponse.json(mcpResourceMetadata(),{headers:{"Cache-Control":"public, max-age=300","Access-Control-Allow-Origin":"*"}});}
 catch{return NextResponse.json({error:"oauth_not_configured"},{status:503});}
}
export async function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type"}});}

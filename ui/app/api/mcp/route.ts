import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { createTraceKitMcpReadService } from "@/lib/mcp/server";
import { handleTraceKitMcpMessage, TRACEKIT_MCP_PROTOCOL_VERSION } from "@/lib/mcp/protocol";
import { bearerToken, mcpWwwAuthenticate, verifyMcpBearerToken } from "@/lib/mcp/bearer-auth";
import { resolveMcpExternalSession } from "@/lib/mcp/external-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, extraHeaders:Record<string,string>={}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": TRACEKIT_MCP_PROTOCOL_VERSION, ...extraHeaders } });
}
function unauthorized(message="Authentication required") {
  return json({ jsonrpc:"2.0",id:null,error:{code:-32001,message}},401,{"WWW-Authenticate":mcpWwwAuthenticate()});
}
async function authenticatedSession(request:Request) {
  const token=bearerToken(request);
  if(token){
    try{
      const identity=await verifyMcpBearerToken(token);
      return await resolveMcpExternalSession(identity,new SupabaseIdentityTenancyRepository());
    }catch{return null;}
  }
  const resolution=await resolveApplicationSession();
  return resolution.kind==="authenticated" ? resolution.session : null;
}

export async function POST(request: Request) {
  const session=await authenticatedSession(request);
  if(!session) return unauthorized();
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  if (Array.isArray(body)) {
    if (!body.length) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    const service = createTraceKitMcpReadService(session);
    const results = (await Promise.all(body.map((item) => handleTraceKitMcpMessage(service, item)))).filter(Boolean);
    return results.length ? json(results) : new Response(null, { status: 202 });
  }
  const result = await handleTraceKitMcpMessage(createTraceKitMcpReadService(session), body);
  return result ? json(result) : new Response(null, { status: 202 });
}
export async function GET() { return unauthorized(); }
export async function DELETE() { return new Response(null, { status: 405, headers: { Allow: "POST" } }); }

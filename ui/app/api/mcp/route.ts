import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { createTraceKitMcpReadService } from "@/lib/mcp/server";
import { handleTraceKitMcpMessage, TRACEKIT_MCP_PROTOCOL_VERSION } from "@/lib/mcp/protocol";
import { bearerToken, mcpWwwAuthenticate, verifyMcpBearerToken } from "@/lib/mcp/bearer-auth";
import { resolveMcpExternalSession } from "@/lib/mcp/external-session";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, extraHeaders:Record<string,string>={}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": TRACEKIT_MCP_PROTOCOL_VERSION, ...extraHeaders } });
}
function unauthorized(message="Authentication required") {
  return json({ jsonrpc:"2.0",id:null,error:{code:-32001,message}},401,{"WWW-Authenticate":mcpWwwAuthenticate()});
}
type McpAuthResult = { session: TraceKitSessionContext; diagnostic: "ok" } | { session: null; diagnostic: string };
async function authenticatedSession(request:Request):Promise<McpAuthResult> {
  const authorization=request.headers.get("authorization");
  const scheme=authorization?.trim().split(/\s+/,1)[0]?.toLowerCase() || "none";
  const token=bearerToken(request);
  console.info("[mcp-auth] request boundary", {
    authorization_header_present: Boolean(authorization),
    authorization_scheme: scheme === "bearer" ? "bearer" : scheme === "none" ? "none" : "other",
    bearer_token_parsed: Boolean(token),
  });
  if(authorization && scheme!=="bearer") return {session:null,diagnostic:"non_bearer_scheme"};
  if(authorization && !token) return {session:null,diagnostic:"bearer_parse_failed"};
  if(token){
    try{
      const identity=await verifyMcpBearerToken(token);
      const session=await resolveMcpExternalSession(identity,new SupabaseIdentityTenancyRepository());
      return session ? {session,diagnostic:"ok"} : {session:null,diagnostic:"identity_resolution_failed"};
    }catch(error:unknown){
      const message=String((error as {message?:unknown}|null)?.message||"invalid_bearer_token");
      const reason=message.startsWith("invalid_bearer_token:") ? message.split(":")[1] : "verification_failed";
      console.warn("[mcp-auth] bearer rejected", { reason });
      return {session:null,diagnostic:reason};
    }
  }
  const resolution=await resolveApplicationSession();
  return resolution.kind==="authenticated" ? {session:resolution.session,diagnostic:"ok"} : {session:null,diagnostic:"no_authorization_header"};
}

export async function POST(request: Request) {
  const auth=await authenticatedSession(request);
  if(!auth.session) return json({jsonrpc:"2.0",id:null,error:{code:-32001,message:"Authentication required"}},401,{"WWW-Authenticate":mcpWwwAuthenticate(),"X-TraceKit-MCP-Auth-Diagnostic":auth.diagnostic});
  const session=auth.session;
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

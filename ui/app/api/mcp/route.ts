import { NextResponse } from "next/server";
import { resolveApplicationSession } from "@/lib/identity/application-session";
import { createTraceKitMcpReadService } from "@/lib/mcp/server";
import { handleTraceKitMcpMessage, TRACEKIT_MCP_PROTOCOL_VERSION } from "@/lib/mcp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": TRACEKIT_MCP_PROTOCOL_VERSION,
    },
  });
}

export async function POST(request: Request) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Authentication required" } }, 401);
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  if (Array.isArray(body)) {
    if (!body.length) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    const service = createTraceKitMcpReadService(resolution.session);
    const results = (await Promise.all(body.map((item) => handleTraceKitMcpMessage(service, item)))).filter(Boolean);
    return results.length ? json(results) : new Response(null, { status: 202 });
  }

  const result = await handleTraceKitMcpMessage(createTraceKitMcpReadService(resolution.session), body);
  return result ? json(result) : new Response(null, { status: 202 });
}

export async function GET() {
  return json({ error: "streaming_not_enabled", message: "TraceKit MCP V1 is stateless and accepts MCP messages over POST." }, 405);
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

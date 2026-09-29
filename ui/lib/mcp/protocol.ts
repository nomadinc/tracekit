import { TRACEKIT_MCP_TOOLS, callTraceKitMcpTool, mcpToolResult } from "./tool-adapter";
import type { TraceKitMcpReadService } from "./read-service";
import type { TraceKitMcpActionService } from "./action-service";

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown };

const PROTOCOL_VERSION = "2025-06-18";

function response(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}
function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export async function handleTraceKitMcpMessage(service: TraceKitMcpReadService, raw: unknown, actionService?: TraceKitMcpActionService) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return error(null, -32600, "Invalid Request");
  const request = raw as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return error(id, -32600, "Invalid Request");

  if (request.method === "initialize") {
    return response(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "tracekit", version: "0.1.0" },
      instructions: "TraceKit intelligence tools are tenant-scoped and permission-projected. Named action tools remain governed by explicit capability, permission, confirmation, authorization, verification, audit, and replay gates.",
    });
  }
  if (request.method === "ping") return response(id, {});
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") return response(id, { tools: TRACEKIT_MCP_TOOLS });

  if (request.method === "tools/call") {
    const params = request.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) return error(id, -32602, "Invalid params");
    const record = params as Record<string, unknown>;
    if (typeof record.name !== "string") return error(id, -32602, "Invalid params");
    try {
      const value = await callTraceKitMcpTool(service, record.name, record.arguments ?? {}, actionService);
      return response(id, mcpToolResult(value));
    } catch (cause: unknown) {
      const message = String((cause as { message?: unknown } | null)?.message || "");
      if (message === "tool_not_found") return error(id, -32602, "Unknown tool");
      if (message === "invalid_arguments") return error(id, -32602, "Invalid params");
      if (message.includes("unavailable") || message.includes("access_denied")) {
        return response(id, { content: [{ type: "text", text: "The requested resource is unavailable." }], isError: true });
      }
      const diagnosticEnabled=process.env.TRACEKIT_M13_READ_DIAGNOSTIC==="bounded-v1";const code=/^(?:customer_repository|mcp_customer_repository)_(?:core_http_\\d{3}|core_fetch_failed|scope_unavailable|core_auth_unavailable)$/.test(message)?message:"mcp_read_failed";return response(id,{content:[{type:"text",text:"TraceKit could not complete the request."}],isError:true,...(diagnosticEnabled?{structuredContent:{diagnosticCode:code}}:{})});
    }
  }
  return error(id, -32601, "Method not found");
}

export const TRACEKIT_MCP_PROTOCOL_VERSION = PROTOCOL_VERSION;

import type { TraceKitMcpReadService } from "./read-service";

export const TRACEKIT_MCP_TOOLS = [
  {
    name: "tracekit.list_customers",
    title: "List TraceKit customers",
    description: "List customers visible in the authenticated TraceKit Organization. Sensitive fields are permission-projected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.get_customer",
    title: "Get TraceKit customer",
    description: "Get one authorized customer workspace with retained journey, order, offer, and tracking evidence.",
    inputSchema: {
      type: "object",
      properties: { customer_id: { type: "string", minLength: 1, maxLength: 512 } },
      required: ["customer_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.explain_journey",
    title: "Explain TraceKit journey",
    description: "Return the authorized canonical Journey as structured chronology, attribution evidence, commerce relationships, provenance, and explicit evidence limits. Conclusions remain evidence-backed.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", minLength: 1, maxLength: 512 },
        journey_id: { type: "string", minLength: 1, maxLength: 512 },
      },
      required: ["customer_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.list_orders",
    title: "List TraceKit orders",
    description: "List orders visible in the authenticated TraceKit Organization. Financial and customer-sensitive fields are permission-projected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        customer_id: { type: "string", maxLength: 512 },
        offer_id: { type: "string", maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.get_order",
    title: "Get TraceKit order",
    description: "Get one authorized order workspace with available attribution, evidence, relationships, and permission-projected financial detail.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", minLength: 1, maxLength: 512 } },
      required: ["order_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.search",
    title: "Search TraceKit",
    description: "Search authorized customer and order read models. Inaccessible entity classes are omitted.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 12 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

export type TraceKitMcpToolName = (typeof TRACEKIT_MCP_TOOLS)[number]["name"];

function objectArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_arguments");
  return value as Record<string, unknown>;
}
function text(value: unknown, key: string, required = false) {
  const raw = value == null ? "" : String(value).trim();
  if (required && !raw) throw new Error("invalid_arguments");
  return raw || undefined;
}
function limit(value: unknown, max: number, fallback: number) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("invalid_arguments");
  return n;
}
function assertKeys(args: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(args).some((key) => !allowed.includes(key))) throw new Error("invalid_arguments");
}

export async function callTraceKitMcpTool(
  service: TraceKitMcpReadService,
  name: string,
  rawArguments: unknown,
) {
  const args = objectArgs(rawArguments ?? {});
  switch (name as TraceKitMcpToolName) {
    case "tracekit.list_customers":
      assertKeys(args, ["query", "limit"]);
      return service.listCustomers({ query: text(args.query, "query"), limit: limit(args.limit, 50, 25) });
    case "tracekit.get_customer":
      assertKeys(args, ["customer_id"]);
      return service.getCustomer(text(args.customer_id, "customer_id", true)!);
    case "tracekit.explain_journey":
      assertKeys(args, ["customer_id", "journey_id"]);
      return service.explainJourney(text(args.customer_id, "customer_id", true)!, text(args.journey_id, "journey_id"));
    case "tracekit.list_orders":
      assertKeys(args, ["query", "customer_id", "offer_id", "limit"]);
      return service.listOrders({
        query: text(args.query, "query"),
        customerId: text(args.customer_id, "customer_id"),
        offerId: text(args.offer_id, "offer_id"),
        limit: limit(args.limit, 50, 25),
      });
    case "tracekit.get_order":
      assertKeys(args, ["order_id"]);
      return service.getOrder(text(args.order_id, "order_id", true)!);
    case "tracekit.search":
      assertKeys(args, ["query", "limit"]);
      return service.search(text(args.query, "query", true)!, { limit: limit(args.limit, 25, 12) });
    default:
      throw new Error("tool_not_found");
  }
}

export function mcpToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}

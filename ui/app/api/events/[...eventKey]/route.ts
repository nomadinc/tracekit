import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";
export async function GET(request: Request, context: { params: Promise<{ eventKey: string[] }> }) {
  const params = await context.params;
  const parts = params.eventKey;
  if (!Array.isArray(parts) || !parts.length || parts.some(part => !part || part === "." || part === "..")) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const path = encodeURIComponent(parts.join("/"));
  const result = await scopedCoreGet(`/v1/events/${path}`, request.url, "customers.view", projectCoreCustomerRead);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

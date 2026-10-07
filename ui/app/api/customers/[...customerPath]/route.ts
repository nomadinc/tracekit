import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";

export async function GET(request: Request, context: { params: Promise<{ customerPath: string[] }> }) {
  const { customerPath: parts } = await context.params;
  if (!Array.isArray(parts) || !(parts.length === 1 || (parts.length === 3 && parts[1] === "journeys")) || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const path = parts.map(encodeURIComponent).join("/");
  const result = await scopedCoreGet(`/v1/customers/${path}`, request.url, "customers.view", projectCoreCustomerRead);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";
export async function GET(request: Request, context: { params: Promise<{ entityPath: string[] }> }) {
  const params = await context.params;
  const parts = params.entityPath;
  if (!Array.isArray(parts) || !parts.length || parts.some(part => !part || part === "." || part === ".." || /[\/\\?#]/.test(part))) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const path = parts.map(encodeURIComponent).join("/");
  const result = await scopedCoreGet(`/v1/entities/${path}`, request.url, "customers.view", projectCoreCustomerRead);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

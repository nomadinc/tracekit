import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";
export async function GET(request: Request) {
  const result = await scopedCoreGet("/v1/financial-reconciliation", request.url, ["financials.view", "orders.view_financials"], projectCoreCustomerRead);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

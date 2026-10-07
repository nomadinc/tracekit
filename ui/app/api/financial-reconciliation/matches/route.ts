import { NextResponse } from "next/server";
import { scopedCorePost } from "@/lib/identity/scoped-core-proxy";
export async function POST(request: Request) {
  const result = await scopedCorePost("/v1/financial-reconciliation/matches", request, ["financials.reconcile", "orders.view_financials"], { includeActor: true });
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

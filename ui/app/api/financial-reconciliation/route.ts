import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";

export async function GET(req: Request) {
  const result = await scopedCoreGet(
    "/v1/financial-reconciliation",
    req.url,
    "financials.view",
  );
  return NextResponse.json(result.body, { status: result.status });
}

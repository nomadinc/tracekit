import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";

export async function GET(request: Request) {
  const result = await scopedCoreGet(
    "/v1/profit/summary",
    request.url,
    ["financials.view", "orders.view_financials"],
  );

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

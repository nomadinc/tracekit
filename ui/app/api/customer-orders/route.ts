import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
export async function GET(request: Request) {
  const result = await scopedCoreGet("/v1/customer-orders", request.url, "orders.view", (body, session) => ({ ...body, orders: (body.orders || []).map((entry: any) => {
    const order = { ...entry.order };
    if (!session.effectivePermissions.includes("orders.view_financials") || !session.effectivePermissions.includes("financials.view")) delete order.gross_amount;
    return { ...entry, order };
  }) }));
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

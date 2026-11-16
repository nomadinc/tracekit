import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { projectCustomerOrders } from "@/lib/identity/customer-orders-projection";

export async function GET(request: Request) {
  const result = await scopedCoreGet("/v1/customer-orders", request.url, "orders.view", projectCustomerOrders);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";

export async function GET(req: Request) {
  const result = await scopedCoreGet("/v1/customers", req.url, "customers.view");
  return NextResponse.json(result.body, { status: result.status });
}

import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";
import { OPERATIONAL_ACCESS_POLICY } from "@/lib/identity/operational-tenant-boundary";

export async function GET(req: Request) {
  const result = await scopedCoreGet("/v1/notifications", req.url, OPERATIONAL_ACCESS_POLICY.notificationRead);
  return NextResponse.json(result.body, { status: result.status });
}

import { NextResponse } from "next/server";
import { scopedCorePost } from "@/lib/identity/scoped-core-proxy";
import { OPERATIONAL_ACCESS_POLICY } from "@/lib/identity/operational-tenant-boundary";

export async function POST(req: Request) {
  const result = await scopedCorePost(
    "/v1/work-items/acceptance-fixtures/ws019-m4-2",
    req,
    OPERATIONAL_ACCESS_POLICY.workItemTransition,
    {
      includeActor: true,
      includeCorrelation: true,
      rejectCallerScopeHints: true,
      allowedCallerKeys: [],
    },
  );
  return NextResponse.json(result.body, { status: result.status });
}

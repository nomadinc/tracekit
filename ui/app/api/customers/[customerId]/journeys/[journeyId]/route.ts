import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";
import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";

export async function GET(
  req: Request,
  context: { params: Promise<{ customerId: string; journeyId: string }> },
) {
  const { customerId, journeyId } = await context.params;
  if (!customerId || !journeyId)
    return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const result = await scopedCoreGet(
    `/v1/customers/${encodeURIComponent(customerId)}/journeys/${encodeURIComponent(journeyId)}`,
    req.url,
    "customers.view",
    projectCoreCustomerRead,
  );
  return NextResponse.json(result.body, { status: result.status });
}

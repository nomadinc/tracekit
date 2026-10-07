import { projectCoreCustomerRead } from "@/lib/identity/core-read-projection";
import { NextResponse } from "next/server";
import { scopedCoreGet } from "@/lib/identity/scoped-core-proxy";

export async function GET(
  req: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  const { customerId } = await context.params;
  if (!customerId) return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404 });
  const result = await scopedCoreGet(
    `/v1/customers/${encodeURIComponent(customerId)}`,
    req.url,
    "customers.view",
    projectCoreCustomerRead,
  );
  return NextResponse.json(result.body, { status: result.status });
}

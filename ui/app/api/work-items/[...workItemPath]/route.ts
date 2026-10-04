import { NextResponse } from "next/server";
import { scopedCoreGet, scopedCorePost } from "@/lib/identity/scoped-core-proxy";
import { OPERATIONAL_ACCESS_POLICY } from "@/lib/identity/operational-tenant-boundary";

async function workItemPathFromContext(context: any) {
  const params = await context?.params;
  const parts = Array.isArray(params?.workItemPath) ? params.workItemPath : [];
  return parts.map((part: string) => encodeURIComponent(part)).join("/");
}

export async function GET(req: Request, context: any) {
  const path = await workItemPathFromContext(context);
  if (!path) return NextResponse.json({ ok: false, error: "bad_request", message: "work item id is required." }, { status: 400 });
  const result = await scopedCoreGet(`/v1/work-items/${path}`, req.url, OPERATIONAL_ACCESS_POLICY.workItemRead);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: Request, context: any) {
  const path = await workItemPathFromContext(context);
  if (!path) return NextResponse.json({ ok: false, error: "bad_request", message: "work item id is required." }, { status: 400 });
  const result = await scopedCorePost(`/v1/work-items/${path}`, req, OPERATIONAL_ACCESS_POLICY.workItemTransition, { includeActor: true });
  return NextResponse.json(result.body, { status: result.status });
}

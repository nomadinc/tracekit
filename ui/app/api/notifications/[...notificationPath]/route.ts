import { NextResponse } from "next/server";
import { scopedCoreGet, scopedCorePost } from "@/lib/identity/scoped-core-proxy";
import { OPERATIONAL_ACCESS_POLICY } from "@/lib/identity/operational-tenant-boundary";

async function notificationPathFromContext(context: any) {
  const params = await context?.params;
  const parts = Array.isArray(params?.notificationPath) ? params.notificationPath : [];
  return parts.map((part: string) => encodeURIComponent(part)).join("/");
}

export async function GET(req: Request, context: any) {
  const path = await notificationPathFromContext(context);
  if (!path) return NextResponse.json({ ok: false, error: "bad_request", message: "notification id is required." }, { status: 400 });
  const result = await scopedCoreGet(`/v1/notifications/${path}`, req.url, OPERATIONAL_ACCESS_POLICY.notificationRead);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(req: Request, context: any) {
  const path = await notificationPathFromContext(context);
  if (!path) return NextResponse.json({ ok: false, error: "bad_request", message: "notification id is required." }, { status: 400 });
  const result = await scopedCorePost(`/v1/notifications/${path}`, req, OPERATIONAL_ACCESS_POLICY.notificationUpdate);
  return NextResponse.json(result.body, { status: result.status });
}

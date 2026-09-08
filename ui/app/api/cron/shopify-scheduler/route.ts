import { NextResponse } from "next/server";
import { runDueShopifySchedules } from "@/lib/commerce/shopify-scheduled-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizedCron(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const scheduler = await runDueShopifySchedules({ limit: 3 });
    return NextResponse.json({ ok: true, scheduler });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "unknown_error";
    console.error("shopify_scheduler_failed", { message });
    return NextResponse.json({ ok: false, message: "TraceKit could not complete Shopify scheduled work." }, { status: 500 });
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueEverflowSchedules } from "@/lib/integrations/everflow-scheduled-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizedCron(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  if (!authorizedCron(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized.", requestId }, { status: 401 });
  }

  try {
    const result = await runDueEverflowSchedules({ limit: 1 });
    return NextResponse.json({ ok: true, ...result, requestId });
  } catch {
    return NextResponse.json(
      { ok: false, message: "TraceKit could not complete the Everflow scheduled run.", requestId },
      { status: 500 },
    );
  }
}

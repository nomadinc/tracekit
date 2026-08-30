import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runEverflowOrderBackfillBatches } from "@/lib/integrations/everflow-order-backfill";
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

  let scheduler: unknown = null;
  let backfill: unknown = null;
  let schedulerFailed = false;
  let backfillFailed = false;

  try {
    scheduler = await runDueEverflowSchedules({ limit: 1 });
  } catch {
    schedulerFailed = true;
  }

  try {
    backfill = await runEverflowOrderBackfillBatches({ batchSize: 250 });
  } catch {
    backfillFailed = true;
  }

  if (schedulerFailed && backfillFailed) {
    return NextResponse.json(
      { ok: false, message: "TraceKit could not complete the Everflow scheduled work.", requestId },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    scheduler,
    backfill,
    warnings: [
      ...(schedulerFailed ? ["scheduler_failed"] : []),
      ...(backfillFailed ? ["backfill_failed"] : []),
    ],
    requestId,
  });
}

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

function errorSummary(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown_error";
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
  let schedulerError: string | null = null;
  let backfillError: string | null = null;

  // Reconciliation is intentionally first. A due Everflow ingestion can take several
  // minutes, so running the bounded database batch first guarantees historical/new
  // linkage continues to make progress on every five-minute cron wake.
  try {
    backfill = await runEverflowOrderBackfillBatches({ batchSize: 250 });
  } catch (error) {
    backfillFailed = true;
    backfillError = errorSummary(error);
    console.error("everflow_backfill_failed", { requestId, error: backfillError });
  }

  try {
    scheduler = await runDueEverflowSchedules({ limit: 1 });
  } catch (error) {
    schedulerFailed = true;
    schedulerError = errorSummary(error);
    console.error("everflow_scheduler_failed", { requestId, error: schedulerError });
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
    errors: {
      scheduler: schedulerError,
      backfill: backfillError,
    },
    requestId,
  });
}

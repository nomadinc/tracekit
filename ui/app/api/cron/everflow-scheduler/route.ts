import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
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

function asCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function patchTelemetry(requestId: string, patch: Record<string, unknown>) {
  try {
    await commercePersistenceRequest(
      `everflow_cron_runs?request_id=eq.${encodeURIComponent(requestId)}`,
      { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) },
    );
  } catch (error) {
    console.error("everflow_cron_telemetry_patch_failed", { requestId, error: errorSummary(error) });
  }
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  if (!authorizedCron(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized.", requestId }, { status: 401 });
  }

  try {
    await commercePersistenceRequest("everflow_cron_runs", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, started_at: new Date().toISOString() }),
    });
  } catch (error) {
    console.error("everflow_cron_telemetry_insert_failed", { requestId, error: errorSummary(error) });
  }

  let scheduler: unknown = null;
  let backfill: unknown = null;
  let schedulerFailed = false;
  let backfillFailed = false;
  let schedulerError: string | null = null;
  let backfillError: string | null = null;

  await patchTelemetry(requestId, { backfill_started_at: new Date().toISOString(), backfill_status: "running" });
  try {
    // The indexed reconciliation path measures about 7.2s for 100 events in Production.
    // Use 50 to preserve comfortable headroom under PostgREST's 8-second authenticator timeout.
    // The function is resumable and advisory-lock protected, so smaller batches do not change correctness.
    backfill = await runEverflowOrderBackfillBatches({ batchSize: 50 });
    const summary = (backfill && typeof backfill === "object") ? backfill as Record<string, unknown> : {};
    await patchTelemetry(requestId, {
      backfill_completed_at: new Date().toISOString(),
      backfill_status: "completed",
      backfill_processed: asCount(summary.processed),
      backfill_matched: asCount(summary.matched),
      backfill_ambiguous: asCount(summary.ambiguous),
      backfill_unmatched: asCount(summary.unmatched),
      backfill_remaining: asCount(summary.remaining),
    });
  } catch (error) {
    backfillFailed = true;
    backfillError = errorSummary(error);
    console.error("everflow_backfill_failed", { requestId, error: backfillError });
    await patchTelemetry(requestId, {
      backfill_completed_at: new Date().toISOString(),
      backfill_status: "failed",
      backfill_error: backfillError,
    });
  }

  await patchTelemetry(requestId, { scheduler_started_at: new Date().toISOString(), scheduler_status: "running" });
  try {
    scheduler = await runDueEverflowSchedules({ limit: 1 });
    await patchTelemetry(requestId, {
      scheduler_completed_at: new Date().toISOString(),
      scheduler_status: "completed",
    });
  } catch (error) {
    schedulerFailed = true;
    schedulerError = errorSummary(error);
    console.error("everflow_scheduler_failed", { requestId, error: schedulerError });
    await patchTelemetry(requestId, {
      scheduler_completed_at: new Date().toISOString(),
      scheduler_status: "failed",
      scheduler_error: schedulerError,
    });
  }

  const responseStatus = schedulerFailed && backfillFailed ? 500 : 200;
  await patchTelemetry(requestId, { completed_at: new Date().toISOString(), response_status: responseStatus });

  if (responseStatus === 500) {
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

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
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

  // Reconciliation is intentionally delegated to Supabase pg_cron. The v2 reconciliation
  // function can exceed PostgREST's 8-second authenticator timeout even when database-side
  // execution succeeds, so the database scheduler runs it directly without the HTTP ceiling.
  await patchTelemetry(requestId, {
    backfill_started_at: new Date().toISOString(),
    backfill_completed_at: new Date().toISOString(),
    backfill_status: "delegated_pg_cron",
    backfill_error: null,
  });

  let scheduler: unknown = null;
  let schedulerFailed = false;
  let schedulerError: string | null = null;

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

  const responseStatus = schedulerFailed ? 500 : 200;
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
    backfill: { delegated: "pg_cron" },
    warnings: [],
    errors: {
      scheduler: schedulerError,
      backfill: null,
    },
    requestId,
  });
}

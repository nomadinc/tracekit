import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { runDueEverflowSchedules } from "@/lib/integrations/everflow-scheduled-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const EVERFLOW_SCHEDULER_VERSION = "bounded-page-v1";

function deploymentProvenance() {
  return {
    scheduler_version: EVERFLOW_SCHEDULER_VERSION,
    deployment_commit_sha: String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim() || null,
    deployment_git_ref: String(process.env.VERCEL_GIT_COMMIT_REF || "").trim() || null,
  };
}

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
      { method: "PATCH", body: JSON.stringify({ ...deploymentProvenance(), ...patch, updated_at: new Date().toISOString() }) },
    );
  } catch (error) {
    console.error("everflow_cron_telemetry_patch_failed", { requestId, error: errorSummary(error) });
  }
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const provenance = deploymentProvenance();
  if (!authorizedCron(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized.", requestId }, { status: 401 });
  }

  try {
    await commercePersistenceRequest("everflow_cron_runs", {
      method: "POST",
      body: JSON.stringify({ request_id: requestId, started_at: new Date().toISOString(), ...provenance }),
    });
  } catch (error) {
    console.error("everflow_cron_telemetry_insert_failed", { requestId, error: errorSummary(error), ...provenance });
  }

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
    console.error("everflow_scheduler_failed", { requestId, error: schedulerError, ...provenance });
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
      { ok: false, message: "TraceKit could not complete the Everflow scheduled work.", schedulerVersion: EVERFLOW_SCHEDULER_VERSION, deploymentCommitSha: provenance.deployment_commit_sha, deploymentGitRef: provenance.deployment_git_ref, requestId },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    schedulerVersion: EVERFLOW_SCHEDULER_VERSION,
    deploymentCommitSha: provenance.deployment_commit_sha,
    deploymentGitRef: provenance.deployment_git_ref,
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

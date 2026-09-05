import "server-only";
import { randomUUID } from "node:crypto";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { SupabaseCommerceControlRepository, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "@/lib/commerce/credential-crypto";
import { syncEverflowScheduledConversionPage } from "./everflow-scheduled-conversion-page";
import { captureEverflowConversionBaseline, finalizeEverflowConversionRunMetrics, mergeEverflowSyncRunMetadata } from "./everflow-conversion-run-metrics";
import { captureEverflowFinancialBaseline, persistEverflowEventReversalHistory } from "./everflow-event-reversals";
import { projectEverflowFinancialEffects } from "./everflow-financial-projection";
import { everflowIncrementalWindow, loadEverflowIncrementalState, markEverflowIncrementalAttempt, markEverflowIncrementalChunkSuccess, markEverflowIncrementalFailure } from "./everflow-incremental";
import { EverflowHealthError } from "./everflow-client";
import { fetchEverflowClickStream, persistEverflowClicks } from "./everflow-clicks";
import { ingestEverflowClickWindow, EverflowClickAdaptiveError, type EverflowClickSplitTelemetry } from "./everflow-click-window";
import { everflowClickIncrementalWindow, loadEverflowClickIncrementalState, markEverflowClickIncrementalAttempt, markEverflowClickIncrementalChunkSuccess, markEverflowClickIncrementalFailure, markEverflowClickSubwindowSuccess } from "./everflow-click-incremental";

type ScheduleRow = {
  id: string;
  account_id: string;
  organization_id: string;
  connection_id: string;
  provider_account_id: string;
  resource: string;
  enabled: boolean;
  activation_state: string;
  next_overlap_at: string | null;
  last_enqueued_at: string | null;
  updated_at: string;
  sync_frequency: string | null;
  lease_owner?: string | null;
  lease_expires_at?: string | null;
  lease_heartbeat_at?: string | null;
};

type SchedulerScope = {
  accountId: string;
  organizationId: string;
  connectionId: string;
  providerAccountId: string;
  now?: Date;
};

type EverflowNetworkMetadata = {
  timezoneId?: number | null;
};

type ClickFailureDiagnostic = {
  stage: string;
  errorCode: string;
  httpStatus: number | null;
  retryable: boolean | null;
  summary: string;
  splitCount?: number;
  providerRequestCount?: number;
  smallestIntervalSeconds?: number;
  stoppingReason?: string;
  resumeFrom?: string;
  resumeTo?: string;
};

const schedulerSession = {} as TraceKitSessionContext;
const repo = new SupabaseCommerceControlRepository();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function classifyClickFailure(error: unknown, stage: string): ClickFailureDiagnostic {
  const split = error && typeof error === "object" && "telemetry" in error ? (error as { telemetry?: EverflowClickSplitTelemetry }).telemetry : undefined;
  const resume = error && typeof error === "object" && "resumeInterval" in error ? (error as { resumeInterval?: { from: string; to: string } }).resumeInterval : undefined;
  const extra = { ...(split ? { splitCount: split.splitCount, providerRequestCount: split.providerRequestCount, smallestIntervalSeconds: split.smallestIntervalSeconds, stoppingReason: split.stoppingReason } : {}), ...(resume ? { resumeFrom: resume.from, resumeTo: resume.to } : {}) };
  if (error instanceof EverflowClickAdaptiveError) {
    return { stage, errorCode: error.code, httpStatus: error.httpStatus, retryable: error.retryable, summary: error.message, ...extra };
  }
  if (error instanceof EverflowHealthError) {
    return { stage, errorCode: error.code, httpStatus: error.httpStatus, retryable: error.retryable, summary: error.message, ...extra };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { stage, errorCode: "everflow_timeout", httpStatus: 504, retryable: true, summary: "Everflow click ingestion exceeded the request timeout.", ...extra };
  }
  return { stage, errorCode: `everflow_click_${stage}_failed`, httpStatus: null, retryable: null, summary: `Everflow click ingestion failed during ${stage}.`, ...extra };
}

function credentialKey() {
  const id = process.env.COMMERCE_CREDENTIALS_KEY_ID;
  const version = Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION || "1");
  if (!id || !Number.isInteger(version) || version < 1) throw new Error("Commerce credential encryption is unavailable.");
  return { bytes: decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY), id, version };
}

function servicePlane(scope: SchedulerScope) {
  const key = credentialKey();
  const connection = async (id: string) => {
    if (id !== scope.connectionId) throw new Error("Everflow scheduler scope mismatch.");
    const row = await repo.connectionById(id);
    if (!row || row.organizationId !== scope.organizationId || row.provider !== "everflow" || row.status !== "connected") throw new Error("Everflow connection is unavailable.");
    return row;
  };
  return {
    async getConnection(_s: TraceKitSessionContext, id: string) { return connection(id); },
    async listProviderAccounts(_s: TraceKitSessionContext, id: string) { await connection(id); return repo.listProviderAccounts(id, scope.organizationId); },
    async resolveCredentialForExecution(_s: TraceKitSessionContext, id: string) {
      await connection(id);
      const value = await repo.activeCredential(id, scope.organizationId);
      if (!value?.encrypted || value.revokedAt) throw new Error("The commerce credential is unavailable.");
      return decryptCommerceCredential(value.encrypted, key.bytes);
    },
    async createSyncRun(_s: TraceKitSessionContext, id: string, providerAccountId: string, mode: string, syncType: string) {
      await connection(id);
      if (providerAccountId !== scope.providerAccountId) throw new Error("Everflow scheduler provider account mismatch.");
      return repo.createSyncRun({ organizationId: scope.organizationId, connectionId: id, providerAccountId, syncType, mode, leaseOwner: null, leaseExpiresAt: null });
    },
    async claimSyncRun(_s: TraceKitSessionContext, id: string, runId: string, owner: string, leaseSeconds: number) { await connection(id); return repo.claimSyncRun({ runId, organizationId: scope.organizationId, connectionId: id, owner, leaseSeconds }); },
    async heartbeatSyncRun(_s: TraceKitSessionContext, id: string, runId: string, owner: string, leaseSeconds: number) { return repo.heartbeatSyncRun({ runId, organizationId: scope.organizationId, connectionId: id, owner, leaseSeconds }); },
    async completeSyncRun(_s: TraceKitSessionContext, id: string, runId: string, owner: string, withWarnings = false) { return repo.transitionSyncRun({ runId, organizationId: scope.organizationId, connectionId: id, owner, transition: withWarnings ? "completed_with_warnings" : "completed" }); },
    async failSyncRun(_s: TraceKitSessionContext, id: string, runId: string, owner: string, errorCode: string, safeSummary: string) { return repo.transitionSyncRun({ runId, organizationId: scope.organizationId, connectionId: id, owner, transition: "failed", errorCode, errorSummary: safeSummary.slice(0, 500) }); },
    async beginCheckpoint(_s: TraceKitSessionContext, id: string, input: Record<string, unknown>) { await connection(id); return repo.beginCheckpoint({ ...input, organizationId: scope.organizationId, connectionId: id } as never); },
    async completeCheckpoint(_s: TraceKitSessionContext, id: string, checkpointId: string, pageFingerprint: string) { return repo.updateCheckpoint(checkpointId, scope.organizationId, id, { state: "completed", pageFingerprint }); },
    async failCheckpoint(_s: TraceKitSessionContext, id: string, checkpointId: string, retryCount: number) { return repo.updateCheckpoint(checkpointId, scope.organizationId, id, { state: "failed", retryCount }); },
    async resolveSourceMapping(_s: TraceKitSessionContext, id: string, providerAccountId: string, sourceObjectType: string, sourceObjectId: string) { await connection(id); return repo.sourceMapping(id, providerAccountId, sourceObjectType, sourceObjectId); },
    async createOrObserveSourceMapping(_s: TraceKitSessionContext, id: string, input: Record<string, unknown>) {
      await connection(id);
      const canonicalType = String(input.canonicalObjectType || ""), canonicalId = String(input.canonicalObjectId || "");
      if (!await repo.canonicalTargetExists(scope.organizationId, canonicalType, canonicalId)) throw new Error("Canonical mapping target is unavailable.");
      return repo.upsertSourceMapping({ ...input, organizationId: scope.organizationId, connectionId: id } as never);
    },
  };
}

async function persistedCount(connectionId: string) {
  const size = 1000;
  let offset = 0, total = 0;
  while (true) {
    const rows = await commercePersistenceRequest(`everflow_conversion_events?connection_id=eq.${encodeURIComponent(connectionId)}&ingestion_method=eq.api&select=id&order=id.asc&limit=${size}&offset=${offset}`);
    total += rows.length;
    if (rows.length < size) return total;
    offset += size;
  }
}

async function everflowClickExecutionContext(scope: SchedulerScope) {
  const connection = await repo.connectionById(scope.connectionId);
  if (!connection || connection.organizationId !== scope.organizationId || connection.provider !== "everflow" || connection.status !== "connected") {
    throw new Error("Everflow connection is unavailable.");
  }
  const metadata = (connection.capabilities?.everflowNetwork || {}) as EverflowNetworkMetadata;
  const timezoneId = Number(metadata.timezoneId);
  if (!Number.isInteger(timezoneId) || timezoneId <= 0) throw new Error("Everflow network timezone is unavailable.");
  const credential = await repo.activeCredential(scope.connectionId, scope.organizationId);
  if (!credential?.encrypted || credential.revokedAt) throw new Error("The commerce credential is unavailable.");
  return {
    apiKey: await decryptCommerceCredential(credential.encrypted, credentialKey().bytes),
    timezoneId,
  };
}

export async function runEverflowScheduledClickChunk(scope: SchedulerScope) {
  if (![scope.accountId, scope.organizationId, scope.connectionId, scope.providerAccountId].every((value) => uuid.test(value))) throw new Error("Everflow click scheduler scope is invalid.");
  const now = scope.now || new Date();
  const state = await loadEverflowClickIncrementalState(scope);
  const window = everflowClickIncrementalWindow({ now, lastSuccessfulAt: state.lastSuccessfulAt, boundary: state.boundary });
  await markEverflowClickIncrementalAttempt({ ...scope, attemptedAt: now.toISOString(), window });
  let stage = "execution_context";
  try {
    const execution = await everflowClickExecutionContext(scope);
    stage = "provider_fetch";
    let persistedCount = 0, acceptedCount = 0;
    const ingestion = await ingestEverflowClickWindow({
      interval: { from: window.from, to: window.to },
      fetchInterval: (interval) => fetchEverflowClickStream({ apiKey: execution.apiKey, ...interval, timezoneId: execution.timezoneId }),
      persistCompleteInterval: async (interval, clicks, splitTelemetry) => {
        stage = "persistence";
        const persisted = await persistEverflowClicks({ ...scope, clicks, observedAt: new Date().toISOString() });
        persistedCount += persisted.persisted;
        acceptedCount += clicks.length;
        stage = "state_commit";
        await markEverflowClickSubwindowSuccess({ ...scope, completedAt: new Date().toISOString(), to: interval.to, parentTo: window.to, targetTo: window.targetTo, overlapDays: window.overlapDays, bootstrap: window.bootstrap, seen: acceptedCount, splitCount: splitTelemetry.splitCount, providerRequestCount: splitTelemetry.providerRequestCount, smallestIntervalSeconds: splitTelemetry.smallestIntervalSeconds });
        stage = "provider_fetch";
      },
    });
    const completedAt = new Date().toISOString();
    stage = "state_commit";
    const progress = await markEverflowClickIncrementalChunkSuccess({ ...scope, completedAt, from: window.from, to: window.to, targetTo: window.targetTo, overlapDays: window.overlapDays, bootstrap: window.bootstrap, seen: ingestion.seen, splitCount: ingestion.telemetry.splitCount, providerRequestCount: ingestion.telemetry.providerRequestCount, smallestIntervalSeconds: ingestion.telemetry.smallestIntervalSeconds });
    return { ok: true, window, progress, seen: ingestion.seen, persisted: persistedCount, timezoneId: execution.timezoneId, adaptiveSplit: ingestion.telemetry };
  } catch (error) {
    const diagnostic = classifyClickFailure(error, stage);
    await markEverflowClickIncrementalFailure({ ...scope, failedAt: new Date().toISOString(), warningCode: "everflow_scheduled_click_sync_failed", targetTo: window.targetTo, overlapDays: window.overlapDays, bootstrap: window.bootstrap, ...diagnostic }).catch(() => undefined);
    throw error;
  }
}

export async function runEverflowScheduledChunk(scope: SchedulerScope) {
  if (![scope.accountId, scope.organizationId, scope.connectionId, scope.providerAccountId].every((value) => uuid.test(value))) throw new Error("Everflow scheduler scope is invalid.");
  const now = scope.now || new Date();
  const state = await loadEverflowIncrementalState(scope);
  const window = everflowIncrementalWindow({ now, lastSuccessfulAt: state.lastSuccessfulAt, boundary: state.boundary });
  await markEverflowIncrementalAttempt({ ...scope, attemptedAt: now.toISOString(), window });
  let stage = "baseline";
  try {
    const beforeCount = await persistedCount(scope.connectionId);
    const baseline = await captureEverflowConversionBaseline(scope.connectionId);
    const financialBaseline = await captureEverflowFinancialBaseline(scope.connectionId);
    stage = "provider_sync";
    const result = await syncEverflowScheduledConversionPage({
      plane: servicePlane(scope) as never,
      session: schedulerSession,
      organizationId: scope.organizationId,
      connectionId: scope.connectionId,
      from: window.from,
      to: window.to,
      page: window.page,
    });
    stage = "run_metrics";
    const afterCount = await persistedCount(scope.connectionId);
    await commercePersistenceRequest(`commerce_sync_runs?id=eq.${encodeURIComponent(result.syncRunId)}&organization_id=eq.${encodeURIComponent(scope.organizationId)}&connection_id=eq.${encodeURIComponent(scope.connectionId)}`, { method: "PATCH", body: JSON.stringify({ pages_completed: 1, records_seen: result.seen, provider_request_count: 1, stopping_reason: result.sourceComplete ? "source_window_complete" : "page_chunk_complete" }) });
    const changeMetrics = await finalizeEverflowConversionRunMetrics({ connectionId: scope.connectionId, syncRunId: result.syncRunId, baseline });
    if (changeMetrics.created !== Math.max(0, afterCount - beforeCount)) throw new Error("Everflow conversion change metrics were inconsistent.");
    stage = "state_history";
    const eventEffects = await persistEverflowEventReversalHistory({ organizationId: scope.organizationId, connectionId: scope.connectionId, syncRunId: result.syncRunId, providerAccountId: result.providerAccountId, baseline: financialBaseline });
    stage = "financial_projection";
    const financialProjection = await projectEverflowFinancialEffects({ organizationId: scope.organizationId, connectionId: scope.connectionId, syncRunId: result.syncRunId });

    let clickSync: Awaited<ReturnType<typeof runEverflowScheduledClickChunk>> | null = null;
    let clickSyncFailed = false;
    try {
      clickSync = await runEverflowScheduledClickChunk(scope);
    } catch {
      clickSyncFailed = true;
    }

    stage = "classification_metadata";
    await mergeEverflowSyncRunMetadata({
      connectionId: scope.connectionId,
      syncRunId: result.syncRunId,
      values: {
        linkage: result.linkage,
        financialProjection,
        boundedScheduler: { page: result.page, nextPage: result.nextPage, sourceComplete: result.sourceComplete },
        clickSync: clickSync
          ? { status: "completed", seen: clickSync.seen, persisted: clickSync.persisted, window: clickSync.window, windowComplete: clickSync.progress.windowComplete, timezoneId: clickSync.timezoneId, adaptiveSplit: clickSync.adaptiveSplit }
          : { status: "failed", warningCode: "everflow_scheduled_click_sync_failed" },
      },
    });
    stage = "cursor_commit";
    const completedAt = new Date().toISOString();
    const progress = await markEverflowIncrementalChunkSuccess({
      ...scope,
      completedAt,
      syncRunId: result.syncRunId,
      from: window.from,
      to: window.to,
      targetTo: window.targetTo,
      overlapDays: window.overlapDays,
      bootstrap: window.bootstrap,
      seen: result.seen,
      sourceComplete: result.sourceComplete,
      nextPage: result.nextPage,
    });
    return { ok: true, window, progress, result, changeMetrics, eventEffects, financialProjection, clickSync, clickSyncFailed };
  } catch (error) {
    await markEverflowIncrementalFailure({ ...scope, failedAt: new Date().toISOString(), warningCode: `everflow_scheduled_${stage}_failed` }).catch(() => undefined);
    throw error;
  }
}

export async function ensureEverflowConversionSchedules(connectionId?: string) {
  if (connectionId && !uuid.test(connectionId)) throw new Error("Everflow scheduler connection scope is invalid.");
  await commercePersistenceRequest("rpc/ensure_everflow_conversion_schedules", {
    method: "POST",
    body: JSON.stringify({ p_connection_id: connectionId || null }),
  });
}

export async function dueEverflowSchedules(now = new Date(), connectionId?: string): Promise<ScheduleRow[]> {
  const filter = connectionId ? `&connection_id=eq.${encodeURIComponent(connectionId)}` : "";
  return await commercePersistenceRequest(`commerce_sync_schedules?resource=eq.everflow_conversions&enabled=eq.true&activation_state=eq.enabled&sync_frequency=neq.manual&next_overlap_at=not.is.null&next_overlap_at=lte.${encodeURIComponent(now.toISOString())}${filter}&select=id,account_id,organization_id,connection_id,provider_account_id,resource,enabled,activation_state,next_overlap_at,last_enqueued_at,updated_at,sync_frequency,lease_owner,lease_expires_at,lease_heartbeat_at&order=next_overlap_at.asc&limit=10`) as unknown as ScheduleRow[];
}

async function claimSchedule(schedule: ScheduleRow, now: Date) {
  const leaseOwner = `everflow-scheduler:${randomUUID()}`;
  const rows = await commercePersistenceRequest("rpc/claim_everflow_conversion_schedule", {
    method: "POST",
    body: JSON.stringify({ p_schedule_id: schedule.id, p_now: now.toISOString(), p_lease_owner: leaseOwner, p_lease_seconds: 1200 }),
  });
  if (!rows[0]) return null;
  return { schedule: rows[0] as unknown as ScheduleRow, leaseOwner };
}

async function finishSchedule(scheduleId: string, leaseOwner: string, outcome: "completed" | "incomplete" | "failed", now = new Date()) {
  const rows = await commercePersistenceRequest("rpc/finish_everflow_conversion_schedule", {
    method: "POST",
    body: JSON.stringify({ p_schedule_id: scheduleId, p_lease_owner: leaseOwner, p_now: now.toISOString(), p_outcome: outcome }),
  });
  return Boolean(rows[0]);
}

export async function runDueEverflowSchedules(input: { now?: Date; limit?: number; connectionId?: string } = {}) {
  const now = input.now || new Date();
  const limit = Math.max(1, Math.min(5, input.limit || 1));
  await ensureEverflowConversionSchedules(input.connectionId);
  const due = await dueEverflowSchedules(now, input.connectionId);
  const results: Array<Record<string, unknown>> = [];

  for (const candidate of due.slice(0, limit)) {
    const claim = await claimSchedule(candidate, now);
    if (!claim) {
      results.push({ scheduleId: candidate.id, status: "claim_lost" });
      continue;
    }

    const schedule = claim.schedule;
    try {
      const result = await runEverflowScheduledChunk({ accountId: schedule.account_id, organizationId: schedule.organization_id, connectionId: schedule.connection_id, providerAccountId: schedule.provider_account_id, now });
      const outcome = result.progress.windowComplete ? "completed" : "incomplete";
      if (!await finishSchedule(schedule.id, claim.leaseOwner, outcome)) throw new Error("Everflow schedule lease could not be released.");
      results.push({
        scheduleId: schedule.id,
        status: "completed",
        windowComplete: result.progress.windowComplete,
        sourceComplete: result.result.sourceComplete,
        page: result.result.page,
        nextPage: result.result.nextPage,
        clickStatus: result.clickSyncFailed ? "failed" : "completed",
        clickWindowComplete: result.clickSync?.progress.windowComplete ?? false,
        syncRunId: result.result.syncRunId,
        seen: result.result.seen,
        clicksSeen: result.clickSync?.seen ?? 0,
        clicksPersisted: result.clickSync?.persisted ?? 0,
        linkage: result.result.linkage,
        financialProjection: result.financialProjection,
      });
    } catch (error) {
      await finishSchedule(schedule.id, claim.leaseOwner, "failed").catch(() => undefined);
      results.push({ scheduleId: schedule.id, status: "failed", error: error instanceof Error ? error.message : "everflow_scheduled_failed" });
    }
  }

  return { due: due.length, processed: results.length, results, requestId: randomUUID() };
}

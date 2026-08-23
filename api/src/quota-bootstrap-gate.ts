import { bootstrapRejectionCode, type CommerceQueueMessage } from "./continuous-commerce-cloudflare.ts";

export function sanitizedReadResult(error: any) {
  return error ? { ok: false, status: 400, code: String(error.code || "postgrest_error") } : { ok: true, status: 200 };
}

export async function readQuotaBootstrapGate(db: any, message: CommerceQueueMessage) {
  const { data: connection, error: connectionError } = await db.from("commerce_provider_connections").select("organization_id,account_id,provider,status").eq("organization_id", message.organization_id).eq("id", message.connection_id).maybeSingle();
  const { data: accounts, error: accountError } = await db.from("commerce_provider_accounts").select("id").eq("organization_id", message.organization_id).eq("connection_id", message.connection_id).eq("status", "active");
  const { count: controls, error: controlError } = await db.from("tracekit_production_controls").select("id", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("capability", "commerce_scheduler").eq("activation_state", "enabled");
  const { count: schedules, error: scheduleError } = await db.from("commerce_sync_schedules").select("id", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("connection_id", message.connection_id).eq("provider_account_id", message.provider_account_id).eq("enabled", true).eq("activation_state", "enabled");
  let activeRunQuery = db.from("commerce_sync_runs").select("id", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("connection_id", message.connection_id).in("status", ["queued", "running", "paused"]);
  if (message.reserved_run_id) activeRunQuery = activeRunQuery.neq("id", message.reserved_run_id);
  const { count: activeRuns, error: activeRunError } = await activeRunQuery;
  // commerce_repository_activation has a composite (organization_id, workspace)
  // primary key and intentionally has no synthetic id column.
  const { count: liveActivation, error: liveActivationError } = await db.from("commerce_repository_activation").select("organization_id", { count: "exact", head: true }).eq("organization_id", message.organization_id).in("mode", ["live", "live_beta"]);
  const { data: latest, error: latestError } = await db.from("commerce_sync_runs").select("metadata").eq("organization_id", message.organization_id).eq("connection_id", message.connection_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const reads = {
    connection: sanitizedReadResult(connectionError), provider_account: sanitizedReadResult(accountError), scheduler_control: sanitizedReadResult(controlError),
    schedule: sanitizedReadResult(scheduleError), active_run: sanitizedReadResult(activeRunError), live_activation: sanitizedReadResult(liveActivationError), quota: sanitizedReadResult(latestError), bootstrap_attempt: sanitizedReadResult(latestError),
  };
  if (connectionError || accountError || controlError || scheduleError || activeRunError || liveActivationError || latestError) return { reads, rejection: "database_read_error" as const };
  const metadata = latest?.metadata && typeof latest.metadata === "object" ? latest.metadata as Record<string, unknown> : {};
  const replacementReserved = Boolean(message.reserved_run_id && metadata.quota_bootstrap_retry === true);
  const decision = { provider: String(connection?.provider || ""), connected: String(connection?.status || "") === "connected" && (accounts || []).length === 1 && String((accounts || [])[0]?.id || "") === message.provider_account_id, activeAccountCount: (accounts || []).length, quotaRemaining: Number.isFinite(Number(metadata.rate_limit_end)) ? Number(metadata.rate_limit_end) : null, attempted: metadata.quota_bootstrap_attempted === true && !replacementReserved, schedulerEnabled: Number(controls || 0) > 0, scheduleEnabled: Number(schedules || 0) > 0, activeRuns: Number(activeRuns || 0), liveActivationCount: Number(liveActivation || 0) };
  return { reads, rejection: bootstrapRejectionCode(decision) };
}

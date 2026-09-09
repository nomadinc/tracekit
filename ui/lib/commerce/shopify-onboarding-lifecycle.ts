import "server-only";

import { resolveApplicationSession } from "@/lib/identity/application-session";
import { requirePermission } from "@/lib/identity/authorization-gateway";
import { commercePersistenceRequest } from "./supabase-control-repository";
import type { ShopifyResource } from "./shopify-core/resources";

const RESOURCES: ShopifyResource[] = ["products", "customers", "orders"];
type Row = Record<string, unknown>;

export type ShopifyOnboardingResourceStatus = {
  resource: ShopifyResource;
  scheduleReady: boolean;
  incrementalStatus: "pending" | "running" | "completed" | "failed";
  backfillStatus: "pending" | "running" | "completed" | "failed";
  backfillRecords: number;
  lastIncrementalAt: string | null;
};

export type ShopifyOnboardingLifecycle = {
  state: "setting_up" | "syncing_history" | "ready" | "needs_attention";
  label: string;
  detail: string;
  resources: ShopifyOnboardingResourceStatus[];
  schedulesReady: number;
  backfillsComplete: number;
  liveResourcesHealthy: number;
};

export async function loadShopifyOnboardingLifecycle(connectionIdValue: string): Promise<ShopifyOnboardingLifecycle> {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated" || !resolution.session.activeOrganization) throw new Error("The requested resource is unavailable.");
  requirePermission(resolution.session, "connectors.view");

  const connectionId = encodeURIComponent(String(connectionIdValue || "").trim());
  const organizationId = encodeURIComponent(resolution.session.activeOrganization.id);
  const connections = await commercePersistenceRequest(
    `commerce_provider_connections?id=eq.${connectionId}&organization_id=eq.${organizationId}&provider=eq.shopify&select=id&limit=1`,
  ) as Row[];
  if (!connections[0]) throw new Error("The requested Shopify connection is unavailable.");

  const [schedules, runs] = await Promise.all([
    commercePersistenceRequest(
      `commerce_sync_schedules?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&resource=in.(${RESOURCES.join(",")})&select=resource,enabled,activation_state,last_enqueued_at,next_overlap_at`,
    ) as Promise<Row[]>,
    commercePersistenceRequest(
      `commerce_sync_runs?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&sync_type=in.(${[...RESOURCES.map((r) => `shopify_${r}`), ...RESOURCES.map((r) => `shopify_backfill_${r}`)].join(",")})&select=sync_type,status,records_seen,completed_at,started_at,metadata,created_at&order=created_at.desc&limit=60`,
    ) as Promise<Row[]>,
  ]);

  const resources = RESOURCES.map((resource): ShopifyOnboardingResourceStatus => {
    const schedule = schedules.find((row) => String(row.resource) === resource);
    const incremental = runs.find((row) => String(row.sync_type) === `shopify_${resource}`);
    const backfill = runs.find((row) => String(row.sync_type) === `shopify_backfill_${resource}`);
    const backfillCheckpoint = object(object(backfill?.metadata).shopify_checkpoint);
    const backfillComplete = String(backfill?.status || "") === "completed"
      && backfillCheckpoint.cursor == null
      && Number(backfillCheckpoint.page || 0) > 1;

    return {
      resource,
      scheduleReady: Boolean(schedule?.enabled) && String(schedule?.activation_state) === "enabled",
      incrementalStatus: normalizeRunStatus(incremental?.status),
      backfillStatus: backfillComplete ? "completed" : normalizeRunStatus(backfill?.status),
      backfillRecords: Number(backfill?.records_seen || 0),
      lastIncrementalAt: text(incremental?.completed_at || incremental?.started_at),
    };
  });

  const schedulesReady = resources.filter((item) => item.scheduleReady).length;
  const backfillsComplete = resources.filter((item) => item.backfillStatus === "completed").length;
  const liveResourcesHealthy = resources.filter((item) => item.incrementalStatus === "completed").length;
  const failed = resources.some((item) => item.incrementalStatus === "failed" || item.backfillStatus === "failed");

  if (failed) {
    return {
      state: "needs_attention",
      label: "Needs attention",
      detail: "Live Shopify sync remains prioritized. One onboarding task failed and will be retried on the next bounded scheduler cycle.",
      resources, schedulesReady, backfillsComplete, liveResourcesHealthy,
    };
  }
  if (schedulesReady < RESOURCES.length || liveResourcesHealthy < RESOURCES.length) {
    return {
      state: "setting_up",
      label: "Setting up",
      detail: "TraceKit is establishing continuous Shopify schedules and the first live checkpoints.",
      resources, schedulesReady, backfillsComplete, liveResourcesHealthy,
    };
  }
  if (backfillsComplete < RESOURCES.length) {
    return {
      state: "syncing_history",
      label: "Syncing history",
      detail: "Live Shopify data is already flowing while TraceKit imports pre-connection history in bounded resumable batches.",
      resources, schedulesReady, backfillsComplete, liveResourcesHealthy,
    };
  }
  return {
    state: "ready",
    label: "Ready",
    detail: "Live incremental sync is healthy and the historical Shopify range has completed for products, customers, and orders.",
    resources, schedulesReady, backfillsComplete, liveResourcesHealthy,
  };
}

function normalizeRunStatus(value: unknown): ShopifyOnboardingResourceStatus["incrementalStatus"] {
  const status = String(value || "");
  if (status === "completed" || status === "completed_with_warnings") return "completed";
  if (status === "failed") return "failed";
  if (status === "running" || status === "pending") return "running";
  return "pending";
}

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown) {
  const result = String(value || "").trim();
  return result || null;
}

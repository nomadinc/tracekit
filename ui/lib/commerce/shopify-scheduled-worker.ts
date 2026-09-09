import "server-only";

import { randomUUID } from "node:crypto";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "./credential-crypto";
import { parseShopifyConnectionCredential } from "./shopify-verifier";
import { runShopifyIncrementalResource } from "./shopify-incremental-runtime";
import { runShopifyHistoricalResource } from "./shopify-historical-runtime";
import { commercePersistenceRequest, SupabaseCommerceControlRepository } from "./supabase-control-repository";
import type { ShopifyResource } from "./shopify-core/resources";

const SHOPIFY_RESOURCES: ShopifyResource[] = ["products", "customers", "orders"];
const DEFAULT_FREQUENCY = "5_minutes";
const LEASE_SECONDS = 240;
const BACKFILL_PAGE_SIZE = 50;

type ConnectionRow = {
  id: string;
  account_id: string;
  organization_id: string;
  status: string;
};

type ProviderAccountRow = {
  id: string;
  connection_id: string;
  organization_id: string;
  status: string;
};

type ScheduleRow = {
  id: string;
  account_id: string;
  organization_id: string;
  connection_id: string;
  provider_account_id: string;
  resource: ShopifyResource;
  enabled: boolean;
  activation_state: string;
  sync_frequency: string;
  next_overlap_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
};

export async function runDueShopifySchedules(args: { limit?: number; now?: Date } = {}) {
  const now = args.now || new Date();
  const limit = boundedInteger(args.limit, 1, 20, 3);
  await ensureShopifySchedules(now);

  const due = await commercePersistenceRequest(
    `commerce_sync_schedules?resource=in.(${SHOPIFY_RESOURCES.join(",")})&enabled=eq.true&activation_state=eq.enabled&next_overlap_at=lte.${encodeURIComponent(now.toISOString())}&order=next_overlap_at.asc&limit=${limit}`,
  ) as unknown as ScheduleRow[];

  const outcomes: Array<Record<string, unknown>> = [];
  for (const schedule of due) outcomes.push(await runClaimedSchedule(schedule, now));
  return { scanned: due.length, outcomes };
}

async function ensureShopifySchedules(now: Date) {
  const connections = await commercePersistenceRequest(
    "commerce_provider_connections?provider=eq.shopify&status=in.(connected,degraded)&select=id,account_id,organization_id,status",
  ) as unknown as ConnectionRow[];

  for (const connection of connections) {
    const accounts = await commercePersistenceRequest(
      `commerce_provider_accounts?organization_id=eq.${encodeURIComponent(connection.organization_id)}&connection_id=eq.${encodeURIComponent(connection.id)}&status=eq.active&select=id,connection_id,organization_id,status&limit=1`,
    ) as unknown as ProviderAccountRow[];
    const providerAccount = accounts[0];
    if (!providerAccount) continue;

    for (const resource of SHOPIFY_RESOURCES) {
      await commercePersistenceRequest(
        "commerce_sync_schedules?on_conflict=connection_id,provider_account_id,resource",
        {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({
            account_id: connection.account_id,
            organization_id: connection.organization_id,
            connection_id: connection.id,
            provider_account_id: providerAccount.id,
            resource,
            enabled: true,
            activation_state: "enabled",
            sync_frequency: DEFAULT_FREQUENCY,
            overlap_interval: "00:05:00",
            next_overlap_at: now.toISOString(),
          }),
        },
      );
    }
  }
}

async function runClaimedSchedule(schedule: ScheduleRow, now: Date) {
  const owner = `shopify-scheduler:${randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
  const claimed = await commercePersistenceRequest(
    `commerce_sync_schedules?id=eq.${encodeURIComponent(schedule.id)}&enabled=eq.true&activation_state=eq.enabled&next_overlap_at=lte.${encodeURIComponent(now.toISOString())}&or=(lease_expires_at.is.null,lease_expires_at.lt.${encodeURIComponent(now.toISOString())})`,
    {
      method: "PATCH",
      body: JSON.stringify({
        lease_owner: owner,
        lease_expires_at: leaseExpiresAt,
        lease_heartbeat_at: now.toISOString(),
        last_enqueued_at: now.toISOString(),
        updated_at: now.toISOString(),
      }),
    },
  ) as unknown as ScheduleRow[];

  if (!claimed[0]) return { scheduleId: schedule.id, resource: schedule.resource, outcome: "not_claimed" };

  try {
    const repository = new SupabaseCommerceControlRepository();
    const credentialVersion = await repository.activeCredential(schedule.connection_id, schedule.organization_id);
    if (!credentialVersion?.encrypted || credentialVersion.revokedAt) throw new Error("Shopify scheduled credential is unavailable.");
    const key = decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY);
    const secret = await decryptCommerceCredential(credentialVersion.encrypted, key);
    const credential = parseShopifyConnectionCredential(secret);
    const connectionRows = await commercePersistenceRequest(
      `commerce_provider_connections?organization_id=eq.${encodeURIComponent(schedule.organization_id)}&id=eq.${encodeURIComponent(schedule.connection_id)}&select=created_at&limit=1`,
    );
    const historicalCutoff = String(connectionRows[0]?.created_at || "").trim();
    const initialUpdatedAt = historicalCutoff || undefined;

    const result = await runShopifyIncrementalResource({
      organizationId: schedule.organization_id,
      connectionId: schedule.connection_id,
      providerAccountId: schedule.provider_account_id,
      resource: schedule.resource,
      shopDomain: credential.shopDomain,
      accessToken: credential.adminAccessToken,
      apiVersion: credential.apiVersion,
      maxPages: 1,
      pageSize: 50,
      initialUpdatedAt,
    });

    // Historical work is deliberately subordinate to the live incremental path.
    // One bounded page is attempted per resource/cadence until the M7 cursor is exhausted.
    let backfill: Record<string, unknown> = { outcome: "not_started" };
    if (historicalCutoff) {
      try {
        const historical = await runShopifyHistoricalResource({
          organizationId: schedule.organization_id,
          connectionId: schedule.connection_id,
          providerAccountId: schedule.provider_account_id,
          resource: schedule.resource,
          historicalCutoff,
          shopDomain: credential.shopDomain,
          accessToken: credential.adminAccessToken,
          apiVersion: credential.apiVersion,
          maxPages: 1,
          pageSize: BACKFILL_PAGE_SIZE,
        });
        backfill = {
          outcome: historical.alreadyComplete ? "complete" : "progressed",
          pages: historical.pages,
          records: historical.records,
          checkpointPage: historical.checkpoint.page,
        };
      } catch (error) {
        // Backfill failure must never stop fresh orders/refunds from advancing.
        backfill = { outcome: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error" };
        console.error("shopify_onboarding_backfill_failed", {
          connectionId: schedule.connection_id,
          resource: schedule.resource,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await finishSchedule(schedule, owner, now, true);
    return { scheduleId: schedule.id, resource: schedule.resource, outcome: "completed", result, backfill };
  } catch (error) {
    await finishSchedule(schedule, owner, now, false);
    console.error("shopify_scheduled_sync_failed", {
      scheduleId: schedule.id,
      connectionId: schedule.connection_id,
      resource: schedule.resource,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      scheduleId: schedule.id,
      resource: schedule.resource,
      outcome: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
    };
  }
}

async function finishSchedule(schedule: ScheduleRow, owner: string, startedAt: Date, success: boolean) {
  const next = new Date(startedAt.getTime() + frequencyMilliseconds(schedule.sync_frequency));
  await commercePersistenceRequest(
    `commerce_sync_schedules?id=eq.${encodeURIComponent(schedule.id)}&lease_owner=eq.${encodeURIComponent(owner)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        lease_owner: null,
        lease_expires_at: null,
        lease_heartbeat_at: null,
        next_overlap_at: next.toISOString(),
        pause_reason_code: success ? null : "shopify_sync_failed",
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function frequencyMilliseconds(value: string) {
  if (value === "hourly") return 60 * 60 * 1000;
  if (value === "30_minutes") return 30 * 60 * 1000;
  if (value === "15_minutes") return 15 * 60 * 1000;
  return 5 * 60 * 1000;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

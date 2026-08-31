import { checkpointFromMetadata, checkpointMetadata, type CommerceRepositoryClient } from "./repository";
import type { ShopifyCheckpoint, ShopifyResource, ShopifySyncPage } from "./resources";

type Scope = { organizationId: string; connectionId: string; providerAccountId: string };

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
};

export function createShopifyCommerceRepositoryClient(config: SupabaseConfig): CommerceRepositoryClient {
  const request = createPostgrestRequest(config);

  return {
    async latestShopifyRun(args) {
      const rows = await request<Array<{ id: string; status: string }>>(
        `commerce_sync_runs?${scopeQuery(args)}&sync_type=eq.${encodeURIComponent(syncType(args.resource))}&select=id,status&order=created_at.desc&limit=1`,
      );
      return rows[0] || null;
    },

    async latestShopifyCheckpoint(args) {
      const rows = await request<Array<{ metadata?: Record<string, unknown>; state?: string }>>(
        `commerce_sync_checkpoints?${scopeQuery(args)}&sync_run_id=eq.${encodeURIComponent(args.syncRunId)}&resource=eq.${encodeURIComponent(args.resource)}&select=metadata,state&state=in.(completed,failed)&order=page.desc,created_at.desc&limit=1`,
      );
      return rows[0] || null;
    },

    async createShopifyRun(args) {
      const rows = await request<Array<{ id: string }>>("commerce_sync_runs?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: args.organizationId,
          connection_id: args.connectionId,
          provider_account_id: args.providerAccountId,
          sync_type: syncType(args.resource),
          mode: "shadow",
          status: "running",
          started_at: new Date().toISOString(),
          metadata: checkpointMetadata(args.checkpoint),
        }),
      });
      if (!rows[0]?.id) throw new Error("Shopify commerce sync run was not created.");
      return rows[0];
    },

    async appendShopifyCheckpoint(args) {
      const checkpoint = args.page.nextCheckpoint;
      const ids = args.page.nodes.map((node) => String(node.id || "").trim()).filter(Boolean);
      await request("commerce_sync_checkpoints", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          organization_id: args.organizationId,
          connection_id: args.connectionId,
          provider_account_id: args.providerAccountId,
          sync_run_id: args.syncRunId,
          resource: args.page.resource,
          page: Math.max(1, args.page.checkpoint.page),
          per_page: Math.max(1, args.page.nodes.length),
          first_source_id: ids[0] || null,
          last_source_id: ids.length ? ids[ids.length - 1] : null,
          completed_at: new Date().toISOString(),
          state: "completed",
          metadata: checkpointMetadata(checkpoint),
        }),
      });
    },

    async finishShopifyRun(args) {
      await patchRun(request, args, {
        status: "completed",
        completed_at: new Date().toISOString(),
        pages_completed: args.pagesCompleted,
        records_seen: args.recordsSeen,
        metadata: checkpointMetadata(args.checkpoint),
        last_error_code: null,
        last_error_summary: null,
      });
    },

    async failShopifyRun(args) {
      await patchRun(request, args, {
        status: "failed",
        completed_at: new Date().toISOString(),
        pages_completed: args.pagesCompleted,
        records_seen: args.recordsSeen,
        metadata: checkpointMetadata(args.checkpoint),
        last_error_code: "shopify_sync_failed",
        last_error_summary: String(args.error || "Shopify sync failed").slice(0, 1000),
      });
    },
  };
}

export function shopifyResumeCheckpoint(row: { metadata?: Record<string, unknown> } | null): ShopifyCheckpoint {
  return checkpointFromMetadata(row?.metadata);
}

function syncType(resource: ShopifyResource) {
  return `shopify_${resource}`;
}

function scopeQuery(scope: Scope) {
  return [
    `organization_id=eq.${encodeURIComponent(scope.organizationId)}`,
    `connection_id=eq.${encodeURIComponent(scope.connectionId)}`,
    `provider_account_id=eq.${encodeURIComponent(scope.providerAccountId)}`,
  ].join("&");
}

async function patchRun(
  request: ReturnType<typeof createPostgrestRequest>,
  args: Scope & { syncRunId: string; resource: ShopifyResource },
  body: Record<string, unknown>,
) {
  await request(`commerce_sync_runs?${scopeQuery(args)}&id=eq.${encodeURIComponent(args.syncRunId)}&sync_type=eq.${encodeURIComponent(syncType(args.resource))}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
}

function createPostgrestRequest(config: SupabaseConfig) {
  const baseUrl = String(config.url || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(config.serviceRoleKey || "").trim();
  if (!baseUrl || !serviceRoleKey) throw new Error("Shopify persistence requires Supabase URL and service-role credentials.");
  const fetchImpl = config.fetchImpl || fetch;

  return async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`Shopify commerce persistence failed (${response.status}): ${detail}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };
}

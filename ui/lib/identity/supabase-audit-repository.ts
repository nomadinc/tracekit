import "server-only";
import type { AuditHistoryRecord } from "./audit-history";
import { supabaseAuthHeaders } from "@/lib/commerce/supabase-auth";

type Row = Record<string, unknown>;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Audit history storage is unavailable.");
  return { url, key };
}

async function rest(path: string) {
  const { url, key } = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, { cache: "no-store", headers: supabaseAuthHeaders(key) });
  if (!response.ok) throw new Error(`Audit history storage failed (${response.status}).`);
  return response.json();
}

export class SupabaseAuditHistoryRepository {
  async listForOrganization(organizationId: string, limit: number, cursor: number) {
    return this.list(`organization_id=eq.${encodeURIComponent(organizationId)}`, limit, cursor);
  }

  async listForAccount(accountId: string, limit: number, cursor: number) {
    return this.list(`account_id=eq.${encodeURIComponent(accountId)}`, limit, cursor);
  }

  private async list(scope: string, limit: number, cursor: number) {
    const select = "id,occurred_at,action,result,actor_user_id,target_type,target_id,permission_evaluated,correlation_id,metadata";
    const rows = await rest(`tracekit_audit_events?${scope}&action=neq.membership.resolved&select=${select}&order=occurred_at.desc,id.desc&limit=${limit + 1}&offset=${cursor}`) as Row[];
    const page = rows.slice(0, limit);
    return { events: await this.withActors(page), nextCursor: rows.length > limit ? cursor + limit : null };
  }

  private async withActors(rows: Row[]): Promise<AuditHistoryRecord[]> {
    const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id).filter(Boolean).map(String)));
    const actors = new Map<string, { name: string; email: string }>();
    if (actorIds.length) {
      const userRows = await rest(`tracekit_users?id=in.(${encodeURIComponent(actorIds.join(","))})&select=id,display_name,primary_email`) as Row[];
      for (const row of userRows) actors.set(String(row.id), { name: String(row.display_name), email: String(row.primary_email) });
    }
    return rows.map((row) => {
      const actorUserId = row.actor_user_id ? String(row.actor_user_id) : null;
      const actor = actorUserId ? actors.get(actorUserId) : null;
      return {
        id: String(row.id), occurredAt: String(row.occurred_at), action: String(row.action),
        result: row.result as AuditHistoryRecord["result"], actorUserId,
        actorName: actor?.name || null, actorEmail: actor?.email || null,
        targetType: row.target_type ? String(row.target_type) : null,
        targetId: row.target_id ? String(row.target_id) : null,
        permissionEvaluated: row.permission_evaluated ? String(row.permission_evaluated) : null,
        correlationId: String(row.correlation_id),
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
      };
    });
  }
}

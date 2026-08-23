import type { AuditHistoryRecord } from "./audit-history";

type Row = Record<string, unknown>;

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Audit history storage is unavailable.");
  return { url, key };
}

async function rest(path: string) {
  const { url, key } = configuration();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${path}`, { cache: "no-store", headers });
  if (!response.ok) throw new Error(`Audit history storage failed (${response.status}).`);
  return response.json();
}

export class SupabaseAuditHistoryRepository {
  async listForOrganization(organizationId: string, limit = 100): Promise<AuditHistoryRecord[]> {
    const rows = await rest(`tracekit_audit_events?organization_id=eq.${encodeURIComponent(organizationId)}&action=neq.membership.resolved&select=id,occurred_at,action,result,actor_user_id,target_type,target_id,permission_evaluated,metadata&order=occurred_at.desc&limit=${Math.min(Math.max(limit, 1), 200)}`) as Row[];
    return this.withActors(rows);
  }

  async listForAccount(accountId: string, limit = 100): Promise<AuditHistoryRecord[]> {
    const rows = await rest(`tracekit_audit_events?account_id=eq.${encodeURIComponent(accountId)}&action=neq.membership.resolved&select=id,occurred_at,action,result,actor_user_id,target_type,target_id,permission_evaluated,metadata&order=occurred_at.desc&limit=${Math.min(Math.max(limit, 1), 200)}`) as Row[];
    return this.withActors(rows);
  }

  private async withActors(rows: Row[]): Promise<AuditHistoryRecord[]> {
    const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id).filter(Boolean).map(String)));
    const actors = new Map<string, { name: string; email: string }>();
    if (actorIds.length) {
      const actorList = encodeURIComponent(actorIds.join(","));
      const userRows = await rest(`tracekit_users?id=in.(${actorList})&select=id,display_name,primary_email`) as Row[];
      for (const row of userRows) actors.set(String(row.id), { name: String(row.display_name), email: String(row.primary_email) });
    }
    return rows.map((row) => {
      const actorId = row.actor_user_id ? String(row.actor_user_id) : null;
      const actor = actorId ? actors.get(actorId) : null;
      return {
        id: String(row.id),
        occurredAt: String(row.occurred_at),
        action: String(row.action),
        result: row.result as AuditHistoryRecord["result"],
        actorUserId: actorId,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        targetType: row.target_type ? String(row.target_type) : null,
        targetId: row.target_id ? String(row.target_id) : null,
        permissionEvaluated: row.permission_evaluated ? String(row.permission_evaluated) : null,
        metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
      };
    });
  }
}

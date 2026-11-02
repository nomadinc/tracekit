export const AUTHORIZATION_CONTRACT = "postgrest-exact-authorization-v1";
export const AUTHORIZATION_SOURCES = ["tracekit_users", "tracekit_memberships", "tracekit_roles", "tracekit_accounts", "tracekit_organizations", "tracekit_permission_overrides", "tracekit_business_context_access", "tracekit_business_contexts"] as const;
export type AuthorizationRead = { source: string; total: number; returned: number };
export function completeRead(read: AuthorizationRead) {
  return Number.isSafeInteger(read.total) && read.total >= 0 && read.total <= 50 && read.total === read.returned;
}
export function requireAuthorizationEvidence(value: unknown, scope: { subject: string; userId: string; organizationId: string; membershipId: string; membershipVersion: string }) {
  const e = value as { version?: unknown; contract?: unknown; scope?: Record<string, unknown>; reads?: AuthorizationRead[] } | null;
  if (!e || e.version !== 1 || e.contract !== AUTHORIZATION_CONTRACT || !e.scope
    || Object.entries(scope).some(([key, expected]) => e.scope![key] !== expected)
    || !Array.isArray(e.reads) || e.reads.length < 18 || e.reads.length > 116
    || e.reads.some(r => !r || !completeRead(r) || ![...AUTHORIZATION_SOURCES, "current_memberships"].includes(r.source as never))) throw new Error("incomplete_authorization");
  for (const source of AUTHORIZATION_SOURCES) {
    const reads = e.reads.filter(r => r.source === source);
    if (reads.length !== 2 || reads[0].total !== reads[1].total
      || source !== "tracekit_permission_overrides" && reads[0].total < 1
      || source === "tracekit_users" && reads[0].total !== 1) throw new Error("incomplete_authorization");
  }
  if (e.reads.filter(r => r.source === "current_memberships").length < 2
    || e.reads.some(r => r.source === "current_memberships" && r.total !== 1)) throw new Error("incomplete_authorization");
}

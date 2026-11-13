// Uses the established normalized-writer pattern: scoped provider-source conflict
// target plus a scope-qualified internal key. Raw provider IDs remain unchanged.
type Scope = { organizationId: string; accountId: string; connectionId: string; providerAccountId: string };
type Request = (path: string, init?: RequestInit) => Promise<Record<string,unknown>[]>;
export async function next29OrderWriteIdentity(request: Request, input: Scope, providerOrderId: string, canonicalOrderId: string) {
  const scope: Scope = {
    organizationId: input.organizationId,
    accountId: input.accountId,
    connectionId: input.connectionId,
    providerAccountId: input.providerAccountId,
  };
  if (Object.values(scope).some(x => typeof x !== "string" || !x) || typeof providerOrderId !== "string" || !providerOrderId || !canonicalOrderId) throw new Error("Order identity scope unavailable");
  const q = encodeURIComponent;
  const rows = await request(`platform_orders?organization_id=eq.${q(scope.organizationId)}&account_id=eq.${q(scope.accountId)}&connection_id=eq.${q(scope.connectionId)}&provider_account_id=eq.${q(scope.providerAccountId)}&provider_order_id=eq.${q(providerOrderId)}&select=platform,platform_order_id,canonical_order_id,organization_id,account_id,connection_id,provider_account_id,provider_order_id&limit=2`);
  if (rows.length > 1) throw new Error("Ambiguous scoped order identity");
  if (rows.length) {
    const row = rows[0];
    if (row.platform !== "next29" || row.canonical_order_id !== canonicalOrderId || row.provider_order_id !== providerOrderId || typeof row.platform_order_id !== "string" || !row.platform_order_id || Object.entries(scope).some(([key,value]) => row[({organizationId:'organization_id',accountId:'account_id',connectionId:'connection_id',providerAccountId:'provider_account_id'} as Record<string,string>)[key]] !== value)) throw new Error("Scoped order ownership conflict");
    return row.platform_order_id;
  }
  // No global compatibility lookup: foreign order evidence is never read.
  // A legacy inconsistent unique-key conflict is rejected by PostgreSQL, never merged.
  return `next29:${scope.organizationId}:${scope.connectionId}:${scope.providerAccountId}:${encodeURIComponent(providerOrderId)}`;
}

import { requireResourceScope } from "./authorization-gateway";
import { TENANT_HINT_KEYS } from "./operational-tenant-boundary";
import type { TraceKitSessionContext } from "./persistent-types";

export function authorizedDetailedFinancialOrganization(session: TraceKitSessionContext, requestUrl: string): string | null {
  const id = session.activeOrganization?.id;
  if (!id) return null;
  try {
    requireResourceScope(session, id, "financials.view");
    requireResourceScope(session, id, "orders.view_financials");
    const params = new URL(requestUrl).searchParams;
    if (TENANT_HINT_KEYS.some(key => params.getAll(key).some(value => value !== id))) return null;
    return id;
  } catch { return null; }
}

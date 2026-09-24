import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { mcpCustomerRepository } from "./customer-repository";
import { productionOrderRepository } from "@/lib/orders/production-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { TraceKitMcpReadService } from "./read-service";

export function createTraceKitMcpReadService(session:TraceKitSessionContext) {
  return new TraceKitMcpReadService(session,{
    customers:mcpCustomerRepository,
    orders:productionOrderRepository,
    audit:new SupabaseIdentityTenancyRepository(),
  });
}

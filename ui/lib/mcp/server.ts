import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { productionCustomerRepository } from "@/lib/customers/production-repository";
import { productionOrderRepository } from "@/lib/orders/production-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { TraceKitMcpReadService } from "./read-service";

export function createTraceKitMcpReadService(session:TraceKitSessionContext) {
  return new TraceKitMcpReadService(session,{
    customers:productionCustomerRepository,
    orders:productionOrderRepository,
    audit:new SupabaseIdentityTenancyRepository(),
  });
}

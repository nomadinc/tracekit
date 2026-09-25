import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { mcpCustomerRepository } from "./customer-repository";
import { mcpOrderRepository } from "./order-repository";
import { mcpJourneyRepository } from "./journey-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { TraceKitMcpReadService } from "./read-service";

export function createTraceKitMcpReadService(session:TraceKitSessionContext) {
  return new TraceKitMcpReadService(session,{
    customers:mcpCustomerRepository,
    orders:mcpOrderRepository,
    journey:mcpJourneyRepository,
    audit:new SupabaseIdentityTenancyRepository(),
  });
}

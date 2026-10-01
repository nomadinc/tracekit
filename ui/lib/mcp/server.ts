import { SupabaseIdentityTenancyRepository } from "@/lib/identity/supabase-identity-repository";
import { mcpCustomerRepository } from "./customer-repository";
import { mcpOrderRepository } from "./order-repository";
import { mcpJourneyRepository } from "./journey-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { TraceKitMcpReadService } from "./read-service";
import { TraceKitMcpActionService } from "./action-service";

export function createTraceKitMcpReadService(session:TraceKitSessionContext,runtimeContext:{appOrigin?:string}={}) {
  return new TraceKitMcpReadService(session,{
    customers:mcpCustomerRepository,
    orders:mcpOrderRepository,
    journey:mcpJourneyRepository,
    audit:new SupabaseIdentityTenancyRepository(),
  },runtimeContext);
}

export function createTraceKitMcpServices(session:TraceKitSessionContext,runtimeContext:{appOrigin?:string}={}){return{read:createTraceKitMcpReadService(session,runtimeContext),action:new TraceKitMcpActionService(session,runtimeContext)};}

import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import type { IdentityTenancyRepository } from "@/lib/identity/persistent-repository";
import { productionCustomerRepository } from "@/lib/customers/production-repository";
import { productionOrderRepository } from "@/lib/orders/production-repository";
import { authorizeMcpRead, projectCustomerSummary, projectCustomerWorkspace, projectOrderSummary, projectOrderWorkspace } from "./governed-read-service";
import { recordMcpToolAudit } from "./audit";

export type McpReadRepositories = {
  customers: Pick<typeof productionCustomerRepository, "listCustomers" | "loadWorkspace" | "search">;
  orders: Pick<typeof productionOrderRepository, "listOrders" | "loadWorkspace" | "search">;
  audit: Pick<IdentityTenancyRepository, "recordAuditEvent">;
};

export class TraceKitMcpReadService {
  constructor(
    private readonly session: TraceKitSessionContext,
    private readonly repositories: McpReadRepositories,
  ) {}

  private async audited<T>(tool:string, permission:any, targetType:string|null, targetId:string|null, run:()=>Promise<T>):Promise<T> {
    try {
      const value=await run();
      await recordMcpToolAudit({repository:this.repositories.audit,session:this.session,tool,result:"success",permission,targetType,targetId});
      return value;
    } catch (error:any) {
      const denied=String(error?.code||error?.message||"").includes("access_denied") || String(error?.message||"").includes("unavailable");
      await recordMcpToolAudit({repository:this.repositories.audit,session:this.session,tool,result:denied?"denied":"failure",permission,targetType,targetId:null});
      throw error;
    }
  }

  listCustomers(input:{query?:string;limit?:number}={}) {
    return this.audited("list_customers","customers.view",null,null,async()=>{
      const scope=authorizeMcpRead(this.session,"customers.view");
      const limit=Math.max(1,Math.min(50,Math.trunc(input.limit||25)));
      const rows=await this.repositories.customers.listCustomers(scope,{query:input.query});
      return rows.slice(0,limit).map(row=>projectCustomerSummary(this.session,row));
    });
  }

  getCustomer(customerId:string) {
    return this.audited("get_customer","customers.view","customer",customerId,async()=>{
      const scope=authorizeMcpRead(this.session,"customers.view");
      const value=await this.repositories.customers.loadWorkspace(scope,customerId);
      return value ? projectCustomerWorkspace(this.session,value) : null;
    });
  }

  listOrders(input:{query?:string;customerId?:string;offerId?:string;limit?:number}={}) {
    return this.audited("list_orders","orders.view",null,null,async()=>{
      const scope=authorizeMcpRead(this.session,"orders.view");
      const limit=Math.max(1,Math.min(50,Math.trunc(input.limit||25)));
      const rows=await this.repositories.orders.listOrders(scope,{query:input.query,customerId:input.customerId,offerId:input.offerId});
      return rows.slice(0,limit).map(row=>projectOrderSummary(this.session,row));
    });
  }

  getOrder(orderId:string) {
    return this.audited("get_order","orders.view","order",orderId,async()=>{
      const scope=authorizeMcpRead(this.session,"orders.view");
      const value=await this.repositories.orders.loadWorkspace(scope,orderId);
      return value ? projectOrderWorkspace(this.session,value) : null;
    });
  }

  search(query:string,input:{limit?:number}={}) {
    return this.audited("search","organizations.view",null,null,async()=>{
      if (!query.trim()) return [];
      const limit=Math.max(1,Math.min(25,Math.trunc(input.limit||12)));
      const results:any[]=[];
      if(this.session.effectivePermissions.includes("customers.view")){
        const scope=authorizeMcpRead(this.session,"customers.view");
        const rows=await this.repositories.customers.search(scope,query);
        results.push(...rows.map(row=>({type:"customer",id:row.value,title:row.title,subtitle:row.subtitle})));
      }
      if(this.session.effectivePermissions.includes("orders.view")){
        const scope=authorizeMcpRead(this.session,"orders.view");
        const rows=await this.repositories.orders.search(scope,query);
        results.push(...rows.map(row=>({type:"order",id:row.value,title:row.title,subtitle:row.subtitle})));
      }
      return results.slice(0,limit);
    });
  }
}

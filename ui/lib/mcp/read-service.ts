import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import type { IdentityTenancyRepository } from "@/lib/identity/persistent-repository";
import type { CustomerRepository } from "@/lib/customers/repository";
import type { CustomerSearchResult, CustomerSummary, CustomerWorkspaceSnapshot, ProductionCustomerScope } from "@/lib/customers/types";
import type { OrderRepository } from "@/lib/orders/repository";
import type { OrderSearchResult, OrderSummary, OrderWorkspaceSnapshot } from "@/lib/orders/types";
import { productionCustomerRepository } from "@/lib/customers/production-repository";
import { productionOrderRepository } from "@/lib/orders/production-repository";
import { authorizeMcpRead, projectCustomerSummary, projectCustomerWorkspace, projectOrderSummary, projectOrderWorkspace } from "./governed-read-service";
import { recordMcpToolAudit } from "./audit";
import type { JourneyIntelligence, CrossJourneyAnalysis } from "./journey-repository";

type McpCustomerRepository = Pick<
  CustomerRepository<ProductionCustomerScope>,
  "listCustomers" | "loadWorkspace" | "search"
>;

type ProductionOrderScope = Parameters<typeof productionOrderRepository.listOrders>[0];

type McpOrderRepository = {
  listOrders(scope: ProductionOrderScope, filter?: Parameters<OrderRepository["listOrders"]>[1]): Promise<OrderSummary[]>;
  loadWorkspace(scope: ProductionOrderScope, id: string): Promise<OrderWorkspaceSnapshot | null>;
  search(scope: ProductionOrderScope, query: string): Promise<OrderSearchResult[]>;
};

export type McpReadRepositories = {
  customers: McpCustomerRepository;
  orders: McpOrderRepository;
  journey: { explain(scope: ProductionCustomerScope, customerId: string, journeyId?: string): Promise<JourneyIntelligence | null>; analyze(scope: ProductionCustomerScope, limit?: number): Promise<CrossJourneyAnalysis> };
  audit: Pick<IdentityTenancyRepository, "recordAuditEvent">;
};

export class TraceKitMcpReadService {
  constructor(
    private readonly session: TraceKitSessionContext,
    private readonly repositories: McpReadRepositories,
  ) {}

  private async audited<T>(
    tool: string,
    permission: Parameters<typeof recordMcpToolAudit>[0]["permission"],
    targetType: string | null,
    targetId: string | null,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const value = await run();
      await recordMcpToolAudit({
        repository: this.repositories.audit,
        session: this.session,
        tool,
        result: "success",
        permission,
        targetType,
        targetId,
      });
      return value;
    } catch (error: unknown) {
      const record = error as { code?: unknown; message?: unknown } | null;
      const denied =
        String(record?.code || record?.message || "").includes("access_denied") ||
        String(record?.message || "").includes("unavailable");
      await recordMcpToolAudit({
        repository: this.repositories.audit,
        session: this.session,
        tool,
        result: denied ? "denied" : "failure",
        permission,
        targetType,
        targetId: null,
      });
      throw error;
    }
  }

  listCustomers(input: { query?: string; limit?: number } = {}) {
    return this.audited("list_customers", "customers.view", null, null, async () => {
      const scope = authorizeMcpRead(this.session, "customers.view") as ProductionCustomerScope;
      const limit = Math.max(1, Math.min(50, Math.trunc(input.limit || 25)));
      const rows: CustomerSummary[] = await this.repositories.customers.listCustomers(scope, { query: input.query });
      return rows.slice(0, limit).map((row: CustomerSummary) => projectCustomerSummary(this.session, row));
    });
  }

  getCustomer(customerId: string) {
    return this.audited("get_customer", "customers.view", "customer", customerId, async () => {
      const scope = authorizeMcpRead(this.session, "customers.view") as ProductionCustomerScope;
      const value: CustomerWorkspaceSnapshot | null = await this.repositories.customers.loadWorkspace(scope, customerId);
      return value ? projectCustomerWorkspace(this.session, value) : null;
    });
  }

  analyzeJourneys(input:{limit?:number}={}) {
    return this.audited("analyze_journeys", "customers.view", null, null, async () => {
      const scope=authorizeMcpRead(this.session,"customers.view") as ProductionCustomerScope;
      const limit=Math.max(1,Math.min(50,Math.trunc(input.limit||25)));
      return this.repositories.journey.analyze(scope,limit);
    });
  }

  explainJourney(customerId: string, journeyId?: string) {
    return this.audited("explain_journey", "customers.view", "customer", customerId, async () => {
      const scope = authorizeMcpRead(this.session, "customers.view") as ProductionCustomerScope;
      return this.repositories.journey.explain(scope, customerId, journeyId);
    });
  }

  listOrders(input: { query?: string; customerId?: string; offerId?: string; limit?: number } = {}) {
    return this.audited("list_orders", "orders.view", null, null, async () => {
      const scope = authorizeMcpRead(this.session, "orders.view") as ProductionOrderScope;
      const limit = Math.max(1, Math.min(50, Math.trunc(input.limit || 25)));
      const rows: OrderSummary[] = await this.repositories.orders.listOrders(scope, {
        query: input.query,
        customerId: input.customerId,
        offerId: input.offerId,
      });
      return rows.slice(0, limit).map((row: OrderSummary) => projectOrderSummary(this.session, row));
    });
  }

  getOrder(orderId: string) {
    return this.audited("get_order", "orders.view", "order", orderId, async () => {
      const scope = authorizeMcpRead(this.session, "orders.view") as ProductionOrderScope;
      const value: OrderWorkspaceSnapshot | null = await this.repositories.orders.loadWorkspace(scope, orderId);
      return value ? projectOrderWorkspace(this.session, value) : null;
    });
  }

  search(query: string, input: { limit?: number } = {}) {
    return this.audited("search", "organizations.view", null, null, async () => {
      if (!query.trim()) return [];
      const limit = Math.max(1, Math.min(25, Math.trunc(input.limit || 12)));
      const results: Array<{ type: "customer" | "order"; id: string; title: string; subtitle: string }> = [];

      if (this.session.effectivePermissions.includes("customers.view")) {
        const scope = authorizeMcpRead(this.session, "customers.view") as ProductionCustomerScope;
        const rows: CustomerSearchResult[] = await this.repositories.customers.search(scope, query);
        results.push(...rows.map((row: CustomerSearchResult) => ({
          type: "customer" as const,
          id: row.value,
          title: row.title,
          subtitle: row.subtitle,
        })));
      }

      if (this.session.effectivePermissions.includes("orders.view")) {
        const scope = authorizeMcpRead(this.session, "orders.view") as ProductionOrderScope;
        const rows: OrderSearchResult[] = await this.repositories.orders.search(scope, query);
        results.push(...rows.map((row: OrderSearchResult) => ({
          type: "order" as const,
          id: row.value,
          title: row.title,
          subtitle: row.subtitle,
        })));
      }

      return results.slice(0, limit);
    });
  }
}

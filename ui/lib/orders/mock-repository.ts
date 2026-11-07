import type { OrderRepository } from "./repository";
import type { OrderScope, OrderListFilter, OrderSummary, OrderWorkspaceSnapshot, OrderTimelineEvent, OrderDrawerRecord, OrderSearchResult, OrderDeepLinkState, ProcessorFeeAnalysis } from "./types";
import { mockRepositoryScopeAllows } from "../identity/mock-repository-scope";
import { normalizeOrderDeepLink } from "./deep-link";

export function calculateProcessorFee(
  processor: string,
  rate: number,
  fixed: number,
  captures: Array<{ id: string; amount: number }>,
  observed: number,
  settlementStatus = "Settled",
): ProcessorFeeAnalysis {
  const rows = captures.map((c) => {
    const expectedFee = +((c.amount * rate) / 100 + fixed).toFixed(2);
    return {
      ...c,
      expectedFee,
      formula: `$${c.amount.toFixed(2)} × ${rate.toFixed(2)}% + $${fixed.toFixed(2)}`,
    };
  });
  const expectedFee = +rows.reduce((n, c) => n + c.expectedFee, 0).toFixed(2);
  return {
    processor,
    pricingRule: `${rate.toFixed(2)}% + $${fixed.toFixed(2)} per transaction`,
    percentageRate: rate,
    fixedFee: fixed,
    currency: "USD",
    captures: rows,
    expectedFee,
    observedFee: observed,
    variance: +(observed - expectedFee).toFixed(2),
    settlementStatus,
  };
}
// No built-in customer, order, capture or financial examples are retained.
export class MockOrderRepository implements OrderRepository {
  async listOrders(scope: OrderScope, _filter: OrderListFilter = {}): Promise<OrderSummary[]> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return [];
    return [];
  }
  async resolveOrder(scope: OrderScope, _id: string): Promise<{ organizationId: string; businessContextId: string; orderId: string } | null> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return null;
    return null;
  }
  async loadWorkspace(scope: OrderScope, _id: string): Promise<OrderWorkspaceSnapshot | null> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return null;
    return null;
  }
  async loadTimeline(scope: OrderScope, _id: string): Promise<OrderTimelineEvent[]> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return [];
    return [];
  }
  async loadDrawer(scope: OrderScope, _id: string, _drawerId: string): Promise<OrderDrawerRecord | null> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return null;
    return null;
  }
  async search(scope: OrderScope, _query: string): Promise<OrderSearchResult[]> {
    if (!mockRepositoryScopeAllows(scope, "orders.view")) return [];
    return [];
  }
  async resolveDeepLink(scope: OrderScope, state: OrderDeepLinkState): Promise<OrderDeepLinkState> {
    return normalizeOrderDeepLink(state, await this.listOrders(scope), null);
  }
}
export const orderRepository: OrderRepository = new MockOrderRepository();

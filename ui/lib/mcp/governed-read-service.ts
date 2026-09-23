import { canAccessFinancialData, canAccessSensitiveCustomerData, requireResourceScope } from "@/lib/identity/authorization-gateway";
import type { Permission } from "@/lib/identity/permissions";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import type { CustomerSummary, CustomerWorkspaceSnapshot } from "@/lib/customers/types";
import type { OrderSummary, OrderWorkspaceSnapshot } from "@/lib/orders/types";

export type McpReadScope = {
  authenticated: true;
  workspaceId: string;
  organizationId: string;
  businessContextId: string | null;
  session: any;
};

export function authorizeMcpRead(
  session: TraceKitSessionContext,
  permission: Permission,
  organizationId?: string | null,
): McpReadScope {
  const requested = organizationId || session.activeOrganization?.id;
  if (!requested) throw new Error("access_denied");
  requireResourceScope(session, requested, permission);
  return {
    authenticated: true,
    workspaceId: requested,
    organizationId: requested,
    businessContextId: session.activeBusinessContextId,
    session: {
      authenticated: true,
      developmentOnly: false,
      identity: {
        id: session.user.id,
        name: session.user.displayName,
        email: session.user.primaryEmail,
        title: session.role,
        membership: {
          id: session.membership.id,
          accountId: session.activeAccount.id,
          accountName: session.activeAccount.name,
          accountType: session.activeAccount.accountType,
          role: session.role,
          organizationIds: session.availableOrganizations.map((item) => item.id),
        },
      },
      activeOrganizationId: requested,
      activeBusinessContextId: session.activeBusinessContextId,
    },
  };
}

function mask(value: string) {
  if (!value) return "";
  return "••••";
}

export function projectCustomerSummary(session: TraceKitSessionContext, input: CustomerSummary): CustomerSummary {
  if (canAccessSensitiveCustomerData(session)) return structuredClone(input);
  return { ...structuredClone(input), name: input.name || "Customer", email: mask(input.email), phone: mask(input.phone), sensitiveMasked: true };
}

export function projectCustomerWorkspace(session: TraceKitSessionContext, input: CustomerWorkspaceSnapshot): CustomerWorkspaceSnapshot {
  const output = structuredClone(input);
  output.customer = projectCustomerSummary(session, output.customer);
  if (!canAccessFinancialData(session)) {
    output.lifetimeRevenue = 0;
    output.orders = output.orders.map((order) => ({ ...order, amount: 0, profit: null, profitAvailable: false }));
  }
  return output;
}

export function projectOrderSummary(session: TraceKitSessionContext, input: OrderSummary): OrderSummary {
  const output = structuredClone(input);
  if (!canAccessSensitiveCustomerData(session)) {
    output.customerEmail = mask(output.customerEmail);
    output.customerPhone = mask(output.customerPhone);
    output.sensitiveMasked = true;
  }
  if (!session.effectivePermissions.includes("orders.view_financials") || !canAccessFinancialData(session)) {
    output.revenue = 0;
    output.profit = null;
  }
  return output;
}

export function projectOrderWorkspace(session: TraceKitSessionContext, input: OrderWorkspaceSnapshot): OrderWorkspaceSnapshot {
  const output = structuredClone(input);
  output.order = projectOrderSummary(session, output.order);
  if (!session.effectivePermissions.includes("orders.view_financials") || !canAccessFinancialData(session)) {
    output.ledger = [];
    output.shipping = { charged: 0, actual: 0, packaging: 0, margin: 0 };
    output.processorFee = { ...output.processorFee, captures: [], expectedFee: 0, observedFee: 0, variance: 0 };
  }
  return output;
}

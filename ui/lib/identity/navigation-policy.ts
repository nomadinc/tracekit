import type { Permission } from "./permissions";
import type { ShellVariant } from "./types";

export type NavigationPolicyItem = {
  label: string;
  href: string;
  permission?: Permission | readonly Permission[];
};

export const NAVIGATION_POLICY: Record<ShellVariant, NavigationPolicyItem[]> = {
  client: [
    { label: "Mission Control", href: "/", permission: "organizations.view" },
    { label: "Investigations", href: "/investigations", permission: "admin.manage_feature_access" },
    { label: "Offers", href: "/offers", permission: "offers.view" },
    { label: "Customers", href: "/customers", permission: "customers.view" },
    { label: "Orders", href: "/orders", permission: "orders.view" },
    { label: "Money", href: "/money", permission: "financials.view" },
    { label: "Operations", href: "/operations", permission: ["imports.view", "connectors.view"] },
    { label: "Connections", href: "/connections", permission: "connectors.view" },
  ],
  agency: [
    { label: "Mission Control", href: "/", permission: "organizations.view" },
    { label: "Clients", href: "/clients", permission: "organizations.view" },
    { label: "Offers", href: "/offers", permission: "offers.view" },
    { label: "Customers", href: "/customers", permission: "customers.view" },
    { label: "Orders", href: "/orders", permission: "orders.view" },
    { label: "Reports", href: "/reports", permission: "financials.view" },
    { label: "Team", href: "/team", permission: "users.view" },
    { label: "Branding", href: "/branding", permission: "branding.view" },
    { label: "Connections", href: "/connections", permission: "connectors.view" },
  ],
  "product-admin": [
    { label: "Investigations", href: "/investigations", permission: "admin.manage_feature_access" },
    { label: "Organizations", href: "/platform/organizations", permission: "admin.manage_tenants" },
    { label: "Agencies", href: "/platform/agencies", permission: "admin.manage_tenants" },
    { label: "Users", href: "/platform/users", permission: "users.view" },
    { label: "Connectors", href: "/platform/connectors", permission: "connectors.view" },
    { label: "Imports", href: "/platform/imports", permission: "imports.view" },
    { label: "System Health", href: "/platform/system-health", permission: "audit_logs.view" },
    { label: "Billing", href: "/platform/billing", permission: "billing.view" },
    { label: "Audit Logs", href: "/platform/audit-logs", permission: "audit_logs.view" },
    { label: "Feature Access", href: "/platform/feature-access", permission: "admin.manage_feature_access" },
    { label: "Support", href: "/platform/support", permission: "admin.manage_tenants" },
  ],
};

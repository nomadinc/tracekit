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
    { label: "Offers", href: "/offers", permission: "offers.view" },
    { label: "Customers", href: "/customers", permission: "customers.view" },
    { label: "Orders", href: "/orders", permission: "orders.view" },
    { label: "Money", href: "/money", permission: "financials.view" },
    { label: "Connections", href: "/connections", permission: "connectors.view" },
    { label: "Notifications", href: "/notifications", permission: "organizations.view" },
    { label: "Activity", href: "/activity", permission: "audit_logs.view" },
  ],
  agency: [
    { label: "Mission Control", href: "/", permission: "organizations.view" },
    { label: "Clients", href: "/clients", permission: "organizations.view" },
    { label: "Offers", href: "/offers", permission: "offers.view" },
    { label: "Customers", href: "/customers", permission: "customers.view" },
    { label: "Orders", href: "/orders", permission: "orders.view" },
    { label: "Money", href: "/money", permission: "financials.view" },
    { label: "Connections", href: "/connections", permission: "connectors.view" },
    { label: "Notifications", href: "/notifications", permission: "organizations.view" },
    { label: "Activity", href: "/activity", permission: "audit_logs.view" },
  ],
  "product-admin": [
    { label: "Control Center", href: "/platform", permission: "admin.manage_tenants" },
    { label: "Clients", href: "/platform/clients", permission: "admin.manage_tenants" },
    { label: "Users", href: "/platform/users", permission: ["admin.manage_tenants", "users.view"] },
    { label: "Connections", href: "/platform/connectors", permission: ["admin.manage_tenants", "connectors.view"] },
    { label: "Investigations", href: "/investigations", permission: "admin.manage_feature_access" },
  ],
};

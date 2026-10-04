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
    { label: "Activity", href: "/activity", permission: "audit_logs.view" },
  ],
  "product-admin": [
    { label: "Control Center", href: "/platform", permission: "admin.manage_tenants" },
    { label: "Investigations", href: "/investigations", permission: "admin.manage_feature_access" },
  ],
};

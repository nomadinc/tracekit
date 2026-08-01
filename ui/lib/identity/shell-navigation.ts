import { Activity, Building2, ClipboardList, ContactRound, CreditCard, FileClock, Flag, HeartPulse, Home, Import, Landmark, Megaphone, Package, Plug, Settings, ShieldCheck, ShoppingBag, Tags, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "./permissions";
import type { ShellVariant } from "./types";
import type { Identity } from "./types";
import { satisfiesPermissionRequirement, shellVariant } from "./authorization";

export type ShellNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission | readonly Permission[];
};

export const SHELL_NAVIGATION: Record<ShellVariant, ShellNavigationItem[]> = {
  client: [
    { label: "Mission Control", href: "/", icon: Home, permission: "organizations.view" },
    { label: "Offers", href: "/offers", icon: Megaphone, permission: "offers.view" },
    { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
    { label: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders.view" },
    { label: "Money", href: "/money", icon: Landmark, permission: "financials.view" },
    { label: "Operations", href: "/operations", icon: ClipboardList, permission: ["imports.view", "connectors.view"] },
    { label: "Settings", href: "/settings", icon: Settings, permission: "organizations.manage" },
  ],
  agency: [
    { label: "Mission Control", href: "/", icon: Home, permission: "organizations.view" },
    { label: "Clients", href: "/clients", icon: Building2, permission: "organizations.view" },
    { label: "Offers", href: "/offers", icon: Megaphone, permission: "offers.view" },
    { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
    { label: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders.view" },
    { label: "Reports", href: "/reports", icon: Activity, permission: "financials.view" },
    { label: "Team", href: "/team", icon: ContactRound, permission: "users.view" },
    { label: "Branding", href: "/branding", icon: Tags, permission: "branding.view" },
    { label: "Settings", href: "/settings", icon: Settings, permission: "organizations.manage" },
  ],
  "product-admin": [
    { label: "Organizations", href: "/platform/organizations", icon: Building2, permission: "admin.manage_tenants" },
    { label: "Agencies", href: "/platform/agencies", icon: ShieldCheck, permission: "admin.manage_tenants" },
    { label: "Users", href: "/platform/users", icon: Users, permission: "users.view" },
    { label: "Connectors", href: "/platform/connectors", icon: Plug, permission: "connectors.view" },
    { label: "Imports", href: "/platform/imports", icon: Import, permission: "imports.view" },
    { label: "System Health", href: "/platform/system-health", icon: HeartPulse, permission: "audit_logs.view" },
    { label: "Billing", href: "/platform/billing", icon: CreditCard, permission: "billing.view" },
    { label: "Audit Logs", href: "/platform/audit-logs", icon: FileClock, permission: "audit_logs.view" },
    { label: "Feature Access", href: "/platform/feature-access", icon: Flag, permission: "admin.manage_feature_access" },
    { label: "Support", href: "/platform/support", icon: Package, permission: "admin.manage_tenants" },
  ],
};

export function navigationForIdentity(identity: Identity) {
  return SHELL_NAVIGATION[shellVariant(identity)].filter((item) => !item.permission || satisfiesPermissionRequirement(identity, item.permission));
}

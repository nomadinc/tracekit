import {
  CircleDollarSign,
  ClipboardList,
  Home,
  Megaphone,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AppNavigationItem = {
  href: string;
  label: string;
  description: string;
};

export type AppNavigationGroup = {
  label: string;
  href?: string;
  icon: LucideIcon;
  description: string;
  items?: AppNavigationItem[];
};

export const APP_NAVIGATION: AppNavigationGroup[] = [
  {
    label: "Home",
    href: "/",
    icon: Home,
    description: "Your marketing command center.",
  },
  {
    label: "Customers",
    icon: Users,
    description: "Understand customer behavior from first visit to purchase.",
    items: [
      { href: "/journeys", label: "Customer Journeys", description: "Explore how people move from visit to conversion." },
      { href: "/events", label: "Events", description: "Inspect browser and server events." },
      { href: "/customers", label: "Customer Profiles", description: "Review known customers and identities." },
    ],
  },
  {
    label: "Marketing",
    icon: Megaphone,
    description: "See which channels and campaigns are creating revenue.",
    items: [
      { href: "/journeys", label: "Attribution", description: "Review credited touchpoints and models." },
      { href: "/reports", label: "Campaigns", description: "Campaign reporting appears as data accumulates." },
      { href: "/reports", label: "Sources", description: "Compare source-level performance." },
    ],
  },
  {
    label: "Revenue",
    icon: CircleDollarSign,
    description: "Review commissions, payouts, and revenue quality.",
    items: [
      { href: "/reports", label: "Commissions", description: "Review generated commission records." },
      { href: "/reports", label: "Payouts", description: "Prepare payable commission workflows." },
      { href: "/dashboard/financial-import-monitor", label: "Financial Imports", description: "Monitor import health for payment, refund, and chargeback connectors." },
      { href: "/dashboard/financial-reconciliation", label: "Financial Health", description: "Review trust, impact, and attention items across financial ledger events." },
      { href: "/orders", label: "Orders", description: "Audit commerce and financial records." },
    ],
  },
  {
    label: "Operations",
    href: "/operations",
    icon: ClipboardList,
    description: "Manage actionable Work Items across Health, identity, attribution, commissions, and integrations.",
  },
  {
    label: "Settings",
    icon: Settings,
    description: "Workspace and operational configuration.",
    items: [
      { href: "/settings/integrations", label: "Integrations", description: "Connect commerce, tracking, and payment systems." },
      { href: "/setup", label: "Setup", description: "Finish workspace onboarding." },
      { href: "/settings", label: "Workspace Settings", description: "Manage workspace preferences." },
      { href: "/settings/product-costs", label: "Product Costs", description: "Maintain cost inputs for profit reporting." },
    ],
  },
];

export const SECONDARY_NAVIGATION: AppNavigationItem[] = [
  { href: "/dashboard", label: "Legacy Dashboard", description: "Existing KPI dashboard." },
  { href: "/notifications", label: "Notifications", description: "Operational inbox powered by workspace health." },
  { href: "/scrubber", label: "Scrubber", description: "Operational cleanup tools." },
  { href: "/settings/integrations/gateway-wizard", label: "Gateway Wizard", description: "Payment gateway setup." },
];

export const GLOBAL_SEARCH_PLACEHOLDER = "Search customers, orders, Work Items, and pages...";

export const WORKSPACE_SUMMARY = {
  name: "Default Workspace",
  website: "Primary website",
  environment: "Production",
};

export function pageChromeForPath(pathname: string | null | undefined) {
  const path = String(pathname || "/");
  const candidates: Array<AppNavigationItem & { group?: string }> = [];
  for (const group of APP_NAVIGATION) {
    if (group.href) {
      candidates.push({ href: group.href, label: group.label, description: group.description, group: group.label });
    }
    for (const item of group.items || []) {
      candidates.push({ ...item, group: group.label });
    }
  }
  candidates.push(...SECONDARY_NAVIGATION.map((item) => ({ ...item, group: "Tools" })));

  const exact = candidates.find((item) => item.href === path);
  if (exact) return { title: exact.label, description: exact.description, group: exact.group || exact.label };

  const prefix = [...candidates]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => path.startsWith(`${item.href}/`));

  if (prefix) return { title: prefix.label, description: prefix.description, group: prefix.group || prefix.label };
  return { title: "Home", description: "Your marketing command center.", group: "Home" };
}

export type AppBreadcrumb = {
  label: string;
  href?: string;
};

export function breadcrumbsForPath(pathname: string | null | undefined): AppBreadcrumb[] {
  const path = String(pathname || "/");
  if (path === "/") return [];

  if (path.startsWith("/customers/")) {
    return [
      { label: "Customers", href: "/customers" },
      { label: "Customer" },
    ];
  }
  if (path.startsWith("/journeys/")) {
    return [
      { label: "Customers", href: "/customers" },
      { label: "Customer Journeys", href: "/journeys" },
      { label: "Journey" },
    ];
  }
  if (path.startsWith("/orders/")) {
    return [
      { label: "Revenue", href: "/reports" },
      { label: "Orders", href: "/orders" },
      { label: "Order" },
    ];
  }
  if (path.startsWith("/settings/integrations/")) {
    return [
      { label: "Settings", href: "/settings" },
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Integration" },
    ];
  }
  if (path.startsWith("/operations")) {
    return [{ label: "Operations", href: "/operations" }];
  }
  if (path.startsWith("/notifications")) {
    return [{ label: "Notifications", href: "/notifications" }];
  }
  const chrome = pageChromeForPath(path);
  return chrome.group && chrome.group !== chrome.title
    ? [{ label: chrome.group }, { label: chrome.title }]
    : [{ label: chrome.title }];
}

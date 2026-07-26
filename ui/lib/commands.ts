import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  Copy,
  RefreshCw,
  UserCheck,
  Users,
  Waypoints,
  WalletCards,
} from "lucide-react";

export type NavigationCommand = {
  id: string;
  group: "Navigation";
  title: string;
  subtitle?: string;
  href: string;
  icon: LucideIcon;
};

export type FilterCommand = {
  id: string;
  group: "Operations Views";
  title: string;
  subtitle?: string;
  href: string;
  icon: LucideIcon;
};

export type SafeActionCommand = {
  id: string;
  group: "Actions";
  title: string;
  subtitle?: string;
  action: "copy_current_page_link" | "refresh_current_page" | "open_notifications";
  icon: LucideIcon;
};

export type CommandDefinition = NavigationCommand | FilterCommand | SafeActionCommand;

export const BUILT_IN_OPERATIONS_VIEW_COMMANDS: FilterCommand[] = [
  {
    id: "operations:all-open",
    group: "Operations Views",
    title: "Show all open Work Items",
    subtitle: "Open, acknowledged, and in-progress operational issues.",
    href: "/operations?status=open,acknowledged,in_progress",
    icon: ClipboardList,
  },
  {
    id: "operations:urgent",
    group: "Operations Views",
    title: "Show urgent Work Items",
    subtitle: "Highest priority issues across the workspace.",
    href: "/operations?priority=urgent&status=open,acknowledged,in_progress",
    icon: AlertTriangle,
  },
  {
    id: "operations:unassigned",
    group: "Operations Views",
    title: "Show unassigned Work Items",
    subtitle: "Open work that has not been assigned.",
    href: "/operations?assigned_to=unassigned&status=open,acknowledged,in_progress",
    icon: UserCheck,
  },
  {
    id: "operations:attribution",
    group: "Operations Views",
    title: "Show attribution issues",
    subtitle: "Unattributed purchases and model processing problems.",
    href: "/operations?category=attribution&status=open,acknowledged,in_progress",
    icon: Waypoints,
  },
  {
    id: "operations:identity",
    group: "Operations Views",
    title: "Show identity issues",
    subtitle: "Identity backfill and resolution issues.",
    href: "/operations?category=identity&status=open,acknowledged,in_progress",
    icon: Users,
  },
  {
    id: "operations:commissions",
    group: "Operations Views",
    title: "Show commission issues",
    subtitle: "Commission generation and payout review items.",
    href: "/operations?category=commissions&status=open,acknowledged,in_progress",
    icon: WalletCards,
  },
  {
    id: "operations:integrations",
    group: "Operations Views",
    title: "Show integration failures",
    subtitle: "Connector and import runtime issues.",
    href: "/operations?category=integrations&status=open,acknowledged,in_progress",
    icon: AlertTriangle,
  },
];

export const BUILT_IN_SAFE_ACTION_COMMANDS: SafeActionCommand[] = [
  {
    id: "action:copy-current-page-link",
    group: "Actions",
    title: "Copy current page link",
    subtitle: "Copy the current workspace URL.",
    action: "copy_current_page_link",
    icon: Copy,
  },
  {
    id: "action:refresh-current-page",
    group: "Actions",
    title: "Refresh current page",
    subtitle: "Refresh the current TraceKit view.",
    action: "refresh_current_page",
    icon: RefreshCw,
  },
  {
    id: "action:open-notifications",
    group: "Actions",
    title: "Open notifications",
    subtitle: "Review active operational notifications.",
    action: "open_notifications",
    icon: Bell,
  },
];

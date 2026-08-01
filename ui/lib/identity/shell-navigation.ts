import { Activity, Building2, ClipboardList, ContactRound, CreditCard, FileClock, Flag, HeartPulse, Home, Import, Landmark, Megaphone, Package, Plug, Settings, ShieldCheck, ShoppingBag, Tags, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "./permissions";
import type { Identity } from "./types";
import { satisfiesPermissionRequirement, shellVariant } from "./authorization";
import { NAVIGATION_POLICY } from "./navigation-policy";

export type ShellNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission | readonly Permission[];
};

const NAVIGATION_ICONS: Record<string, LucideIcon> = {
  "Mission Control": Home,
  Offers: Megaphone,
  Customers: Users,
  Orders: ShoppingBag,
  Money: Landmark,
  Operations: ClipboardList,
  Settings,
  Clients: Building2,
  Reports: Activity,
  Team: ContactRound,
  Branding: Tags,
  Organizations: Building2,
  Agencies: ShieldCheck,
  Users,
  Connectors: Plug,
  Imports: Import,
  "System Health": HeartPulse,
  Billing: CreditCard,
  "Audit Logs": FileClock,
  "Feature Access": Flag,
  Support: Package,
};

export function navigationForIdentity(identity: Identity): ShellNavigationItem[] {
  return NAVIGATION_POLICY[shellVariant(identity)]
    .filter((item) => !item.permission || satisfiesPermissionRequirement(identity, item.permission))
    .map((item) => ({ ...item, icon: NAVIGATION_ICONS[item.label] || Home }));
}

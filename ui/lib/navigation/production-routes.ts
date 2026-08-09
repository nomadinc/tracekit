import type { CustomerDeepLinkState } from "@/lib/customers/types";
import { customerDeepLinkHref } from "@/lib/customers/deep-link";
import type { OfferDeepLinkState } from "@/lib/offers/types";
import { offerDeepLinkHref } from "@/lib/offers/deep-link";
import type { OrderDeepLinkState } from "@/lib/orders/types";
import { orderDeepLinkHref } from "@/lib/orders/deep-link";

export const PRODUCTION_ROUTES = {
  missionControl: () => "/",
  offers: (state: Partial<OfferDeepLinkState> = {}) => offerDeepLinkHref(state),
  customers: (state: Partial<CustomerDeepLinkState> = {}) => customerDeepLinkHref(state),
  orders: (state: Partial<OrderDeepLinkState> = {}) => orderDeepLinkHref(state),
  money: () => "/money",
  operations: () => "/operations",
  settings: () => "/settings",
  connections: () => "/connections",
  clients: () => "/clients",
  reports: () => "/reports",
  team: () => "/team",
  branding: () => "/branding",
  platform: (section: "organizations" | "agencies" | "users" | "connectors" | "imports" | "system-health" | "billing" | "audit-logs" | "feature-access" | "support") => `/platform/${section}`,
} as const;

export function isProductionWorkspaceHref(href: string) {
  return href === "/" || href.startsWith("/offers?") || href.startsWith("/customers?") || href.startsWith("/orders?");
}

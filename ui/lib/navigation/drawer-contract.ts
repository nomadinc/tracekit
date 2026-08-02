import type { DrawerTarget } from "./deep-link";

export const OFFER_DRAWER_KINDS = new Set(["metric", "traffic-source", "profit-driver", "significant-event", "intelligence", "comparison", "related-customer", "related-order", "evidence"] as const);
export type OfferDrawerKind = typeof OFFER_DRAWER_KINDS extends ReadonlySet<infer K> ? K : never;
export type OfferDrawerTarget = DrawerTarget<OfferDrawerKind>;

export const CUSTOMER_DRAWER_KINDS = new Set(["journey-event", "identifier", "redirect", "tracking-health", "privacy-signal", "related-order", "related-offer", "evidence"] as const);
export type CustomerDrawerKind = typeof CUSTOMER_DRAWER_KINDS extends ReadonlySet<infer K> ? K : never;
export type CustomerDrawerTarget = DrawerTarget<CustomerDrawerKind>;

export const ORDER_DRAWER_KINDS = new Set(["financial-line", "shipping-analysis", "processor-fee", "attribution", "timeline-event", "identifier", "related-customer", "related-offer", "intelligence", "evidence"] as const);
export type OrderDrawerKind = typeof ORDER_DRAWER_KINDS extends ReadonlySet<infer K> ? K : never;
export type OrderDrawerTarget = DrawerTarget<OrderDrawerKind>;

export const MISSION_CONTROL_DRAWER_KINDS = new Set(["attention-item", "briefing-item", "winner", "resume-context"] as const);
export type MissionControlDrawerKind = typeof MISSION_CONTROL_DRAWER_KINDS extends ReadonlySet<infer K> ? K : never;
export type MissionControlDrawerTarget = DrawerTarget<MissionControlDrawerKind>;

export const DRAWER_PRIMARY_QUESTIONS = {
  offer: {
    "traffic-source": "How is this source contributing to Offer performance?",
    "profit-driver": "Why is this factor affecting Offer profit?",
    "significant-event": "What changed, what happened afterward, and what Evidence connects them?",
    intelligence: "What did TraceKit notice, why does it matter, and what action is recommended?",
  },
  customer: {
    "journey-event": "What happened, and what Evidence proves it?",
    identifier: "What Customer Story does this Identifier belong to?",
  },
  order: {
    "financial-line": "Why is this amount what it is?",
    "timeline-event": "What happened, and what tracking Evidence proves it?",
  },
} as const;

# TraceKit Core Flow Hardening

Version: 1.0

Status: Implemented for mock production review

## 1. Purpose

This phase makes the approved production flow—Mission Control → Offer Workspace → Customer Workspace → Order Workspace → Explain / Evidence—consistent, refresh-safe, history-ready, permission-ready, and tenant-ready. It changes integration contracts, not product design, and does not make TraceKit safe for real customer data.

## 2. Scope

The work covers canonical production routes, exact cross-Workspace object links, typed route parsing and construction, Organization and Business Context restoration, opaque identifier references, Drawer restoration, development-identity safety, legacy-route classification, and regression coverage. It does not add identity persistence, server authorization, live repositories, migrations, connectors, or production Intelligence.

## 3. Canonical Production Routes

- Mission Control: `/`
- Offer Workspace: `/offers`
- Customer Workspace: `/customers`
- Order Workspace: `/orders`
- Supporting destinations: `/money`, `/operations`, `/settings`, Agency destinations, and `/platform/[section]`

All production builders live in the typed production route registry. Concept routes are deliberately excluded. Development identity preservation is applied by the removable development layer after a canonical route is built.

## 4. Versioned Deep-Link Contract

Every generated Workspace URL includes `v=1`. Shared primitives validate opaque IDs, encode typed Drawer targets, and normalize repeated IDs. Workspace parsers own their supported parameters; there is no generic unstructured query object.

Unknown, malformed, inaccessible, or incompatible state normalizes to an accessible default or no temporary context. A URL is a request for context, never proof of authorization.

## 5. Workspace-Specific Parameters

Offer supports `offer_id`, `focus`, `traffic_source`, `driver`, `event_id`, `drawer_kind`, `drawer_id`, `search_ref`, `compare`, and repeated `compare_offer` values. Comparison IDs are unique and limited to four.

Customer supports `customer_id`, `focus`, `event_id`, `identifier_ref`, `order_id`, `offer_id`, `drawer_kind`, `drawer_id`, `search_ref`, and `replay`.

Order supports `order_id`, `focus`, `line`, `attribution`, `event_id`, `identifier_ref`, `customer_id`, `offer_id`, `drawer_kind`, `drawer_id`, `search_ref`, and `replay`.

Selected objects and related objects use stable mock IDs such as `offer-*`, `cust-*`, and `ord-*`; display names and Order numbers are not identifiers.

## 6. Organization Restoration Policy

Repositories resolve requested objects only across Organizations already accessible to the authenticated identity. Direct Client identities cannot leave their Organization. Agency identities may restore an assigned Client Organization when an authorized object resolves there. Product Admin identities remain outside tenant Workspaces. Client-supplied Organization values are not authorization inputs, and inaccessible objects return the same null result as nonexistent objects.

## 7. Business Context Restoration Policy

An authorized Offer resolves the Business Context within its Organization. Customer and Order resolution may return their related Business Context after Organization authorization succeeds. The identity boundary normalizes Organization before Business Context, and components do not render dependent snapshots for invalid combinations. Business Context remains permanent business context, not a report filter.

## 8. Sensitive Identifier Policy

Email, phone, click IDs, attribution transaction IDs, and processor IDs are not generated into production Workspace URLs. URLs use `identifier_ref` or `search_ref`, which identify mock Evidence/search records. Repositories resolve the underlying value after scope and permission checks. The future server implementation must audit sensitive Evidence access.

## 9. Drawer Contract

The shared shell Drawer remains the only global Drawer system. Route state uses a typed target consisting of Workspace-owned `drawer_kind` and opaque `drawer_id`.

Offer kinds: `metric`, `traffic-source`, `profit-driver`, `significant-event`, `intelligence`, `comparison`, `related-customer`, `related-order`, and `evidence`.

Customer kinds: `journey-event`, `identifier`, `redirect`, `tracking-health`, `privacy-signal`, `related-order`, `related-offer`, and `evidence`.

Order kinds: `financial-line`, `shipping-analysis`, `processor-fee`, `attribution`, `timeline-event`, `identifier`, `related-customer`, `related-offer`, `intelligence`, and `evidence`.

Mission Control kinds are `attention-item`, `briefing-item`, `winner`, and `resume-context`; Mission Control Drawers still only answer whether to investigate. Each kind retains its approved object-specific primary question. Invalid targets are discarded. User dismissal removes temporary route state; navigation, identity, Organization, Business Context, or permanent-object changes close or normalize the Drawer.

## 10. Legacy Route Disposition

- `/customers/[person_id]`: **INTERNAL ONLY / DEPRECATE**. Existing operational compatibility remains, but production navigation and Universal Search use `/customers?v=1&customer_id=…`.
- `/orders/[platform_order_id]`: **INTERNAL ONLY / DEPRECATE**. Existing operational compatibility remains, but production navigation and Universal Search use `/orders?v=1&order_id=…`.
- Legacy Customer and Order APIs: **KEEP** pending server-authorization and read-model migration; they are not canonical user navigation.
- `/overview` and the legacy Home API: **INTERNAL ONLY** compatibility surfaces. Mission Control owns `/`.
- `/concepts/*`: **KEEP** as isolated design references; never production destinations.

No legacy route is removed or redirected in this phase because its current identifiers and tenant enforcement are not yet safe inputs to a canonical redirect.

## 11. URL State Versus Transient State

URL state includes selected object, focus, related object, stable Evidence reference, typed Drawer target, Compare selection, and requested Replay state. Repository snapshots contain authorized business and Evidence data. Shared shell state contains identity, active Organization, active Business Context, and overlay infrastructure. Hover previews, menu visibility, filter input before application, playback timers, and animation progress remain transient local state.

## 12. Browser History Expectations

Generated investigation URLs can be parsed after refresh and reparsed after back/forward navigation. Opening a route-backed Drawer adds navigable state; dismissing it removes that state. Object, Organization, Business Context, Compare, and search navigation use canonical URLs. Popstate resynchronizes the development identity. Actual click-level browser history remains a manual-review item until browser automation is adopted.

## 13. Development Identity Behavior

A valid explicit `dev_identity` controls the removable mock identity boundary and is preserved by development navigation wrappers. A missing value may use the persisted or default mock identity. An invalid explicit value renders a clear development-only error and never falls back to a persisted or default user. No production authorization may depend on this parameter.

## 14. Cross-Workspace Flow Matrix

| Flow | Status | Canonical behavior |
| --- | --- | --- |
| Mission Control → Offer | COMPLETE | Exact Offer, focus, and optional Drawer |
| Mission Control → Customer | COMPLETE | Exact Customer and optional Evidence context |
| Mission Control → Order | COMPLETE | Exact Order and optional financial context |
| Offer → Customer | COMPLETE | Exact related `customer_id` plus Offer context |
| Offer → Order | COMPLETE | Exact related `order_id` plus Offer context |
| Customer → Order | COMPLETE | Exact related `order_id` plus Customer context |
| Customer → Offer | COMPLETE | Exact related `offer_id` |
| Order → Customer | COMPLETE | Exact related `customer_id` plus Offer context |
| Order → Offer | COMPLETE | Exact related `offer_id` |
| Universal Search → core Workspaces | COMPLETE FOR MOCK | Canonical v1 routes; sensitive values replaced by references |
| Agency cross-Organization restoration | COMPLETE FOR MOCK | Repository-authorized object resolution |
| Server-enforced tenant restoration | SECURITY BLOCKER | Requires persistent session and authorization gateway |

## 15. Tests Added

Focused tests cover exact cross-Workspace IDs, route versioning, route reparsing, invalid-state normalization, typed Drawer restoration, Business Context restoration, Agency versus direct-Client scope, bounded Compare parameters, sensitive-reference URLs, invalid explicit development identity, production route destinations, and absence of concept/legacy detail links in the core production UI. Previously stale worker structural assertions now verify Mission Control as the approved root while retaining the isolated legacy overview compatibility route.

## 16. Remaining Security Blockers

- No persistent production identity or server session
- No persistent Membership or tenant assignment model
- No server-side end-user authorization gateway
- Privileged server proxies and caller-controlled legacy tenant scope
- No persistent audit logging
- No real tenant-scoped repositories or normalized read models

These blockers prohibit real customer data.

## 17. Deferred Work

Persistent identity and tenancy, server-side authorization, audit persistence, canonical redirect decisions after secure ID mapping, real repository implementations, search indexing, MCP permission propagation, and browser-level integration automation remain deferred to their approved phases.

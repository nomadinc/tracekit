# TraceKit Core Flow Integration and Readiness Audit

Version: 1.0  
Status: Audit for Review  
Date: 2026-08-01

## 1. Executive Summary

TraceKit's approved production core flow is structurally present:

```text
Mission Control → Offer Workspace → Customer Workspace → Order Workspace → Explain / Evidence
```

The four experiences render in one production shell, use typed mock repositories, preserve development identity in their primary links, normalize most invalid object state, and use production rather than concept routes. The application is **COMPLETE for mock product review**, **PARTIAL as an integrated production flow**, and **BLOCKED for real customer data**.

The principal blocker is server authorization. The Next.js API proxies accept browser requests without an end-user session, attach a server-held platform secret, and forward client-controlled or default `workspace_id` values. The Worker validates only that shared administrative secret. It does not resolve a User, Membership, active Organization, permission, or data scope. Enabling tenant data through these routes would allow an unauthorized browser request to exercise platform-level access and could expose cross-tenant data. This is a **SECURITY BLOCKER**.

The fastest safe beta path is not to replace the UI or repositories. It is to:

1. harden and canonicalize the core flow;
2. establish persistent Identity, Organization, Membership, and session records;
3. enforce authorization server-side and derive tenant scope from the session;
4. map the existing `workspace_id` data boundary to an approved Organization;
5. activate one narrow read-only vertical slice using one commerce source, TraceKit browser evidence, one payment source, and configured costs;
6. replace mock repository methods incrementally behind the existing interfaces.

No real customer data should be exposed to the production Workspaces until Phases 2 through 4 in the implementation plan pass their acceptance criteria.

## 2. Current Production State

| Area | Status | Finding |
| --- | --- | --- |
| Production Shell Phase 1 | COMPLETE | Client, Agency, and Product Admin variants; typed UI permissions; development identity only. |
| Mission Control | MOCK ONLY | Production route and interaction model are present; `MissionControlRepository` is unscoped and mock-backed. |
| Offer Workspace | MOCK ONLY | Production route, scoped repository, Compare, Drawer, and deep links are present. |
| Customer Workspace | MOCK ONLY | Production route, scoped repository, forensic Story, Replay, Drawer, and deep links are present. |
| Order Workspace | MOCK ONLY | Production route, scoped repository, Profit Ledger, financial/forensic Drawers, Replay, and deep links are present. |
| Identity | MOCK ONLY | Query/local development identity; no persistent user session. |
| Authorization | PARTIAL | UI policy is typed and direct routes show denied states; no end-user server enforcement. |
| Organization tenancy | PARTIAL | Mock Organization scope is normalized in the client; persistence uses string `workspace_id`. |
| Universal Search | PARTIAL | New mock workspace results coexist with a real legacy search proxy using incompatible routes and fixed `default` scope. |
| MCP Chat | BLOCKED | Shell placeholder only; no tools, permission propagation, evidence contract, or audit trail. |
| Connectors and normalized data | PARTIAL | Significant ingestion and ledger infrastructure exists, but it is not connected to the production repository contracts or persistent tenant identity. |

### Milestone commits

| Milestone | Commit |
| --- | --- |
| Production Shell Phase 1 | `3360127` |
| Mission Control migration | `6f82d9d` |
| Offer Workspace migration | `55d9d87` |
| Customer Workspace migration | `ce01292` |
| Order Workspace migration | `243b850` |

## 3. Core Flow Matrix

Status meanings: **PASS** means the approved mock interaction reaches production UI; **PARTIAL** means the destination works but exact context is incomplete; **PLACEHOLDER** means no investigation is implemented; **FAIL** means the intended state is not restored; **SECURITY BLOCKER** means it must not carry real tenant data.

| Flow | Status | Identity | Organization / Business Context | Object, focus, Drawer | Notes |
| --- | --- | --- | --- | --- | --- |
| Mission Control → Offer | PASS | Preserved | Offer resolves and may restore Organization | Supported | Uses `offerDeepLinkHref`. |
| Mission Control → Customer | PASS | Preserved | Customer resolution can restore entitled Organization and first Offer | Supported for seeded recent activity | Uses stable Customer ID. |
| Mission Control → Order | PASS | Preserved | Order resolution restores entitled Organization and Offer | Supported for seeded recent activity | Uses stable Order ID. |
| Offer → Customer | PARTIAL | Preserved | Offer ID filters Customer list | No Customer selected; no specific Drawer | Section-level relationship, not exact-object routing. |
| Offer → Order | PARTIAL | Preserved | Offer ID filters Order list | No Order selected; no specific Drawer | Section-level relationship, not exact-object routing. |
| Customer → Order | PARTIAL | Preserved | Customer ID filters Orders | Related-order button does not pass selected Order ID | Customer Drawer retains the related Order locally. |
| Customer → Offer | PASS | Preserved | Stable Offer ID restores context | Offer selected | Production `/offers`. |
| Order → Customer | PASS | Preserved | Stable Customer ID resolves entitled scope | Customer selected | Production `/customers`. |
| Order → Offer | PASS | Preserved | Stable Offer ID restores context | Offer selected | Production `/offers`. |
| Universal Search → Offer | PASS / MOCK ONLY | Preserved | Scoped by client mock Organization | Focus and Drawer supported | Mock repository result. |
| Universal Search → Customer | PASS / MOCK ONLY | Preserved | Scoped by mock Organization/Business Context | Event, identifier, searched value, Drawer supported | Mock repository result. |
| Universal Search → Order | PASS / MOCK ONLY | Preserved | Scoped by mock Organization/Business Context | Event/identifier/Drawer supported | Mock repository result. |
| Legacy API Search → Customer | FAIL | Development identity appended by client | Uses hard-coded `workspace_id=default` | Routes to `/customers/[person_id]`, not new contract | Competes with mock result. |
| Legacy API Search → Order | FAIL | Development identity appended by client | Uses hard-coded `workspace_id=default` | Routes to `/orders/[platform_order_id]`, not new contract | Competes with mock result. |
| Browser back/forward | PARTIAL | `popstate` re-resolves identity | URL state restores; Organization/Business Context are not encoded canonically | Deep-linked object state generally restores | Client session context can diverge from URL until repository effects normalize it. |
| Organization switch mid-investigation | PARTIAL | Preserved | Invalid context is normalized | Workspace may fall back to first object; URL is not rewritten canonically | Drawer closes through object/context changes. |
| Business Context switch mid-investigation | PARTIAL | Preserved | Context changes in client session | Customer/Order lists rescope; stale URL may remain | Not all deep links encode Business Context. |
| Identity switch mid-investigation | PASS / MOCK ONLY | URL updated | Organization and Business Context normalize | Unauthorized route becomes denied or object falls back | Local development behavior only. |
| Drawer → navigation | PASS | Preserved | Destination resolves through repository | Drawer closes on route/context change | Shared Drawer is reused. |
| Hard refresh on mock deep link | PASS / MOCK ONLY | Query identity restores | Cross-Organization object resolution works for entitled identities | Typed parsers restore valid state | Requires client hydration; no server tenant guard. |
| Any real-data flow through current API proxy | SECURITY BLOCKER | Not verified server-side | Client controls `workspace_id` | Broad service-secret access | Must not be enabled for end users. |

### Manual review still required

Browser automation was unavailable during this audit. Automated tests and HTTP checks cover parsing, normalization, permissions, repository scope, route rendering, and hard-refresh response. A manual click-through is still required for browser history, focus restoration, hover previews, responsive Drawer behavior, and visual selected-state continuity.

## 4. Route Inventory

### Core and shell routes

| Route | Purpose | Shell / permission | Scope and context | Data status | States and outbound links |
| --- | --- | --- | --- | --- | --- |
| `/` | Mission Control | Client/Agency; `organizations.view` through shell navigation | Client-side active Organization; Business Context tiles launch Offers | Mock repository | Production Offer/Customer/Order links; Drawer briefing; no repository error boundary. |
| `/offers` | Strategic Offer decision Workspace | Client/Agency; `offers.view` | Organization-scoped Offers; selected Offer is Business Context | Mock repository | Loading, empty, denied; no explicit repository-error state. Links to filtered Customers/Orders. |
| `/customers` | Customer Story and forensic investigation | Client/Agency; `customers.view` | Organization and optional Offer scope | Mock repository | Loading, empty, not found, repository error, denied. Links to Offers and filtered Orders. |
| `/orders` | Order Profit investigation | Client/Agency; `orders.view` | Organization and optional Offer/Customer scope | Mock repository | Loading, empty, not found, denied; no explicit repository-error state. Links to Customer/Offer. |
| `/money` | Future financial Workspace | Client; `financials.view` | Active Organization | PLACEHOLDER | Access denied or safe placeholder. |
| `/operations` | Operational summary/work items | Client; `imports.view` or `connectors.view` in nav | Uses legacy API and `workspace_id` | Existing real backend surface | Not part of migrated core flow; unsafe for tenant data until server auth. |
| `/settings` | Organization settings | Client/Agency; `organizations.manage` | Client-only mock identity context | PLACEHOLDER | Safe denied/placeholder. Nested integration routes are separate legacy experiences. |
| `/clients` | Agency client entry | Agency; `organizations.view` | Assigned mock Organizations | PLACEHOLDER | Organization selector exists in shell. |
| `/reports` | Agency reporting | Agency; `financials.view` | Selected client Organization | PLACEHOLDER | No repository. |
| `/team` | Agency membership administration | Agency; `users.view` | Agency Account | PLACEHOLDER | Persistent identity dependency stated. |
| `/branding` | Agency branding | Agency; `branding.view` | Agency Account | PLACEHOLDER | Static white-label boundary only. |
| `/platform/[section]` | Platform operations destinations | Product Admin; section-specific capability | Platform scope only | PLACEHOLDER | Unknown section returns 404; shell isolates client routes. |

### Legacy and duplicate routes

`/customers/[person_id]` and `/orders/[platform_order_id]` are existing real-data/legacy detail contracts. Universal Search's Worker still emits them, while the migrated production Workspaces use query parameters on `/customers` and `/orders`. `/dashboard`, `/overview`, `/events`, `/journeys`, `/integrations`, `/notifications`, `/setup`, and nested financial/integration routes remain existing application surfaces outside the approved four-experience flow. They are not dead, but they are not governed by the new repository boundaries and should be classified before beta as retained operations tools, migrated experiences, admin-only tools, or retired duplicates.

### API proxy inventory

| Same-origin route family | Method class | Upstream scope | Current protection | Finding |
| --- | --- | --- | --- | --- |
| `/api/home`, `/api/executive-dashboard`, `/api/health`, `/api/operations/summary` | Read | Query `workspace_id` | Server-held `x-tk-secret` only | SECURITY BLOCKER |
| `/api/search` | Read | Query `workspace_id`, default `default` | Server-held `x-tk-secret` only | SECURITY BLOCKER; returns sensitive Customer fields and legacy links. |
| `/api/customers/**`, `/api/entities/**`, `/api/events/**` | Read / stream | Query `workspace_id` | Server-held `x-tk-secret` only | SECURITY BLOCKER; forensic and sensitive data. |
| `/api/financial-import-monitor`, `/api/financial-reconciliation/**` | Read / mutation | Body/query `workspace_id` | Server-held `x-tk-secret` only | SECURITY BLOCKER; financial and mutation surface. |
| `/api/notifications/**`, `/api/work-items/**` | Read / mutation | Body/query `workspace_id` | Server-held `x-tk-secret` only | SECURITY BLOCKER; actor IDs can be client supplied. |
| `/api/setup-wizard` | Read / mutation | Body/query `workspace_id` | Server-held secret(s) only | SECURITY BLOCKER; connector/configuration mutation. |

The Worker applies `adminAuthError`, comparing one administrative secret. Database queries frequently constrain by `workspace_id`, which is useful data partitioning but not authorization because the caller selects the value. Most tables do not show an end-user RLS policy; the Worker uses a privileged Supabase client. Browser event ingestion has separate public-write-key, origin, payload, replay, and rate controls and should remain an ingestion boundary rather than an end-user read boundary.

## 5. Deep-Link Contract Inventory

| Parameter | Owner(s) | Type / values | Repeated | Normalization | Context restoration | Readiness |
| --- | --- | --- | --- | --- | --- | --- |
| `dev_identity` | Shell development mode | Mock identity ID | No | Falls back to persisted/default identity | Development only | DEFERRED from production contract |
| `offer_id` | Offer, Customer, Order | Stable Offer ID | No | Validated against accessible repository records | Offer route can resolve Organization; child routes use as filter/relation | PARTIAL |
| `customer_id` | Customer, Order | Stable Customer ID | No | Customer validates; Order validates related Customer | Customer route can resolve Organization | PARTIAL |
| `order_id` | Order, Customer | Stable Order ID | No | Order validates; Customer validates related Order | Order route can resolve Organization/Offer | PARTIAL |
| `focus` | All Workspaces | Workspace-specific enum | No | Unknown values become null | No Organization restoration | PARTIAL; same name, different enum is acceptable if route-owned |
| `event_id` | All Workspaces | Stable event ID | No | Validated against snapshot | Requires selected object | PARTIAL |
| `drawer` | All Workspaces | Prefixed object key | No | Checked against snapshot-specific set | Requires selected object | PARTIAL; prefix grammar is undocumented/versionless |
| `search` | All Workspaces | Original query string | No | Preserved but not strongly validated | None | PARTIAL; may contain sensitive data in URLs/logs |
| `identifier` | Customer, Order | ID or raw identifier value | No | Compared with snapshot ID/value | Requires selected object | PARTIAL; raw PII/tracking values in URL risk logs/history |
| `traffic_source` | Offer | Stable Traffic Source ID | No | Snapshot validation | Offer required | PARTIAL |
| `driver` / `line` | Offer / Order | Profit Driver ID / financial line ID | No | Snapshot validation | Parent object required | PARTIAL; related concepts use different names intentionally but need taxonomy. |
| `attribution` | Order | Attribution item ID | No | Parsed but not validated or used to choose Drawer | Parent object required | FAIL |
| `compare` | Offer | `1` | No | Requires at least two valid Offers | Organization derived through selected Offer | PARTIAL |
| `compare_offer` | Offer | Offer ID | Yes, 2–4 | Deduplicated, scoped, capped at four | Active Organization only | PASS / MOCK ONLY |
| `replay` | Customer, Order | `1` | No | Requires timeline data | Parent object required | PASS / MOCK ONLY |
| `workspace_id` | Legacy API/search routes | Internal workspace string | No | Defaults to `default` | Caller-controlled | SECURITY BLOCKER |

### Canonical recommendation

Use a versioned, route-owned query contract with stable internal IDs:

```text
/{workspace}?v=1&organization_id=<opaque-id>&offer_id=<id>&customer_id=<id>&order_id=<id>
             &focus=<route-enum>&object_type=<type>&object_id=<id>&drawer=<mode>
             &event_id=<id>&compare_offer=<id>...
```

Rules:

- The server must ignore `organization_id` as authorization evidence. It is a requested context only and must be checked against the session.
- Prefer opaque evidence/identifier record IDs in URLs; do not place raw email, phone, click IDs, or payment identifiers in URLs.
- Keep `focus` route-owned, but publish each enum.
- Replace free-form prefixed Drawer strings with typed `object_type` + `object_id` + optional `drawer` mode.
- Allow only `compare_offer` to repeat.
- Canonicalize invalid state with a replace, not a navigation loop.
- Preserve a `return_to` token only if it is same-origin and validated; browser history should otherwise remain normal.
- Remove `dev_identity` and `workspace_id` from the end-user contract when persistent sessions land.
- Update Worker search results to emit the canonical `/customers?...` and `/orders?...` contracts.

## 6. Repository Readiness Matrix

| Repository / method group | Classification | Future backing | Sensitive / financial | Cache / consistency / audit | Beta priority |
| --- | --- | --- | --- | --- | --- |
| `MissionControlRepository.getMissionControl()` | Aggregated read model | Offer/order/profit/tracking summaries and attention findings | Financial | Short TTL/materialized; auditable source timestamps | After core object slice |
| `OfferRepository.listOffers`, `resolveOffer` | Direct normalized lookup | Organization-owned Offers and access assignments | Low | Cacheable; strong scope checks | FIRST |
| `OfferRepository.loadWorkspace` | Aggregated read model | Orders, Customers, finance, attribution, tracking | Financial | Materialized/eventually consistent with freshness | FIRST SLICE |
| `OfferRepository.loadTrend` | Aggregated read model | Daily Offer metrics | Financial | Materialized, short TTL | FIRST SLICE (Profit only initially) |
| `OfferRepository.loadComparison` | Derived aggregate | Multiple Offer read models | Financial | Cacheable; evidence lineage required | Post-beta unless two Offers required |
| `OfferRepository.loadDrawer` | Forensic/derived lookup | Financial/events/evidence graph | Potentially sensitive | Audit sensitive evidence access | FIRST SLICE subset |
| `OfferRepository.search` | Search index query | Scoped object/identifier index | Sensitive identifiers | No shared cache; audit sensitive lookup | Universal Search phase |
| `CustomerRepository.listCustomers`, `resolveCustomer` | Direct lookup + summary index | People, identifiers, Offer relationship | PII | Scoped query; audit exports, not ordinary masked list | FIRST |
| `CustomerRepository.loadWorkspace`, `loadJourney` | Aggregated + forensic read model | People, Journeys, events, Orders, attribution | PII/financial | Materialized Story; evidence immutable | FIRST SLICE |
| `CustomerRepository.loadDrawer` | Forensic evidence lookup | Raw/normalized evidence relationships | High sensitivity | Audit raw/sensitive access | FIRST SLICE subset |
| `CustomerRepository.search` | Search index query | Identifier index | High sensitivity | Exact lookup first; audit | Universal Search phase |
| `CustomerRepository.resolveDeepLink` | Authorization + lookup | Canonical object registry | Depends on target | Must be server-authorized | FIRST |
| `OrderRepository.listOrders`, `resolveOrder` | Direct lookup + summary index | Orders and qualification status | Financial/PII | Short TTL; scoped | FIRST |
| `OrderRepository.loadWorkspace` | Aggregated Order read model | Commerce, payments, costs, shipment, attribution | High financial/PII | Materialized; reconciliation-aware; auditable | FIRST SLICE |
| `OrderRepository.loadTimeline` | Forensic read model | Journey and financial events | Sensitive | Eventual; immutable evidence links | FIRST SLICE |
| `OrderRepository.loadDrawer` | Financial/forensic lookup | Evidence graph and calculations | High | Audit sensitive/raw evidence | FIRST SLICE subset |
| `OrderRepository.search` | Search index query | Order/identifier index | High | Exact lookup, audit | Universal Search phase |
| `OrderRepository.resolveDeepLink` | Authorization + lookup | Canonical object registry | Depends on target | Must be server-authorized | FIRST |

The smallest real repository surface is: scoped Offer/Customer/Order resolution and listing; one selected snapshot for each Workspace; the Order financial ledger; Customer Journey; exact identifier resolution; and evidence records. Compare, broad fuzzy search, Intelligence, and multi-measure trends are not required to prove beta architecture.

Repository scope must be derived from the authenticated server session. Passing the client `Identity` object into a browser-local repository is not a secure future interface. A real adapter should accept a server-generated request context or invoke authenticated server endpoints that resolve scope internally.

## 7. Backend Authorization Findings

### SECURITY BLOCKER — Anonymous elevation through same-origin proxies

All reviewed Next.js proxies can be called without an end-user session. They attach `TK_SECRET_KEY`/`TRACEKIT_TK_SECRET`, turning the browser request into an administrative Worker request. This includes sensitive reads and mutations. The Worker verifies only the shared secret.

Required remediation before real data:

```text
Server session
→ Identity
→ Membership
→ Account / Agency assignment
→ requested Organization validated
→ required Permission
→ object/evidence data scope
→ audited repository/service call
```

### CRITICAL — Caller-controlled tenant selector

`workspace_id` comes from query/body values and commonly defaults to `default`. It is used as a database filter but is not derived from membership. Anyone who reaches a same-origin proxy could request another known workspace. The default workspace pattern is incompatible with multi-tenant beta.

### HIGH — Sensitive Universal Search

The real search endpoint selects Customer email/phone and Order identifiers and returns broad results under the supplied workspace. It lacks an end-user session, sensitive-data capability check, per-user audit trail, and appropriate rate limiting. It also generates legacy routes.

### HIGH — Financial and operational mutations

Financial reconciliation, notifications, work items, setup/configuration, connector/import, projection replay, and other Worker mutations use administrative-secret authorization. Several accept actor or Organization/workspace values from the client. CSRF protection is not meaningful without a user session; once cookie sessions are introduced, mutations require same-site cookies, origin/CSRF enforcement, and idempotency where applicable.

### HIGH — Privileged database client and limited RLS

The Worker uses a privileged Supabase client. Only isolated migration evidence of RLS was found; tenant safety currently depends on every query applying the correct `workspace_id`. This is defense-in-depth insufficient for end-user access.

### MEDIUM — Missing per-user rate limits and audit coverage

Browser ingestion has source-level rate controls, but end-user reads/searches and administrative mutations do not have a persistent user-based rate/audit model. Sensitive views, exports, permission changes, Connector credentials, reconciliation, impersonation, and MCP calls require durable audit events.

### ACCEPTABLE FOR MOCK ONLY

Client `AccessBoundary`, permission-aware navigation, and mock repository scoping are valid product demonstrations. They are not security controls and must remain disconnected from tenant data.

## 8. Persistent Identity and Tenancy Requirements

| Entity | Purpose and minimum fields | Relationships / tenant boundary | Lifecycle and audit | Beta |
| --- | --- | --- | --- | --- |
| User | Human profile: ID, display name, primary email, status, timestamps | Has authentication identities and memberships | Create/disable; audit status changes | Required |
| Authentication Identity | Provider-neutral login: ID, User ID, provider, provider subject, verified email, last authenticated | Global; never grants tenant access alone | Link/unlink; audit authentication and recovery | Required |
| Account | Commercial boundary: ID, type (`platform`,`agency`,`client`), name, status | Owns memberships/configuration | Audit ownership/billing changes | Required |
| Organization | Data tenant: ID, owning Account, name, status, legacy workspace mapping | Owns all business data | Immutable tenant ID; audit lifecycle | Required |
| Agency | Agency Account profile | Assigned to client Organizations | Audit assignments | Required only for agency beta |
| Membership | User, Account, role, status, validity timestamps | Grants account participation | Invite/activate/suspend; audit all changes | Required |
| Role | Named collection of typed permissions | Account-type constrained | Version role defaults; audit changes | Required |
| Permission Override | Membership, permission, allow/deny, scope, reason | Denial precedence | Time-bound where possible; audit | Required for current policy fidelity |
| Agency Client Assignment | Agency Account, Organization, status | Limits agency tenant access | Audit create/revoke | Required for agency beta |
| Business Context Access | Membership/role or assignment to Offer IDs, optional all-in-Organization | Never expands Organization access | Audit restricted Offer grants | Can defer if all Offers visible per Organization |
| Invitation | Email, target Account/Organization, role, token hash, expiry, inviter, state | Single-use activation | Audit issue/resend/accept/revoke | Required |
| Session | Opaque ID/hash, User, auth method, created/expires/revoked, MFA/assurance, active Account/Organization | Server-resolved scope | Rotate/revoke; audit anomalous activity | Required |
| Authentication Method | Provider/method metadata, verification and assurance | Attached to User | Recovery/MFA lifecycle | Required abstraction; advanced methods can wait |
| Audit Event | Actor, session, Account, Organization, action, target, outcome, reason, timestamp, request/correlation ID | Append-only | Retention/export policy | Required before sensitive beta |
| Impersonation Session | Admin, target, reason, start/end, restrictions | Explicit tenant preview | Immutable audit and visible state | Deferred; no beta impersonation |
| White-label Configuration | Agency, product name/logo/accent/policy | Agency boundary | Version and audit | Deferred beyond safe defaults |

### Decisions required before selecting an auth provider

- Server session format, duration, rotation, revocation, and cookie policy.
- Whether provider subjects map to a separate Authentication Identity table.
- Required beta login methods and whether MFA is mandatory for admins/finance.
- Invitation and verified-email behavior.
- Enterprise SSO timing and organization-domain claims policy.
- Step-up authentication for exports, financial reconciliation, credentials, billing, and impersonation.
- Account recovery and support verification policy.
- Regional/data-residency and audit-retention requirements.
- Whether the provider must support Organizations or TraceKit will own tenancy independently. The recommendation is that TraceKit owns authorization and tenancy regardless of provider.

## 9. Normalized Data Foundation

The repository already contains useful ledgers for people/identifiers, platform Orders, Journeys/events, attribution credits, payments/conversions, commissions, profit rollups, Connector jobs, and evidence-like raw events. The missing foundation is a canonical Organization/Offer registry and a governed relationship/evidence layer that all read models share.

### Minimum model for the first slice

| Object | Canonical identity and ownership | Mutable / time | Provenance, reconciliation, sensitivity |
| --- | --- | --- | --- |
| Organization | Opaque ID; maps legacy `workspace_id` | Name/status mutable | Tenant root; not sensitive |
| Brand | Opaque ID; Organization-owned | Mutable identity | Optional in first slice |
| Offer | Opaque ID; Organization-owned; source mappings | Commercial definition mutable with effective time | Product/price/funnel provenance |
| Product | Opaque ID; Organization-owned; source product/variant IDs | Mutable catalog; cost effective dates | COGS source required |
| Customer | Opaque person ID; Organization-owned | Profile mutable; identity merge history | PII; retention/deletion controls |
| Identifier | Opaque ID; Organization + Customer/Journey | Value observations append-only; verification mutable | Type, normalized hash, source, first/last seen; high sensitivity |
| Journey | Opaque ID; Organization + Customer + Offer | Status mutable; boundaries fixed when closed | Started/ended and evidence completeness |
| Touchpoint | Opaque event ID; Journey/Organization | Immutable normalized event | Event time and ingestion time; source evidence ID |
| Attribution Decision | Opaque/versioned ID; Journey/conversion | Append-only versions | Model/version, reason, credited touchpoint, Evidence links |
| Traffic Source / Campaign / Ad Set / Creative | Opaque IDs with source mappings; Offer-owned | Mutable names/status; effective time | Source-system provenance |
| Affiliate / Conversion | Opaque IDs; Organization/Offer/Journey | Conversion status may reconcile | Affiliate/source IDs; financial sensitivity |
| Order / Order Item | Opaque IDs; Organization, Customer, Offer | Status mutable; source facts versioned | Commerce source IDs; PII/financial |
| Payment | Opaque ID; Order | Status and settlement reconcile | Processor IDs; financial sensitive |
| Processor Fee | Opaque financial-event ID; Payment/Order | Append-only plus reversal | Expected formula version, observed event, reconciliation state |
| Refund / Chargeback | Opaque financial-event ID; Payment/Order | Lifecycle status mutable; events append-only | Processor evidence; financial sensitive |
| Shipment | Opaque ID; Order | Status mutable | Carrier/fulfillment source; tracking number sensitive |
| Shipping Charge | Order financial line | Source fact immutable per Order version | Commerce evidence |
| Shipping Cost | Shipment/Order financial event | Estimated then reconciled | Carrier/fulfillment/manual source |
| COGS Record | Product/Order item with effective date | Versioned | Configured/imported source and approver |
| Financial Event | Opaque ID; Organization/Order | Append-only with matching/reconciliation state | Source, event/ingestion time, currency, evidence |
| Connector / Sync | Opaque IDs; Organization | Status mutable; runs append-only | Credential reference, freshness, errors; secrets excluded |
| Evidence Record | Opaque ID; Organization, source object, hash, URI/payload reference | Immutable | Collected/occurred timestamps, provenance, retention class, sensitivity |
| Tracking Health Signal | Opaque ID; related object/event | Append-only observations; conclusion derived | Observed vs inferred, rule/version, Evidence links |

Every record requires a canonical ID, Organization ID, source-system identity mapping, event time where applicable, ingestion time, and provenance. Raw Evidence is immutable; corrections create superseding normalized facts or reconciliation decisions. PII, payment identifiers, credentials, raw URLs/query strings, and tracking numbers need field-level classification and retention policy.

## 10. First Real-Data Vertical Slice

### Recommendation

Use one direct Client Organization, one Offer, and a read-only data path combining:

1. **Shopify** for Customer, Product, Order, Order items, shipping charged, discounts, tax, and commerce status;
2. **TraceKit browser touchpoint ingestion** for one Journey, landing/click events, UTM and one attribution identifier such as `fbclid`;
3. **PayPal** for one payment, observed processor fee, settlement, refund/chargeback where present;
4. **Configured effective-dated COGS and actual shipping cost** for the proof, avoiding a fourth live integration.

If the selected merchant cannot reliably relate Shopify Orders to PayPal transactions, use the commerce/payment pair already proven by the existing WowBoost/WowPay connector runtime instead. The selection criterion is a stable transaction/order correlation, not vendor preference.

### Ingestion and normalization

- Webhooks or bounded incremental polling write source Evidence first with idempotency keys.
- Normalize to Organization, Offer, Product, Customer, Identifier, Journey, Touchpoint, Order/Item, Payment/Fee, Shipment costs, Financial Events, and Evidence relationships.
- Preserve source IDs and both event/ingestion timestamps.
- Build one Order read model; derive Customer and Offer summaries from the same normalized objects.
- Calculate Profit as Estimated until all configured required inputs arrive; mark Reconciled only after the reporting-period policy is satisfied.

### Repository methods activated

- Offer: `listOffers`, `resolveOffer`, one-Offer `loadWorkspace`, Profit-only `loadTrend`, limited `loadDrawer`.
- Customer: `listCustomers`, `resolveCustomer`, `loadWorkspace`, `loadJourney`, limited `loadDrawer`, exact `resolveDeepLink`.
- Order: `listOrders`, `resolveOrder`, `loadWorkspace`, `loadTimeline`, financial/identifier `loadDrawer`, exact `resolveDeepLink`.
- Mission Control: one Organization health/attention summary derived from the real Offer and freshness state.
- Search: exact Customer/Order/identifier lookup only, after the authorization gateway.

### Security requirements

- One persistent user and membership; no `dev_identity`.
- Server session and Organization derived from membership.
- Permission checks for Customer PII, Order financials, and Evidence.
- No client-selected tenant boundary.
- Audit sensitive lookup, raw Evidence access, export, configuration, and reconciliation.
- Secrets stored server-side; connector payloads never returned directly.

### Acceptance criteria

- One real Order can be followed from Mission Control through Offer, Customer, Order, Explain, and immutable Evidence.
- Universal Search exact-matches its stable identifiers without cross-tenant leakage.
- Profit line values link to source Evidence and state whether Estimated or Reconciled.
- Processor expected/observed fee and shipping margin reproduce source inputs.
- A user without PII/financial capabilities receives masked/qualified views server-side.
- Cross-Organization object IDs return not found/denied without revealing existence.
- Every returned record includes freshness and provenance adequate for Explain.

Compare Mode, broad fuzzy search, multiple media platforms, live Intelligence, agency cross-client comparison, forecasting, and full MCP remain mocked or disabled for this slice.

## 11. Universal Search Readiness

### Beta requirements

- A tenant-scoped index of Offers, Customers, Orders, Journeys, Evidence references, and exact identifiers.
- Exact normalized/hash lookup for email, phone, Order ID, Customer ID, Journey ID, transaction/payment IDs, `fbclid`, `gclid`, and affiliate transaction IDs.
- Server-side permission filtering before result serialization.
- Canonical production deep links only.
- PII masking in titles/subtitles where the capability is absent.
- No raw sensitive query in retained logs; use audit-safe hashes and reasoned retention.
- Per-user and per-Organization rate limits and audit events for sensitive identifiers.
- Agency searches require an explicit active client Organization; no silent global cross-client search for beta.

Fuzzy names, ranking personalization, cross-Organization search, typo tolerance, and semantic search are post-beta. Current real search is **BLOCKED** because it accepts caller scope, returns sensitive fields, and emits legacy routes.

## 12. MCP Readiness

MCP is currently a shell Drawer placeholder. There is no production MCP server/tool boundary for the migrated repositories.

### Beta-capable Core MCP requires

- Tools built on the same authorized application services as Workspaces, never direct connector/database access.
- Server propagation of User, Membership, active Organization, Business Context, permissions, and data scope on every call.
- Read tools for scoped Offer/Customer/Order lookup, Explain, Evidence, and canonical deep links.
- Structured Evidence citations containing stable Evidence IDs, provenance, and freshness.
- Explicit unsupported/insufficient-evidence responses; no fabricated conclusions.
- Durable audit records for prompt, tool calls, objects accessed, sensitive fields returned, and outcome, with appropriate redaction.
- Rate limits, prompt-injection-resistant connector boundaries, and no secret/raw credential exposure.

For beta, MCP can remain disabled or limited to deterministic read-only questions over the first vertical slice. Mutating tools, broad cross-Organization agency questions, proactive behavior, and custom agents are post-beta. TraceKit Intelligence remains a separate later phase and must not be implemented as MCP Chat styling.

## 13. Settings and Connected Systems Dependencies

### Settings Experience dependencies

- User profile and authentication methods.
- Account, Organization, membership, invitations, roles, grants, and denials.
- Security policy: session management, MFA/SSO readiness, recovery, audit access.
- Billing ownership at Platform/Agency/Client Account levels.
- API keys with hashing, scope, rotation, last-used, and revocation.
- Notification preferences and delivery policy.
- Sensitive-data, export, and financial visibility policy.

### Connected Systems Workspace dependencies

- Organization-owned Connector registry and connector capability types.
- Credential vault references rather than credentials in application tables or UI payloads.
- Connection state, credential health, source account/store identity, and permissions granted.
- Sync/import runs with cursor, time range, status, freshness, counts, errors, retries, and last success.
- Evidence provenance from Connector → sync → source record → normalized object.
- Safe run-now/retry/cancel permissions, idempotency, rate controls, and audit events.

Future storyboards should use these boundaries and must not make Connector configuration the tenant model or allow a Business Context to substitute for Organization scope.

## 14. Risks and Blockers

1. **SECURITY BLOCKER:** anonymous same-origin requests are elevated with the platform secret.
2. **SECURITY BLOCKER:** tenant `workspace_id` is caller-controlled/defaulted.
3. **BLOCKED:** no persistent User, Membership, Organization mapping, or server session.
4. **HIGH:** real Search exposes sensitive fields and legacy deep links without user authorization/audit.
5. **HIGH:** privileged Supabase access lacks comprehensive tenant RLS defense in depth.
6. **HIGH:** real and mock route contracts coexist, creating duplicate Customer/Order destinations.
7. **PARTIAL:** Offer-to-child and Customer-to-Order links often filter lists instead of selecting exact objects.
8. **PARTIAL:** Organization and Business Context are client state, not canonical URL/server state.
9. **PARTIAL:** Mission Control repository has no explicit scope parameter.
10. **PARTIAL:** repository error/loading/freshness behavior is uneven across Workspaces.
11. **BLOCKED:** no canonical Offer registry mapping existing source Offer IDs into Organization-owned Business Contexts.
12. **DEFERRED:** MCP, Intelligence, Compare with real data, and broad fuzzy search.

## 15. Recommended Implementation Sequence

### Phase 1 — Core Flow Hardening (M)

**Objective:** Make all mock flows canonical and deterministic before introducing security or data complexity.  
**Prerequisites:** Current four committed migrations.  
**Deliverables:** one deep-link specification and parser package; exact-object Offer→Customer/Order and Customer→Order links; remove migrated Workspaces from legacy search routes; canonical history replacement; error/freshness states; expanded navigation tests.  
**Risks:** accidentally breaking legacy operational routes.  
**Acceptance:** all 18 audited flows have tests; no production core link targets legacy or concept routes; hard refresh/back/forward preserve canonical state.

### Phase 2 — Persistent Identity and Tenancy (L)

**Objective:** Establish provider-neutral persistent identity and tenant records.  
**Prerequisites:** decisions listed in Section 8.  
**Deliverables:** User, Authentication Identity, Account, Organization, Membership, role/override, assignment, invitation, session, audit-event designs and services; mapping from Organization to legacy workspace. No vendor selection is implied.  
**Risks:** confusing Account, Organization, and existing `workspace_id`; agency assignment complexity.  
**Acceptance:** representative users resolve deterministic memberships and Organizations after refresh; revocation takes effect; no development identity in beta mode.

### Phase 3 — Server-Side Authorization (L)

**Objective:** Ensure every browser request is authenticated and tenant-scoped.  
**Prerequisites:** Phase 2.  
**Deliverables:** server request context; route/service permission map; membership-derived Organization scope; sensitive/financial guards; CSRF/origin policy; rate limits; audit events; removal of anonymous admin-secret elevation.  
**Risks:** large legacy API surface and privileged Worker client.  
**Acceptance:** cross-tenant/security tests pass; direct proxy calls without session fail; client-supplied Organization never grants scope; mutations are permissioned/audited.

### Phase 4 — Normalized Data Foundation (XL)

**Objective:** Make existing ingestion and ledgers serve canonical product objects.  
**Prerequisites:** Organization mapping and authorization context.  
**Deliverables:** canonical Offer/Product registry; source ID mappings; Evidence records; relationship graph; reconciliation/freshness vocabulary; materialized Order/Customer/Offer read models.  
**Risks:** inconsistent legacy `default` workspace, duplicate identities/orders, incomplete source correlation.  
**Acceptance:** one normalized fixture produces deterministic snapshots with provenance and no connector schemas in UI types.

### Phase 5 — First Real-Data Vertical Slice (L)

**Objective:** Prove one secure end-to-end business decision.  
**Prerequisites:** Phases 2–4.  
**Deliverables:** recommended source ingestion; one Organization/Offer/Customer/Order/Journey; Profit and Evidence chain; repository adapters; Mission Control summary.  
**Risks:** transaction correlation and incomplete financial inputs.  
**Acceptance:** Section 10 criteria pass with real data and permission variants.

### Phase 6 — Universal Search (M)

**Objective:** Replace mixed search with one authorized exact-match service, then add ranking.  
**Prerequisites:** canonical IDs, authorization, Evidence links.  
**Deliverables:** scoped index, exact identifiers, masking, canonical links, rate/audit controls; later fuzzy ranking.  
**Risks:** PII leakage through queries/logs and existence disclosure.  
**Acceptance:** cross-tenant and sensitive-data tests pass; every result opens the intended production object and Evidence.

### Phase 7 — MCP (L)

**Objective:** Add reactive, evidence-citing Core questions over authorized repositories.  
**Prerequisites:** real repositories, Search, audit, stable Explain/Evidence.  
**Deliverables:** read-only tool/resource contracts, permission propagation, citations, unsupported-answer policy, audit/rate controls.  
**Risks:** unsupported claims, prompt injection, scope leakage.  
**Acceptance:** every answer is scoped, traceable, and links to the same Workspace truth; insufficient Evidence produces an explicit limitation.

### Phase 8 — Settings and Connected Systems (XL)

**Objective:** Productize tenant administration and ingestion operations.  
**Prerequisites:** identity, authorization, Connector registry, audit.  
**Deliverables:** approved storyboards, Settings implementation, Connected Systems Workspace, credential health, sync history/freshness/error controls.  
**Risks:** credential exposure and unsafe operational mutations.  
**Acceptance:** permissioned, audited configuration and operations without exposing secrets.

## 16. Beta Readiness Checklist

- [ ] No browser route elevates an unauthenticated request with the platform secret.
- [ ] A server session resolves User, Membership, Account, Organization, permissions, and data scope.
- [ ] Client-supplied Organization/workspace identifiers are validated, never trusted.
- [ ] Agency assignments and direct-client isolation have cross-tenant tests.
- [ ] Sensitive Customer and financial fields are enforced server-side.
- [ ] Canonical Organization, Offer, Customer, Order, Journey, and Evidence IDs exist.
- [ ] Legacy `workspace_id` values map explicitly to Organizations; `default` is not a beta fallback.
- [ ] The core flow uses one versioned deep-link contract and survives hard refresh/history.
- [ ] Search is scoped, masked, rate-limited, audited, and emits only production links.
- [ ] One end-to-end real Order reconciles to Evidence with Estimated/Reconciled semantics.
- [ ] Read models expose freshness, source provenance, and partial/error states.
- [ ] Raw Evidence access and sensitive exports are audited.
- [ ] Connector credentials are vault-backed and never serialized to Workspace clients.
- [ ] Incident response, session revocation, backup, retention, and deletion policies are approved.
- [ ] Manual accessibility, responsive, browser-history, and permission-variant reviews pass.

## 17. Deferred Work

- Live TraceKit Intelligence, forecasts, recommendations, and proactive briefings.
- Real Offer Compare across multiple contexts and cross-Organization comparison.
- Broad fuzzy/semantic Search and personalization.
- Mutating MCP tools and custom agents.
- Product Admin impersonation/tenant preview.
- Enterprise SSO, custom domains, advanced white labeling, and full billing integration.
- Additional Workspace migrations.
- Multi-media-source optimization and predictive attribution.

## 18. Appendices

### A. Permission inventory relevant to the core flow

| Area | View | Additional capability |
| --- | --- | --- |
| Organization | `organizations.view` | `organizations.manage` |
| Offer | `offers.view` | `offers.manage` |
| Customer | `customers.view` | `customers.view_sensitive_data`, `customers.export` |
| Order | `orders.view` | `orders.view_financials`, `orders.export` |
| Financial | `financials.view` | `financials.reconcile` |
| Connector/import | `connectors.view`, `imports.view` | `connectors.manage`, `imports.manage` |
| Audit | `audit_logs.view` | — |

These identifiers are suitable as the application authorization vocabulary, but role defaults require policy review and persistent versioning before beta.

### B. Repository interface inventory

```text
MissionControlRepository
  getMissionControl()

OfferRepository
  listOffers(scope)
  resolveOffer(scope, offerId)
  loadWorkspace(scope, offerId)
  loadTrend(scope, offerId, range, measures)
  loadComparison(scope, offerIds)
  loadDrawer(scope, offerId, drawerId)
  search(scope, query)

CustomerRepository
  listCustomers(scope, filter)
  resolveCustomer(scope, customerId)
  loadWorkspace(scope, customerId)
  loadJourney(scope, customerId)
  loadDrawer(scope, customerId, drawerId)
  search(scope, query)
  resolveDeepLink(scope, state)

OrderRepository
  listOrders(scope, filter)
  resolveOrder(scope, orderId)
  loadWorkspace(scope, orderId)
  loadTimeline(scope, orderId)
  loadDrawer(scope, orderId, drawerId)
  search(scope, query)
  resolveDeepLink(scope, state)
```

### C. Audit evidence and limitations

The audit inspected the production route tree, shell authorization, identity state, repository interfaces and mocks, deep-link utilities, command palette, API proxies, Worker administrative authentication, normalized domain services, Supabase migrations, and tests. It exercised representative routes through HTTP and repository/authorization behavior through the automated suites. No source code was changed. Interactive browser automation was unavailable, so the manual gaps listed in Section 3 remain explicit.

Validation results:

- UI lint: passed.
- TypeScript `--noEmit`: passed.
- UI repository, authorization, deep-link, and shell tests: 40 of 40 passed.
- Production build: passed; existing Recharts static-generation dimension warnings remain.
- Worker/API tests: 626 of 629 passed. The three failures are stale application-shell/Home structural assertions (`application shell reorganizes existing routes around business navigation`, `home command center consumes one composed Home API and preserves overview compatibility`, and `home UI proxy and compatibility route are present`) after the approved Mission Control production migration. They are not caused by this documentation-only audit, but must be reconciled in Core Flow Hardening.
- Representative `client-admin`, `agency-owner`, `agency-team`, `client-analyst`, `client-read-only`, and `platform-admin` routes returned HTTP 200. Authorized and denied outcomes render client-side within that response.
- The requested representative ID `agency-member` is not registered; the current mock ID is `agency-team`. An invalid development identity silently falls back to a persisted/default identity, which is acceptable only for mock review and must become an explicit invalid-session outcome in production.

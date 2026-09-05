# TraceKit capability manifest

This manifest is the durable inventory of functionality established on the
recovery branch. The capability regression gate checks the source entrypoints
behind implemented items before merge or production promotion.

## Identity / access

- **Implemented:** WorkOS authentication and callback flow
- **Implemented:** persistent TraceKit users
- **Implemented:** account/organization tenancy
- **Implemented:** membership/RBAC foundation
- **Implemented:** first-admin bootstrap
- **Planned / rebuild-required:** Team Management (member administration, invitations, role-management UI)

## Core UI

- **Implemented:** Dashboard
- **Implemented:** Connections
- **Implemented:** Commerce Connections
- **Implemented:** Journeys
- **Implemented:** Customers / People
- **Implemented:** Money / Profit
- **Implemented:** Financial Reconciliation
- **Implemented:** Financial Import Monitor

## Commerce

- **Implemented:** Commas connection UI
- **Implemented:** Commas credential encryption
- **Implemented:** bounded Commas validator
- **Implemented:** 29Next connection UI
- **Implemented:** 29Next encrypted credential storage and read-scope verification
- **Implemented:** 29Next bounded historical and incremental ingestion for orders, subscriptions, and disputes
- **Implemented:** 29Next signed-webhook verification and durable receipt idempotency
- **Implemented:** 29Next scheduler/dispatch foundation with activation disabled by default
- **Implemented:** Evidence ingestion
- **Implemented:** canonical orders
- **Implemented:** order lines
- **Implemented:** refunds
- **Implemented:** provider products
- **Implemented:** commerce ledger events
- **Implemented:** continuous-shadow runtime
- **Implemented:** `continuous-commerce` queue wiring

## Platform foundations

- **Implemented:** TKID
- **Implemented:** Evidence
- **Implemented:** identity resolution
- **Implemented:** append-only/audit history where implemented
- **Implemented:** reconciliation
- **Implemented:** 29Next (M2–M12 backend foundation plus customer connection UI; live production activation remains gated by M12 validation)


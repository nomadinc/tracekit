# WS-008 — 29Next Connection — M1 Architecture Audit

Status: PASS WITH COORDINATION CONSTRAINTS

Baseline: `main` @ `5320a1a5f410ad80e9b39be1620ccf5fe20f1777`

Workstream branch: `workstream/29next`

## Baseline decision

Use `main` as the 29Next baseline.

Do not base 29Next on `recovery/current-tracekit-ui`, `workstream/shopify`, `workstream/shopify-m5`, or the legacy `feature/shopify-connector` branch. Those branches contain useful provider-specific or historical reference work, but they are either heavily diverged, Shopify-specific, or disconnected from the current `main` history.

## Existing TraceKit foundations to reuse

29Next must use the existing provider-neutral commerce architecture rather than create a parallel connection system.

Relevant existing foundations include:

- persistent identity, tenancy, and organization ownership
- `commerce_provider_connections`
- `commerce_provider_accounts`
- encrypted/versioned `commerce_provider_credentials`
- `commerce_sync_runs` and lease/heartbeat recovery
- `commerce_sync_checkpoints`
- immutable `commerce_evidence_records`
- `commerce_source_mappings`
- provider product discovery and canonical offer mapping
- person source identities
- normalized `platform_orders`
- append-only financial events in `conversions`
- refund normalization and dispute/chargeback reconciliation
- historical backfill and continuous-commerce infrastructure
- repository activation / shadow / live-beta controls

Key migrations include `038_persistent_identity_and_tenancy.sql`, `039_commerce_persistence_v1.sql`, `040_commerce_control_plane_v1.sql`, `042_commerce_evidence_storage_v1.sql`, `043_commerce_shadow_ingestion_v1.sql`, `044_commerce_refund_normalization_v1.sql`, `045_commerce_dispute_reconciliation_v1.sql`, `050_continuous_commerce_intelligence_v1.sql`, `064_commerce_sync_frequency.sql`, and `071-080` dispute/backfill/ordering infrastructure.

## Canonical object mapping

### Orders

29Next orders should normalize into `platform_orders`, preserving provider IDs, organization/connection/provider-account scope, evidence references, reconciliation state, and data-quality state.

### Financial transactions

29Next sales, fees, refunds, chargebacks, chargeback reversals, and other economic events should project into the append-only `conversions` ledger using provider-scoped idempotency keys and source mappings.

### Customers

29Next customer identity should use `people` plus `person_source_identities`. Provider customer IDs are authoritative only inside the connection. Email and phone remain supporting evidence, not global merge keys.

### Products / offers

29Next products/variants should use `commerce_provider_products` and map to the canonical offer hierarchy (`canonical_offers`, `offer_steps`, `offer_variants`).

### Refunds and disputes

Reuse the existing provider-neutral refund and dispute/chargeback normalization/reconciliation surfaces. Do not create 29Next-only financial truth tables unless a documented provider field cannot be represented without loss.

## Subscription gap

TraceKit does not currently have a first-class canonical subscription object.

`offer_steps.role = 'subscription'` models an offer role, not a customer's subscription lifecycle. It cannot represent subscription state, billing cadence, next billing date, cancellation, pause/retry state, source subscription identity, or rebill lineage.

Therefore 29Next should not force subscription state into `platform_orders`, `commerce_provider_products`, or generic metadata as the primary model.

Recommended shared addition: a provider-neutral canonical commerce subscription surface, created only after coordination with other active commerce workstreams. Provider-specific ingestion can begin before this shared migration lands.

## Incremental and backfill strategy

Preferred architecture:

1. Historical backfill through the shared sync-run/checkpoint/evidence runtime.
2. Provider webhook ingestion for low-latency changes where supported.
3. Scheduled overlap/catch-up verification for durability and missed-event recovery.
4. Idempotent source mappings and append-only financial projection.

Do not assume a provider `updated_since` list filter unless it is explicitly documented or live-validated.

## Collision audit

### SAFE — 29Next workstream owns

- provider-specific API client and auth adapter
- provider-specific types/parsers
- provider-specific normalizers
- provider-specific evidence adapter
- provider-specific sync orchestration that consumes shared runtime interfaces
- provider-specific webhook verification/dispatch logic
- 29Next-specific tests and fixtures
- 29Next documentation

### COORDINATION REQUIRED

- new shared migrations
- canonical subscription schema
- provider registries / connection-picker UI
- shared control-plane behavior
- shared scheduler dispatch
- generic commerce runtime interfaces
- common normalized writers
- shared source-mapping enum/constraint expansion
- connection overview UI

These surfaces may collide with active Shopify or other commerce work.

### DO NOT TOUCH YET

- Everflow-specific migrations, scheduler, reconciliation, or linkage logic
- Commas production runtime, economic allocation, canonical catalog, or deep-reconciliation logic
- Shopify workstream branches
- production connection activation
- production credentials or provider mutations

## Regression gates

Before 29Next changes are considered mergeable:

- API test suite: `npm test` in `api`
- UI test suite: `npm test` in `ui`
- UI build: `npm run build` in `ui`
- existing connector/runtime regression tests must remain green
- provider-specific 29Next tests must cover auth failure, pagination, idempotency, evidence persistence, tenant scope, retry behavior, malformed payloads, and duplicate delivery
- no provider credential plaintext may enter metadata, logs, evidence metadata, or browser-visible payloads
- all provider writes must remain server-authorized and organization-scoped

## M1 verdict

PASS WITH COORDINATION CONSTRAINTS.

There is no need for a parallel 29Next connection architecture. The current TraceKit commerce framework is sufficient for connection management, tenancy, credentials, sync runs, checkpoints, evidence, orders, products, identities, refunds, disputes, and append-only financial events.

The only material shared-model gap identified in M1 is first-class subscription lifecycle persistence. That gap should be solved provider-neutrally and coordinated before introducing a shared migration.

## M2 recommended sequence

1. Build provider-specific 29Next client/auth/types with no shared-schema changes.
2. Add read-only connection verification and capability discovery.
3. Implement order/product/customer/transaction pagination into immutable evidence.
4. Implement normalization for orders, customers, products, and financial transactions using existing canonical surfaces.
5. Add provider webhook verification and idempotent event ingestion.
6. Coordinate and add the canonical subscription model.
7. Implement subscription/rebill normalization against that shared model.
8. Add historical backfill and scheduled overlap verification.
9. Run bounded shadow validation before any live repository activation.

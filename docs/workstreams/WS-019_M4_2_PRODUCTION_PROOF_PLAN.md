# WS-019 M4.2 Production Acceptance Plan

This plan is read-only except for an explicitly approved Work Item fixture transition and Notification presentation-state update. It does not authorize execution.

## Preconditions

- Authenticate through the supported WorkOS application flow.
- Enter the approved Stem Labs Admin Client View and record the server-resolved organization ID.
- Prove effective `organizations.view`, `actions.execute`, and `audit_logs.view` through the authenticated application session.
- Approve a distinct synthetic/fixture tenant identifier. Do not inspect that tenant's private records.
- Confirm the deployed Core uses side-effect-free Work Item and Notification reads. `GET /api/work-items` and `GET /api/notifications` must not be used as materialization triggers.

## Evidence sequence

1. Snapshot the active organization's `work_items`, `work_item_activity`, and `notification_states` counts and update timestamps. Read the bounded Work Item list through `/api/work-items?limit=10&cursor=0`; require every returned `workspace_id` to equal the active organization, then prove the snapshot is unchanged except for the allowed `membership.resolved` session audit.
2. Submit a foreign `workspace_id` on list/detail and require a non-disclosing 404 before the Core request.
3. Submit a foreign Work Item ID and require a non-disclosing 404 with no activity or data change.
4. If a disposable non-customer-impact Work Item fixture is approved, perform one allowed transition, then prove its activity row records the authenticated user and active tenant. Repeat the now-invalid transition and require 409 with no second transition. If no fixture exists, leave this production gate blocked.
5. Submit a foreign workspace or actor hint to the transition route and require a non-disclosing rejection before the Core request.
6. Snapshot the same persistence boundaries, then read Notifications through `/api/notifications?limit=10&cursor=0`; require the active organization scope and prove the snapshot is unchanged. Submit foreign workspace/detail/update requests and require rejection with no notification-state change.
7. Read `/api/audit-events?limit=50`; require `scope=active_organization`, bounded pagination, `audit_logs.view`, and only active-organization events. Submit tenant identifiers and verify they are ignored by contract because the endpoint accepts no caller tenant scope.
8. In platform context, verify account-scoped audit visibility; enter Admin Client View and verify the same endpoint becomes organization-scoped. Correlate the existing `admin.client_view.entered`/`exited` audit events.

## Evidence to retain

Capture timestamps, request correlation where available, active session identity and organization, response status, row counts, and before/after counts for every authorized non-destructive mutation. Do not retain cookies, tokens, credentials, or foreign-tenant contents.

## Production certification result — PASS

Observed against Production deployment `dpl_CN4SpxQG34FDUnpvyUpcQdxoDg5F` and authoritative main descendant `c66898c5772e435caa6d88261aed2c6b7e4f7c7a` on 2026-10-04.

### Phase A

- Same-tenant Work Item and Notification reads returned the server-derived Stem Labs scope (`8f6bb14b-2126-49b8-bfdb-c60edbc3549b`).
- Work Item and Notification tenant-negative reads returned no foreign data.
- Audit reads enforced `audit_logs.view`, active-Organization scope, bounded pagination, and tenant-negative isolation.
- Platform context without an active client failed closed.
- Transactional before/after snapshots proved Work Item and Notification GETs caused zero Work Item, activity, or notification-state writes.

### Phase B fixture

The retained fixed-purpose fixture is:

`work_item:8f6bb14b-2126-49b8-bfdb-c60edbc3549b:manual:ws019.m4.2.phase_b`

- Source/key: `manual` / `ws019.m4.2.phase_b`
- Type: `production_acceptance_fixture`
- Lifecycle: `not_applicable`
- Final status: `resolved`
- Recurrence: `1`
- Resolution: `acceptance_complete` — `WS-019 M4.2 Phase B disposable acceptance fixture completed.`
- Resolver and every lifecycle actor: `cbfaeaf7-fa83-4235-9011-af3ae7ce9101` (Anthony McCabe)
- Final fixture hash: `437df876fc66bd807447a33cb81b8eb5`

The fixture remains retained as certification history. No supported delete/archive operation exists, and none was attempted.

### Lifecycle evidence

| Sequence | Activity ID | Domain event ID | Transition | Occurred at |
|---:|---|---|---|---|
| 1 | `af5dadd6-bb2a-4699-8e31-24d8eb2bd856` | `fc9dde4d-93a3-439f-aa6d-b42d1d819494` | created/open | `2026-10-04T22:10:30.068Z` |
| 2 | `dfe52c79-21ba-4b3f-a139-7dceff9fb5de` | `fda31c4b-4604-4728-a0db-5d112bc1663c` | open → acknowledged | `2026-10-04T22:18:30.254Z` |
| 3 | `43d3cbf9-6e8e-44f0-9c73-2bbbc947be35` | `93d63fd7-f07a-43bf-9572-11dda5f425ce` | acknowledged → resolved | `2026-10-04T22:23:37.044Z` |
| 4 | `96ee89b5-2842-48c2-bedc-6cc58964043b` | `91aac332-5672-4ecf-b1a6-5b3c1e00b36d` | resolved → open | `2026-10-04T22:26:26.885Z` |
| 5 | `8370b3e2-9a93-46e6-bf01-ab110a051a0f` | `6ff6b5c4-2e6d-45a2-84f7-f3b5debae4df` | open → resolved | `2026-10-04T22:31:59.056Z` |

The transition events use stable correlation `ws019.m4.2.phase_b`; creation uses session correlation `956fd33a-906d-4f98-990f-6c41a86cf10e`. Final durable counts are five activities, five domain events, five activity-group links, two activity groups, and ten workspace updates. Projection failures are zero.

### Negative and idempotency evidence

- Repeating fixed fixture creation returned `created:false`, `idempotent:true`, and produced zero lifecycle delta.
- Caller-supplied synthetic `workspace_id` on mutation returned non-disclosing HTTP 404 before Core mutation.
- Caller-supplied synthetic `actor_id` returned the same non-disclosing HTTP 404 before Core mutation.
- Every authorized transition derived tenant and actor from the authenticated ApplicationSession and passed `actions.execute`.

### Side-effect boundary

Across creation, replay, negative requests, and all four transitions:

- `notification_states` remained `0`.
- External-action audit remained `0`.
- External-mutation audit remained `4`, hash `0847e4e30b051e7257ffe48b1322a0e8`.
- No provider action was attributable to the fixture lifecycle.
- No customer, order, connector, connection-pause, or unrelated Work Item mutation was attributable to the fixture lifecycle.
- Ordinary scheduler/import work observed in overlapping windows was separated by connection, object identity, timestamp, and absence of fixture correlation.

### M4.2 release gates

`permission_rbac`, `tenant_negative_reads`, `tenant_negative_mutations`, `authorized_work_item_transitions`, and `audit_visibility` are Production-proven for the frozen V1 contract. M4.2 is PASS. This evidence does not by itself declare Production V1 ready.

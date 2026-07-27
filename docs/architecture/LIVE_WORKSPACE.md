# TraceKit Live Workspace

TraceKit's Live Workspace layer extends the existing Cloudflare Worker API,
Supabase persistence, and Next.js App Router UI. It does not replace the
browser ingestion, identity, journey, attribution, commission, payout, health,
notification, event explorer, or work item systems.

## Repository Reconnaissance

- Frontend: Next.js App Router in `ui/app`, with shared shell components in
  `ui/components/layout`, direct `fetch` data loading in client components, and
  local component state rather than a query-cache library.
- API runtime: Cloudflare Worker TypeScript entrypoint in `api/src/index.ts`.
  Existing `/v1/*` route dispatch is function-based and uses small route matcher
  helpers from feature modules.
- Database: Supabase/Postgres with additive SQL migrations in
  `supabase/migrations`. Current migrations use `create table if not exists`,
  `alter table ... add column if not exists`, idempotent indexes, and comments.
- Workspace scoping: most API requests accept `workspace_id`, normalized to
  `default` when absent. Tables are workspace-scoped with `workspace_id` text.
- Authentication: worker maintenance/business endpoints use `x-tk-secret` or
  `Authorization: Bearer` through `adminAuthError`. The Next.js API proxies add
  the server-side secret for browser-facing UI requests.
- Existing operational tables: `work_items`, `work_item_activity`,
  `notification_states`, `journey_events`, `journeys`, `browser_events_raw`,
  `journey_attribution_credits`, `affiliate_commissions`, `integration_import_jobs`,
  `connector_import_tasks`, and Health-derived notification/work item state.
- Product surfaces: Home, Operations Center, Notifications, Customer 360,
  Journey Explorer, Event Explorer, Global Search, Entity Preview, and the
  Investigation Drawer already exist and use direct route-specific fetches.
- Event infrastructure: Cloudflare Queues exist for bounded runtimes, but there
  is no existing workspace-safe realtime stream or persistent domain event
  outbox. Event Explorer already owns `/v1/events`; the live SSE route must be
  matched before `/v1/events/:event_key` detail routing.
- Tests and checks: API tests run with `npm test` in `api`; Identity runtime has
  `npm run test:identity-backfill-runtime`; UI checks are `npm run build`,
  `npm run lint`, and `npx tsc --noEmit` in `ui`; Worker validation uses
  `npx wrangler deploy --dry-run` in `api`.

## Fit

The Live Workspace layer uses the smallest reliable extension:

1. Business services publish validated, workspace-scoped domain events after
   authoritative writes succeed.
2. Domain events are persisted in `domain_events` with a monotonic replay
   position and workspace-scoped deduplication keys.
3. Synchronous, idempotent projections create browser-safe `workspace_updates`
   and deterministic `activity_groups`.
4. `GET /v1/events/stream` streams only safe workspace update envelopes with
   replay via `Last-Event-ID`.
5. The Next.js app owns one EventSource connection per workspace and dispatches
   deduped update signals to existing pages, which then perform targeted
   route-specific reloads.

The first native producer is the Work Item lifecycle because it already has a
clear service boundary and user-facing state changes. Other engines can add
producers later through the same publishing boundary without changing SSE or
frontend wiring.

## Authoritative Workflow Findings

| Workflow | Authoritative path | Tables written | Boundary and idempotency | Live producer notes |
| --- | --- | --- | --- | --- |
| Platform orders | Connector import functions in `api/src/index.ts`, plus journey backfill mapping in `api/src/journey-events.ts` | `platform_orders`, later `journey_events` | Connector imports upsert by stable `platform_order_id`; journey events dedupe by workspace/platform/connector/source record/event type. | Phase 2 publishes purchase lifecycle events after `journey_events` purchase rows are retained. Connector-specific platform order upserts remain authoritative. |
| Purchases | `createJourneyEventsBatch()` called from browser normalization and platform-order journey backfill | `journey_events`, `browser_events_raw`, `journeys` during assignment | Batch insert first checks existing idempotency keys and recovers unique races. | `purchase.received` and `purchase.completed` use stable journey/source IDs and a purchase lifecycle correlation ID. |
| Refunds and chargebacks | Payment/connector import paths append financial rows through existing ledger/conversion helpers and then flow into `journey_events` where supported | `conversions`, `payment_transactions`, `profit_*` rollups, `journey_events` | Append-only ledger rows use stable external transaction identifiers. | Phase 3 publishes `refund.received` and `chargeback.received` only after retained `journey_events` adjustment rows exist. Ledger formulas and payment connector logic remain unchanged. |
| Identity resolution | `resolveIdentityForSourceRecord()` and `createIdentityService()` in `api/src/identity-service.ts`; browser normalization invokes the service | `people`, `person_identifiers`, `identity_resolution_events`, source record `person_id` fields | Repository methods use workspace scoping, active identifier uniqueness, and 23505 concurrent-winner recovery. | Browser identify/lead/purchase normalization publishes `identity.created`, `identity.matched`, or `identity.conflict_detected` after the service returns. The identity matching rules are unchanged. |
| Attribution | `persistAttributionCredits()` and `replace_journey_attribution_credits` RPC in `api/src/attribution.ts` | `journey_attribution_credits` | Credits are grouped by workspace/conversion/model/version; already-current results skip writes; recalculation replaces through the RPC. | `attribution.generated` and `attribution.changed` publish after successful credit replacement. |
| Commission creation | `generateAffiliateCommissions()` in `api/src/payouts.ts` | `affiliate_commissions` | Commission event IDs are deterministic; unique constraints prevent duplicate payable rows by conversion. | `commission.created` publishes only for newly inserted commission rows, never for dry runs or duplicate reruns. |
| Commission adjustment/reversal | Payout ledger model supports statuses and immutable commission rows, but no separate adjustment workflow was changed in this pass | `affiliate_commissions` | Existing payout idempotency remains in force. | Domain event helpers support `commission.adjusted` and `commission.reversed`; producers should be added at the future adjustment/reversal write path. |
| Connector synchronization | Connector Runtime task execution in `api/src/index.ts`; job/task helpers in `api/src/connector-runtime.ts` | `integration_import_jobs`, `connector_import_tasks`, connector-specific staging tables | Task dedupe keys, atomic task locking, queue retry, stale recovery, and job progress preserve resumability. | Phase 3 publishes `connector.delivery_failed` at permanent task failure and `connector.recovered` when a retried/error task completes. Queue semantics are unchanged. |
| Connector failures | Queue/runtime catches persist task/job errors and `integration_import_errors` | `connector_import_tasks`, `integration_import_errors`, `integration_import_jobs` | Existing retry and stale-lock rules classify transient/permanent failures. | Repeated failures dedupe by connector/job/task incident key and update the same Activity Intelligence group. |
| Reconciliation cases | PayPal/WowBoost reconciliation routes and runtime tasks update matched IDs and warnings | `payment_transactions`, `platform_orders`, runtime job tables | Exact-reference dedupe and confidence rules remain authoritative. | Phase 3 publishes `reconciliation.matched` after the existing PayPal commerce-reference RPC updates a transaction match. Matching rules are unchanged. |
| Health calculations | `getWorkspaceHealthReport()` in `api/src/health.ts` | Read-only report; Work Item sync may update `work_items` | Health Engine is source of truth; dashboard and notifications consume it. | Health event names are supported by projections. Producer should compare previous materialized health state before emitting to avoid recalculation noise. |
| Notifications | `getWorkspaceNotificationReport()` and `upsertNotificationReadState()` in `api/src/notifications.ts` | `notification_states`; notifications themselves are Health-derived | Read state is idempotent by workspace/notification. | `notification.created` remains a projection/audit event and must not recursively create another notification. |

## Privacy And Replay

Domain event payloads are validated and redacted before storage. Workspace
updates are a separate browser-safe projection and must never stream raw
connector payloads, tokens, credentials, card data, or unnecessary contact data.
The replay cursor is the numeric `workspace_updates.update_position`, not UUID
ordering or browser-local timestamps.

## Producer And Correlation Conventions

- Purchase lifecycle: `purchase:{workspace}:{platform}:{purchase_id}` groups
  purchase, identity, attribution, commission, refund, and chargeback activity
  whenever the source record exposes the same deterministic purchase identity.
- Attribution and commissions use the conversion event ID as the purchase
  correlation anchor because the Attribution Engine treats
  `journey_events.id` as the immutable conversion reference.
- Connector incidents should use a connector incident key, usually workspace,
  connector, error class, and retry window, so repeated record failures aggregate
  into one operational narrative.
- Reconciliation should use the stable reconciliation case or external
  reference. If only heuristic matching exists, the event should say so in
  payload metadata and avoid claiming deterministic certainty.
- Causation is only set when the immediate triggering event is known. Producers
  should prefer leaving it empty over inventing a causal link.

## Phase 3 Audit Findings

The Phase 2 replay implementation had four material hardening gaps:

- `POST /v1/events/projections/replay` accepted arbitrary `consumer_name` and
  `from_position` from any caller with the shared admin secret.
- `continue_on_error=true` could advance the consumer cursor beyond a failed
  event, hiding gaps behind a later cursor.
- Replay had no explicit concurrency lease, so two runners could race. The
  projections were idempotent, but the runner state was not protected.
- Failure visibility was limited to compact `domain_event_consumer_state.last_error`;
  there was no structured failed-event ledger or replay audit.

Phase 3 fixes those without changing the event bus, SSE stream, or projection
functions.

## Durable Projection Replay

`projectDomainEventsBatch()` reuses `domain_event_consumer_state` with the
consumer name `workspace_live_projection_v1`. It scans persisted
`domain_events` by workspace and `event_position`, projects each event through
the same idempotent `projectDomainEvent()` function used by synchronous
publishing, and advances the consumer cursor only after successful contiguous
projection. The cursor model is:

```text
last_successful_contiguous event_position
```

A failed event does not disappear behind the cursor. When `continue_on_error` is
used by the scheduled runner, later independent events may still be idempotently
projected, but the cursor remains before the failed event so the gap remains
visible and retryable.

Routine compatibility replay remains:

```text
POST /v1/events/projections/replay
```

with admin authentication, but it no longer accepts arbitrary consumer names,
rewind cursors, or caller-controlled `continue_on_error`. It runs the registered
workspace projector for one workspace from the persisted cursor.

Internal routine execution is:

```text
POST /v1/internal/events/projections/run
```

This uses the fixed registered consumer list, bounded batch sizes, no arbitrary
rewind, and admin/service-secret authorization.

Privileged repair replay is:

```text
POST /v1/internal/events/projections/replay
```

This requires a `reason`, a registered consumer name, and admin/service-secret
authorization. It may use `from_position` for a bounded repair replay and writes
an audit row to `domain_event_projection_audit`.

Operational status is:

```text
GET /v1/internal/events/projections/status?workspace_id=default
```

It returns consumer cursor, active lease, oldest pending event, failure count,
and recent safe failure summaries.

## Consumer Registry And Concurrency

The registered consumer list is currently:

```text
workspace_live_projection_v1
```

Arbitrary request-provided consumer names are rejected. Scheduled replay uses
the same registry.

The `domain_event_consumer_state` row stores:

- `lease_owner`
- `lease_expires_at`
- `last_run_at`
- `last_successful_run_at`
- `last_failed_at`
- `consecutive_failures`
- `metadata`

The production path claims the row through
`claim_domain_event_consumer(...)`, which atomically sets a lease only when no
active lease exists or the previous lease has expired. This protects replay from
overlapping scheduled/manual runners. Projections also remain idempotent through
deterministic `workspace_updates`, `activity_groups`, and
`activity_group_events` keys.

## Projection Failure Store

`domain_event_projection_failures` stores one active failure per
workspace/consumer/event:

- retry count
- first/last failure timestamps
- next retry time
- status: `retrying`, `poison`, or `resolved`
- safe redacted error summary

Repeated retries update the same active row. A successful replay resolves it.
The source `domain_events` row is never deleted or mutated.

## Scheduled Runner

The existing Cloudflare Worker `scheduled()` handler now runs the projection
replay after the existing scheduled connector imports. Defaults are conservative:

- batch size: 100 events
- maximum events per scheduled execution: 250
- maximum workspaces per scheduled execution: 10
- lease duration: 120 seconds
- poison threshold: 5 failed attempts

Environment overrides:

```text
LIVE_WORKSPACE_PROJECTION_BATCH_SIZE
LIVE_WORKSPACE_PROJECTION_MAX_EVENTS
LIVE_WORKSPACE_PROJECTION_MAX_WORKSPACES
```

The scheduled runner scans recent `domain_events` for workspace IDs, processes
registered consumers, logs structured run metrics, and exits within bounded
limits.

## Incident Producers

Phase 3 wires incident-oriented producers where the backend already has
authoritative transitions:

- `connector.delivery_failed`: emitted when Connector Runtime marks a task
  permanently failed after retry classification.
- `connector.recovered`: emitted when a retried or previously errored runtime
  task completes.
- `reconciliation.matched`: emitted after the existing PayPal
  commerce-reference reconciliation RPC updates a transaction match.
- `refund.received` and `chargeback.received`: emitted after retained
  `journey_events` rows of those types are created.

The following event names are still supported by builders/projections but need
future authoritative write paths before producers should be wired:

- `health.score_changed`
- `health.issue_detected`
- `health.issue_resolved`
- `notification.created`
- `reconciliation.discrepancy_detected`
- `reconciliation.resolved`
- `commission.adjusted`
- `commission.reversed`

## Notification Loop Policy

Routine domain events do not automatically become notifications. Notifications
remain Health-derived and read-state-only in the Notification Engine. A future
notification projector must explicitly ignore `notification.created` events when
deciding whether to create notifications, so this loop is forbidden:

```text
domain event -> notification projection -> notification.created -> notification projection
```

## Runbooks

### Projection Lag

1. Call `GET /v1/internal/events/projections/status?workspace_id=<workspace>`.
2. Check `oldest_pending_event_position` and `oldest_pending_event_age_ms`.
3. If no active lease exists, run
   `POST /v1/internal/events/projections/run` for the workspace.
4. Confirm `last_event_position` advances and `active_failure_count` is zero.

### Poison Event

1. Inspect the failure through the status endpoint.
2. Use the redacted `safe_error_summary` and source event ID to decide whether
   the issue is code or malformed data.
3. Repair the cause.
4. Run `POST /v1/internal/events/projections/replay` with `reason` and a bounded
   `from_position`.
5. Confirm the failure status becomes `resolved`.

### Connector Incident

Connector incidents open from durable Connector Runtime failure transitions, not
per-record retry noise. Repeated failures share the connector incident
correlation. Recovery is emitted only after a retried/error task completes.

### SSE Failure

Polling remains the source-of-truth fallback. To test stream replay, reconnect
with `Last-Event-ID` or `cursor` and verify only workspace-scoped
`workspace.update` envelopes after that cursor are returned.

### Cross-Workspace Isolation

Replay queries always include `workspace_id`. Tests must cover two workspaces
with interleaved event positions and verify no projected update crosses
workspace boundaries.

## Known Limitations In V1

- Projection is synchronous after event persistence with scheduled and internal
  durable replay. It is idempotent and replayable through the persisted event
  store.
- Tenant scoping follows the existing admin-secret workspace model. Full user
  RBAC can derive workspace access later without changing the event store.
- Existing polling remains as fallback. Live delivery invalidates targeted
  surfaces rather than becoming the source of truth.
- Health and Notification producers remain deferred until TraceKit has a
  persisted health-state comparison boundary that can avoid recalculation noise.

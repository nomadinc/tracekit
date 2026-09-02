# WS-008 M10 — 29Next Incremental Sync + Scheduler Foundation

Status: REVIEW pending dedicated local regression gate.

## Mission

Add safe recurring-incremental mechanics for the completed 29Next resource readers while reusing TraceKit's provider-neutral commerce scheduling, continuous-state, sync-run, and lease foundations.

M10 does not activate production polling or register webhooks.

## Shared control-plane reuse

M10 does not create a parallel 29Next scheduler table.

It reuses:

- `commerce_sync_schedules`
- `commerce_continuous_sync_state`
- `commerce_sync_runs`
- existing activation controls
- existing schedule permission checks
- existing schedule lease columns introduced by the Everflow scheduler work

The additive migration `20260902030000_next29_incremental_scheduler_foundation.sql` adds only provider-neutral checkpoint fields needed for resumable date-window polling:

- `successful_through_at`
- `active_window_start_at`
- `active_window_end_at`
- `resume_cursor`
- completion/failure timestamps and a sanitized error code

## 29Next resource schedules

One disabled schedule row may be created for each connected 29Next provider account:

- `next29_orders`
- `next29_subscriptions`
- `next29_disputes`

Rows are inserted with `enabled=false` and `activation_state='disabled'`.

A resource can run only after existing activation controls permit it, it is due, and an atomic owner lease is successfully claimed. Manual-frequency rows are not selected by the scheduled claim path.

## Incremental source windows

Stable 29Next list APIs expose date-range discovery filters rather than a universal updated-since cursor:

- orders: `date_placed_from` / `date_placed_to`
- subscriptions: `date_from` / `date_to`
- disputes: `dispute_date_from` / `dispute_date_to`

Signed webhooks remain the lifecycle-change path for updates to objects older than the polling discovery window. M10 does not pretend polling alone can discover every later state transition.

## Window discipline

The incremental runtime:

- overlaps the prior successful boundary by a bounded number of days
- uses a small bootstrap lookback when no successful checkpoint exists
- caps catch-up to a bounded maximum window
- freezes the active window while a paginated run is incomplete
- persists the resume cursor for that frozen window
- advances `successful_through_at` only when the entire bounded window finishes
- retains the prior successful checkpoint on failure

Defaults:

- overlap: 1 day
- bootstrap lookback: 2 days
- max catch-up: 7 days
- schedule lease: 300 seconds

Hard validation prevents unbounded windows or leases.

## Runtime boundary

`runNext29IncrementalCycle` runs only resources whose control adapter returns a claimed, enabled schedule. It delegates actual ingestion to the already-proven bounded M9 runtime, preserving the M3/M6/M8 evidence and canonical persistence contracts.

`createNext29IncrementalControl` maps runtime resource names to durable schedule identities and keeps the orchestration layer independent of a particular database SDK.

## Activation boundary

Still out of scope:

- automatic creation of external execution jobs
- production schedule activation
- live webhook registration
- provider writes
- retry-payment or subscription mutation actions
- dispute write operations
- Shopify, Everflow, or Commas runtime changes

## Acceptance gate

The M2–M10 dedicated gate must prove:

- the prior 61 M2–M9 tests remain green
- capability metadata uses the stable 29Next date filter names
- per-resource date windows are deterministic
- stale catch-up is bounded
- no provider read occurs without a claimed enabled schedule
- incomplete pagination retains a fixed window and resume cursor
- successful checkpoints advance only after a complete window
- failures use the failure-release path without checkpoint advancement
- the shared commerce schedule table is reused
- schedule rows are disabled by default
- shared permission and lease controls gate claims
- the migration remains service-role only and does not create external execution jobs

Expected dedicated total after M10: 73 tests.

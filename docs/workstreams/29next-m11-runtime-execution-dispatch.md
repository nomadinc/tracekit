# WS-008 M11 — 29Next Runtime Execution / Scheduler Dispatch

Status: REVIEW pending dedicated local regression gate.

## Mission

Connect the proven M10 incremental scheduler foundation to an executable, bounded 29Next scheduler tick without weakening activation, pause, tenancy, lease, or resource isolation controls.

## Execution model

`runNext29ScheduledWorker()` performs one bounded dispatcher tick:

1. ensure missing 29Next resource schedule rows exist (still disabled by default),
2. list only due, enabled, permitted, unleased 29Next schedules,
3. load the tenant-scoped runtime for each target,
4. invoke `runNext29IncrementalCycle()` for exactly that resource,
5. require the existing atomic M10 claim before any provider read,
6. renew/verify lease ownership with a heartbeat before provider traffic,
7. let M10 finish/incomplete/fail handling persist the durable checkpoint and release the lease,
8. isolate failures so one target cannot starve the rest of the due batch.

A due-list result is advisory only. If another worker claims the schedule first, the M10 claim returns not-claimed and the provider is not read.

## Shared control-plane additions

The additive dispatch migration adds:

- `list_due_next29_resource_schedules(now, limit)`
- `heartbeat_next29_resource_schedule(schedule_id, lease_owner, now, lease_seconds)`

Both are service-role-only. Due discovery requires:

- provider connection is `next29` and connected,
- schedule `enabled=true`,
- activation state `enabled`,
- non-manual cadence,
- due timestamp reached,
- shared `commerce_schedule_permitted(...)` returns true,
- no unexpired lease exists.

Heartbeat renews only the matching owner's still-live lease.

## Safety boundaries

M11 does not:

- enable any schedule,
- create an external cron/timer,
- register a 29Next webhook,
- mutate 29Next provider data,
- alter Shopify, Everflow, or Commas runtimes,
- bypass M10 checkpoint or lease logic.

The deployment/runtime host that calls the worker tick remains a later activation step.

## Acceptance gate

The M2–M11 dedicated gate must prove all prior 73 tests remain green plus:

- lease heartbeat loss stops before provider reads,
- scheduled repository maps only 29Next resource identities,
- due discovery/worker executes a claimed target,
- losing the claim race performs zero provider reads,
- one target failure does not block later targets,
- duplicate due targets execute once,
- due batch bounds reject unsafe requests before execution,
- dispatch SQL is due/enabled/permitted/unleased scoped,
- heartbeat is owner checked,
- dispatch RPCs remain service-role-only,
- no timer, webhook registration, or provider-write activation is introduced.

Expected dedicated total after M11: 84 tests.

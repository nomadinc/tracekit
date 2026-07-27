# Journey Engine

The Journey Engine groups canonical `journey_events` into customer journeys.

The hierarchy is:

```text
Person
Journey
Journey Events
```

A Journey represents one continuous customer experience for one person. Attribution models should operate on journeys rather than directly on a person's full lifetime event stream.

## Boundary Rule

Version 1 uses deterministic inactivity boundaries:

```text
same workspace
same person
time since previous event <= 30 days
```

Events inside that window are assigned to the same journey. A larger gap starts a new journey. Purchases do not automatically close journeys; later upsells, subscriptions, refunds, and chargebacks can remain in the same journey when they occur inside the inactivity window.

The timeout is centralized as `JOURNEY_DEFAULT_TIMEOUT_SECONDS` and persisted on each journey as `boundary_timeout_seconds` with `boundary_version = v1_inactivity_timeout`.

## Schema

Migration `018_journeys_engine.sql` creates `journeys` and adds nullable `journey_id` to `journey_events`.

`journeys` stores:

- person and workspace scope
- start and end timestamps
- status
- entry and conversion event IDs
- event, purchase, conversion, and revenue summaries
- boundary configuration
- metadata

`journey_events.journey_id` is nullable so events can exist before assignment.

## Future Attribution Windows

The schema includes `attribution_window_config jsonb` and explicit boundary fields. This is intentionally additive to the existing Journey Ledger: it does not change event ingestion or the `journey_events` source identity model.

Those fields let future attribution work record policy details such as 7-day click, 30-day click, 1-day view, or business-specific attribution windows without requiring a journey schema redesign.

## Backfill

`POST /v1/journeys/backfill` assigns existing `journey_events` to journeys.

The backfill:

- requires `from` and `to`
- scans only events with `person_id is not null` and `journey_id is null`
- uses keyset pagination by `person_id`, `event_time`, and `id`
- stores progress in `integration_import_jobs`
- is idempotent and resumable
- does not alter `platform_orders`
- does not run identity resolution

## APIs

`GET /v1/persons/:person_id/journeys` returns chronological journeys for a person.

`GET /v1/journeys/:journey_id` returns one journey plus chronological journey events using the same compact event shape as the person timeline.

Both APIs are workspace scoped and cursor paginated.

## Deferred

This sprint does not implement:

- first-touch attribution
- last-touch attribution
- attribution result storage
- commission logic
- dashboards or UI
- MCP tools
- AI explanations
- browser SDK changes

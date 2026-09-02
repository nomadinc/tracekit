# WS-008 M9 — 29Next Runtime Convergence

Status: PASS — locked after dedicated local regression gate.

Verified local gate: 61 tests / 61 passed / 0 failed.
Functional checkpoint: `b4bc19d0d8809ef9a8b42cedffa777456cfda1b5`.

## Mission

Converge the completed 29Next resource implementations behind one explicit TraceKit connection/runtime contract before any production activation.

M9 does not add new provider data models. It makes M2–M8 operate as one bounded connector capability.

## Capability manifest

The runtime publishes one provider capability manifest for:

- orders — list/get, canonical order expansion, refunds, transactions, attribution, product observations
- subscriptions — list/get, lifecycle, lines, rebill linkage
- disputes — list/get, lifecycle and deterministic order/transaction reconciliation
- webhooks — signed inbound event capability; registration remains inactive

The shared provider identifier remains `next29`.

## Connection verification

Connection verification performs bounded read-only list requests against:

1. orders
2. subscriptions
3. disputes

A successful verification proves that the configured credential can support the read scopes required by the actual connector runtime rather than proving only `orders:read`.

Verification does not return provider payloads, mutate provider state, or register a webhook.

## Bounded runtime orchestration

`runNext29BoundedBackfill` is the single operator-invoked historical orchestration surface.

It can run all canonical resources or an explicit subset. Each resource continues to use its already-proven M3/M6/M8 ingestion implementation and persistence ordering.

Shared safety bounds:

- default: 3 pages per resource / 100 records per resource
- hard maximum: 25 pages per resource / 500 records per resource
- per-resource durable resume cursors
- requested resources are de-duplicated deterministically
- invalid bounds fail before any provider read
- resource failures remain fail-closed in their existing ingestion engines

M9 deliberately does not create a parallel scheduler or persistence architecture.

## Activation boundary

Still out of scope:

- automatic schedule activation
- queue dispatch
- live webhook registration
- production credentials
- provider write operations
- automatic dispute/subscription/payment mutations
- changes to Shopify, Everflow, or Commas runtimes

## Acceptance result

PASS. The M2–M9 dedicated local gate proved:

- prior M2–M8 tests remained green
- full connection verification checks orders, subscriptions, and disputes
- capability manifest is explicit and provider-scoped
- unified bounded runtime runs all three historical resource engines
- targeted single-resource execution does not activate other resources
- unsafe shared bounds fail before provider reads
- duplicate requested resources execute once

Verified dedicated total: 61 tests.

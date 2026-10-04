# WS-019 M3 — Controlled Shopify Production Evidence

Status: **OPEN / PARTIAL — GOVERNED READINESS CAPTURED; NO MUTATION AUTHORIZED** on 2026-10-04.

Baseline: M2 `ebc263c308daea4b19320586d5dcf1411d9a6b7e`; `origin/main` `828c32225ad93899a5f0e974a2e3fc9964776558`.

## Proven preflight facts

- Repository-approved organization: Stem Labs, `8f6bb14b-2126-49b8-bfdb-c60edbc3549b`.
- Repository-approved M15 Shopify connection: `d69a93dd-98ed-46fd-b486-1a39fb8388dd`.
- Approved operation: `shopify.controlled_webhook_create_delete_proof`.
- Exact server-resolved provider target: `izkfvg-k0.myshopify.com`, proof-only topic `APP_UNINSTALLED`, callback derived server-side from the authenticated application origin.
- The governed implementation requires `actions.execute`, opaque preparation, fresh explicit confirmation, immutable target resolution, atomic consumption, provider read-back, exact deletion, absence verification, durable recovery/audit, and replay.
- Production V1 policy leaves Shopify controlled proof enabled unless a global, provider, or action disable is explicitly set. Commas remains disabled and Everflow remains read-only.

These are repository assertions, not current production evidence.

## Production governed-readiness capture

The detailed read-only MCP inspection was invoked through the authenticated first-party WorkOS application session while Admin Client View was scoped to Stem Labs. The request completed from `2026-10-04T05:20:01.582Z` through `2026-10-04T05:20:03.454Z` with HTTP 200, MCP protocol `2025-06-18`, and JSON-RPC ID `ws019-m3-readiness`.

- Active and expected organization: Stem Labs, `8f6bb14b-2126-49b8-bfdb-c60edbc3549b`.
- Approved Shopify connections: `1`; active credentials: `1`.
- Credential envelope match, decrypt, parse, and approved-shop match: all `true`.
- Approved shop: `izkfvg-k0.myshopify.com`.
- Approved callback: `https://app.trace-kit.io/api/webhooks/shopify`.
- Shopify subscription read: succeeded; exact TraceKit callback subscriptions observed: `2`.
- Controlled-proof topic: `APP_UNINSTALLED`; matching subscriptions: `0`; baseline available: `true`.
- Create read-back and delete-absence primitives: both `true`.
- Recovery mode: `same_execution_exact_created_subscription`; aggregate readiness: `true`.

The corresponding immutable audit event is `3e6f81d1-a2f0-4ce7-85db-2249fd980c2f`, recorded at `2026-10-04T05:20:03.412435Z` with correlation ID `52a65064-fd48-4a4d-a914-302996476640`. It records actor Anthony McCabe (`cbfaeaf7-fa83-4235-9011-af3ae7ce9101`), organization and target Stem Labs (`8f6bb14b-2126-49b8-bfdb-c60edbc3549b`), action `mcp.tool.inspect_shopify_controlled_proof_readiness`, result `success`, evaluated permission `customers.view`, and `toolVersion: 1`.

The normal `membership.resolved` event `a64408c7-e937-4fd6-834f-165471e47e2f` occurred at `2026-10-04T05:20:03.072172Z` with the same correlation ID, actor, and organization. Its target is membership `0a91c3d4-efaf-4bd8-a092-b0ea6a0853ac`; metadata records role `platform-owner` and account type `client`.

This capture proves the read-only readiness gate and exact absence baseline. It did not create an action intent, prepare or confirm an action, perform the tenant-negative test, or mutate Shopify.

## Remaining gates

- Explicit authorization for preparation, confirmation, and the bounded Shopify mutation has not been granted.
- A tenant-negative fixture has not been approved and the tenant-negative test has not been performed.
- The remaining governed lifecycle evidence — intent, confirmation, exactly-once execution, verification, cleanup/net-zero state, replay, durable lifecycle/history, and safe failure — has not been produced.

No Shopify request, action intent, confirmation, execution, provider mutation, or database mutation was performed.

## Acceptance manifest

`evidence/WS-019_M3_SHOPIFY_PRODUCTION_ACCEPTANCE.incomplete.json` now records this governed-readiness observation and its audit correlation. Its release stages and scenarios intentionally remain empty, so the M2 validator must continue to reject it until the separately authorized controlled-production lifecycle is complete.

## Regression baseline

The full UI suite was executed outside the filesystem sandbox because `tsx` requires a local IPC socket.

| Revision | Tests | Pass | Fail | Classification |
|---|---:|---:|---:|---|
| M2 plus M3 preflight repair | 1,153 | 1,031 | 122 | Every remaining failure name reproduces on `origin/main` |
| `origin/main` `828c322` | 1,148 | 1,025 | 123 | Baseline |

The exact M3 failure-name inventory is in `evidence/WS-019_M3_REGRESSION_FAILURES.tsv`; every row is classified `PRE-EXISTING`. Set comparison found no failure name unique to WS-019. One genuine M2 regression was found and repaired before recording this baseline: provider safe-disable policy had incorrectly gated the non-provider `inspect_evidence` action. One directly superseded M14 Commas assertion was updated to the frozen M2 classification. No unrelated historical test was edited.

The suite contains historical milestone assertions that intentionally disagree with later repository state, missing historical migration fixtures, and several malformed test files containing literal `\\n` separators. These remain baseline debt and were not changed.

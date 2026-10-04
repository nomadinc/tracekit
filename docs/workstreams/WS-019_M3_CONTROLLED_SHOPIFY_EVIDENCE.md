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

## Production tenant-negative proof

An authenticated Stem Labs Admin Client View request was made from `2026-10-04T05:24:00.049Z` through `2026-10-04T05:24:00.762Z` to `POST /api/actions/provider-prepare`. It named the valid operation `shopify.controlled_webhook_create_delete_proof` but also supplied the prohibited caller-controlled `organizationId` value `11111111-1111-4111-8111-111111111111`. This UUID was deliberately synthetic and was not attributed to any production tenant.

The endpoint returned HTTP 400 with `{"ok":false,"error":"invalid_operation"}`. Request-shape validation rejects any key other than `operation`, so the request stopped before action discovery, target resolution, readiness/provider access, or intent creation.

Read-only production verification over the exact capture window found:

- `mcp_action_intents`: `0` rows for the authenticated actor and Stem Labs.
- `mcp_shopify_mutation_recovery`: `0` Stem Labs rows.
- `mcp_action_confirmations`: `0` rows for the authenticated actor and Stem Labs.
- `mcp_action_execution_results`: `0` Stem Labs rows.
- No governed-action, execution, or external-mutation audit event.
- One normal `membership.resolved` event, `74c464a4-15ca-4ccf-b08b-1524a3b61bbc`, at `2026-10-04T05:24:00.714079Z`, correlation ID `340bd048-85c6-4cc9-b6f0-4ef61db690f0`, for Anthony McCabe and Stem Labs. Its target is membership `0a91c3d4-efaf-4bd8-a092-b0ea6a0853ac`; metadata records `platform-owner` and account type `client`.

The approved Shopify connection `d69a93dd-98ed-46fd-b486-1a39fb8388dd` remained `connected`, provider `shopify`, and exclusively owned by Stem Labs. Its persisted `updated_at` remained `2026-09-29T02:33:54.306352Z`, predating the test. Because rejection preceded target resolution and provider access, no Shopify request or webhook mutation was possible; the detailed provider baseline captured at `2026-10-04T05:20:01.582Z`–`2026-10-04T05:20:03.454Z` remains the governing baseline without another provider read.

Tenant-negative and fail-closed gates: **PASS**. No other organization was entered, resolved, or read.

## Production prepare-only persistence proof

A valid authenticated Stem Labs prepare-only request completed from `2026-10-04T05:26:25.784Z` through `2026-10-04T05:26:27.905Z`. It returned HTTP 200 for `shopify.controlled_webhook_create_delete_proof`, intent `7cbe1acf-f8b0-4c95-8c4e-2edd25c1bb66`, expiry `2026-10-04T05:36:27.824Z`, `executionAvailable: false`, and `confirmationRequired: true`.

The durable intent was issued at `2026-10-04T05:26:27.824Z` for Stem Labs and actor Anthony McCabe. Its stored plan and target bind connection `d69a93dd-98ed-46fd-b486-1a39fb8388dd`, shop `izkfvg-k0.myshopify.com`, callback `https://app.trace-kit.io/api/webhooks/shopify`, topic `APP_UNINSTALLED`, required permission `actions.execute`, reversible recovery, and target kind `shopify_webhook_subscription`. Its plan identity is:

`provider-plan:shopify.controlled_webhook_create_delete_proof:d69a93dd-98ed-46fd-b486-1a39fb8388dd:izkfvg-k0.myshopify.com:APP_UNINSTALLED`

At database observation time `2026-10-04T05:27:36.687346Z`, the derived lifecycle state was `prepared_unconfirmed`. The linked recovery row `c61320a2-9609-4d52-9565-a0cd434bdd9e` was created at `2026-10-04T05:26:27.868391Z` in state `prepared`, with `created_external_id: null`, `created_verified: false`, and `rollback_verified: false`. No confirmation, action authorization, execution result, provider mutation, or external provider object was recorded.

The intent and recovery row share audit correlation ID `adb0b326-8f04-4cd7-b8e9-42cfa5574731`. Correlated audit events are:

- `membership.resolved`, event `4f34a78e-31b4-468e-8d7d-f8af45913771`, at `2026-10-04T05:26:27.251187Z`, actor Anthony McCabe, organization Stem Labs, result `success`, membership target `0a91c3d4-efaf-4bd8-a092-b0ea6a0853ac`, role `platform-owner`.
- `mcp.tool.discover_provider_actions`, event `3902b9cf-2d0d-4758-91cc-38a559442443`, at `2026-10-04T05:26:27.627278Z`, actor Anthony McCabe, organization Stem Labs, result `success`, evaluated permission `organizations.view`, `toolVersion: 1`.

Preparation itself does not emit a separate audit event; durable intent and recovery rows carry the correlation. No provider read was repeated for this persistence verification. Prepare-only gate: **PASS**. Confirmation and execution remain incomplete.

## Expired prepared-intent evidence

At database observation time `2026-10-04T05:36:58.239938Z`, intent `7cbe1acf-f8b0-4c95-8c4e-2edd25c1bb66` remained durably present and its `2026-10-04T05:36:27.824Z` expiry had passed. Its derived state was `expired_stale_unconfirmed`.

- Confirmations: `0`.
- Action authorizations: `0`; consumed authorizations: `0`.
- Execution results: `0`.
- Recovery remained `prepared`, unchanged since `2026-10-04T05:26:27.868391Z`.
- `created_external_id` remained null; `created_verified` and `rollback_verified` remained false.
- External mutation/execute audit events for the intent correlation: `0`.
- No provider object was created and no Shopify read or mutation was performed for this observation.

The execution contract fails closed for this stale intent: `resolve_mcp_shopify_action_confirmation` returns a row only when both intent and confirmation expiries are later than the requested execution time. With no confirmation row, execution would return `confirmation_reference_unavailable`; even if a confirmation reference existed, the expired intent predicate would prevent resolution before target or provider execution.

The confirmation contract has a gap: `confirmShopifyControlledProof` currently inserts directly into `mcp_action_confirmations`, and neither that writer nor the confirmation route validates the referenced intent's expiry. Presenting this expired intent for confirmation would therefore be expected to create a confirmation row rather than reject it. That path was not invoked. Expired execution is fail-closed, but expired confirmation is **not production-proven safe and is source-established defective**; M3 must not proceed through this intent.

## Remaining gates

- Explicit authorization for preparation, confirmation, and the bounded Shopify mutation has not been granted.
- The remaining governed lifecycle evidence — confirmation, exactly-once execution, verification, cleanup/net-zero state, replay, and completed durable lifecycle/history — has not been produced.
- A separate execution-adjacent safe-failure case remains outstanding if required by the final acceptance scenario; the malformed tenant-target request already proves structural fail-closed behavior before preparation.
- Expired-intent confirmation must be repaired to reject before lifecycle write, then regression-tested and production-validated before another governed proof intent is confirmed.

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

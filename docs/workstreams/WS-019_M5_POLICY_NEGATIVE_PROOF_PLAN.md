# WS-019 M5 — Production Policy Negative Proof Plan

Baseline: `main` @ `8436004def0cad5dcf70493a9d91a7cb0b000e17`

Status: **PLAN READY / PRODUCTION EXECUTION NOT AUTHORIZED**

This plan closes only `authoritative_policy`, `safe_disable_controls`, and `capability_suppression`. It does not expand the Production V1 matrix, authorize a provider call, or change the evidence status before live acceptance succeeds.

## Frozen Production V1 policy

| Provider | Operation | Classification | Executable | Production posture |
|---|---|---:|---:|---|
| Shopify | `shopify.controlled_webhook_create_delete_proof` | `production_proven` | yes | Only governed provider mutation. Exact Stem Labs target, explicit confirmation, atomic authorization, replay, read-back, and rollback are required. |
| Shopify | `repair_ingestion_webhooks` | `read_only_finding` | no | Finding/readiness only. |
| Everflow | `bounded_manual_sync` | `read_only_finding` | no | Read-only finding; no provider mutation adapter is exposed. |
| Everflow | `generic_provider_mutation` | `not_supported` | no | Unsupported. |
| Commas | `commas.webhook_test_delivery` | `engineering_ready_not_live_proven` | no | Contract retained, but capability exposure and execution are disabled. |
| Commas | `create_webhook_subscription` | `not_supported` | no | Unsupported and absent from governed execution surfaces. |

Unknown operations fail closed as `operation_not_in_production_v1_matrix`. The Shopify action is additionally controlled by, in order, `TRACEKIT_INTELLIGENCE_MUTATIONS`, `TRACEKIT_INTELLIGENCE_PROVIDER_SHOPIFY`, and `TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF`. Disabled or invalid values fail closed. `TRACEKIT_INTELLIGENCE_EVALUATION` independently disables actionable evaluation without deleting historical evidence.

Read-only discovery and readiness tools remain available during the exact-action disable. Historical repositories remain readable and are not rewritten by policy toggles.

## Production-reachable mutation entry points

| Entry point | Permission / tenant boundary | Policy enforcement | Disabled or unsupported result | Possible persistence/provider effect when enabled |
|---|---|---|---|---|
| MCP `tools/list` at `POST /api/mcp` | Authenticated ApplicationSession or verified bearer; active organization | `listTraceKitMcpTools` calls `assessIntelligenceAction` | Shopify prepare/confirm/execute tools absent; read-only readiness remains | None |
| MCP `tracekit.prepare_shopify_controlled_proof` | `actions.execute`; server-derived active organization | Action service checks policy before target resolution or intent issuance | Generic bounded MCP error; no intent/recovery row | Enabled path creates one intent and prepared recovery row; no provider mutation |
| MCP `tracekit.confirm_shopify_controlled_proof` | `actions.execute`; opaque intent in active organization | Action service checks policy before confirmation RPC | Generic bounded MCP error; no confirmation | Enabled path inserts one confirmation only |
| MCP `tracekit.execute_shopify_controlled_proof` | `actions.execute`; opaque confirmation in active organization | Policy check occurs before completed-replay lookup, target/readiness resolution, credential access, authorization, and orchestration; orchestration rechecks policy | Structured rejected result with `provider_action_disabled`; no replay lookup or write | Enabled path may consume authorization and perform the certified create/read/delete/absence proof |
| `POST /api/actions/provider-prepare` | Authenticated ApplicationSession; active organization; service requires `actions.execute`; exact body allowlist | Discovery contract becomes unavailable under policy before preparation | HTTP 409 `action_not_ready` | One intent and prepared recovery row; no provider mutation |
| `POST /api/actions/provider-confirm` | Same boundary; opaque intent | Discovery contract becomes unavailable under policy before confirmation | HTTP 409 `action_not_ready` | One confirmation; no provider mutation |
| `POST /api/actions/shopify/controlled-webhook-proof` | Same-origin, authenticated active organization, `actions.execute` | Permanently replaced by governed-only boundary | HTTP 404 `governed_action_required` | None; route contains no provider or credential implementation |
| `POST /api/actions/commas/webhook-test-delivery` | Same-origin, authenticated active organization, `actions.execute` | `assessIntelligenceAction` runs before body parsing, DB reads, credential decryption, or provider listing | HTTP 404 `action_not_available` | None while frozen policy remains unchanged |
| MCP Commas prepare/confirm/execute names | Authenticated MCP session | Tools are not registered or listed; Commas capability is non-executable | JSON-RPC `-32602` `Unknown tool` | None |
| Unsupported provider operation through first-party prepare/confirm | Authenticated session | Exact route operation allowlist | HTTP 400 `invalid_operation` / `invalid_confirmation_request` | None |
| Unsupported provider operation through MCP | Authenticated MCP session | No generic provider execution tool exists | JSON-RPC `-32602` `Unknown tool` | None |
| Shopify replay | Same MCP execute tool and original opaque confirmation/idempotency identity | Policy check precedes replay resolution | Structured rejected result; original result remains unchanged | Enabled exact replay returns prior durable result without provider access |
| Shopify authorization/atomic consumption | Not a public route; reachable only inside governed execute | Execute policy check precedes confirmation resolution and atomic authorization | Not reached while disabled | Enabled path may issue/consume the exact authorization |
| Shopify recovery | No standalone public provider-recovery route; recovery is internal to controlled orchestration | Execute and orchestration policy checks precede recovery access | Not reached while disabled | Enabled path updates only exact controlled recovery evidence |
| WS-019 M4.4 acceptance fixture route | Fixed Stem Labs-only acceptance endpoint, `actions.execute` | Fixed namespace/IDs; structurally no provider dispatch | Out of scope and must not be invoked | Synthetic lifecycle writes only when separately authorized |

The non-provider `inspect_evidence` tools are not a provider-policy bypass: they accept opaque evidence references, have no provider adapter, and cannot perform an external mutation.

## Fixed test identities

Use existing retained M3 production evidence rather than creating a new lifecycle:

- Completed intent: `1c07429f-ccce-4b9f-9fa3-88b912fac422`
- Completed confirmation: `85295197-b001-4fc8-9410-137dff2a72f5`
- Original authorization: `00dcd8c9-5520-4a28-8feb-81465df6ea06`
- Original consumption: `7e6190bb-725d-4c46-b655-688d14673fc1`
- Original idempotency key: `ws019-m3-shopify-proof-20261004-001`

Before the window, verify these rows and their hashes against the M3 evidence. The disabled execute/replay request uses the valid retained confirmation and original idempotency key with a new deterministic acceptance-only consumption ID. This proves the policy gate, because a nonexistent confirmation would prove only missing-resource behavior. The request must never reach replay lookup or authorization consumption.

## Negative-test matrix

All HTTP and MCP requests use the authenticated Stem Labs client context, same-origin credentials, actor `cbfaeaf7-fa83-4235-9011-af3ae7ce9101`, active organization `8f6bb14b-2126-49b8-bfdb-c60edbc3549b`, and effective `actions.execute`, unless a row explicitly tests tenant input rejection.

| ID | Condition and exact request | Expected result | Durable input | Expected delta | Stop condition |
|---|---|---|---|---|---|
| N01 | Disabled discovery: MCP `tools/list` JSON-RPC request | HTTP 200; Shopify prepare/confirm/execute absent; readiness tool present; baseline tool count reduced by exactly three | none | zero | Any mutation tool remains listed or unrelated tool disappears |
| N02 | Disabled HTTP prepare: `POST /api/actions/provider-prepare` body `{"operation":"shopify.controlled_webhook_create_delete_proof"}` | HTTP 409 `action_not_ready` | none | zero intents/recovery | Any new lifecycle row or readiness/provider request |
| N03 | Disabled MCP prepare: `tools/call` name `tracekit.prepare_shopify_controlled_proof`, arguments `{}` | Bounded MCP error; no target diagnostic disclosed | none | zero intents/recovery | Intent/recovery write or credential/provider access |
| N04 | Disabled HTTP confirmation: `POST /api/actions/provider-confirm` body `{"operation":"shopify.controlled_webhook_create_delete_proof","intentId":"1c07429f-ccce-4b9f-9fa3-88b912fac422"}` | HTTP 409 `action_not_ready` | valid retained intent | zero confirmations | Any new/updated confirmation |
| N05 | Disabled MCP confirmation: `tools/call` name `tracekit.confirm_shopify_controlled_proof`, arguments `{"intent_id":"1c07429f-ccce-4b9f-9fa3-88b912fac422"}` | Bounded MCP error | valid retained intent | zero confirmations | Any confirmation or intent rewrite |
| N06 | Disabled authorization/execution/replay: MCP `tools/call` name `tracekit.execute_shopify_controlled_proof`; arguments contain confirmation `85295197-b001-4fc8-9410-137dff2a72f5`, the request UTC timestamp, deterministic new consumption ID, and original idempotency key | Structured `status=rejected`, `reason=provider_action_disabled`, `executionAvailable=false`, `netProviderConfigurationMutation=false` | valid completed M3 chain | zero authorization, consumption, result, recovery, audit, or provider delta | Replay/result returned, authorization consumed, credential accessed, or provider request observed |
| N07 | Unsupported Commas direct route: `POST /api/actions/commas/webhook-test-delivery` body `{"confirm":true}` | HTTP 404 `action_not_available` before body/provider work | none | zero | DB read beyond session, credential access, provider listing, audit, or delivery |
| N08 | Unsupported/unproven first-party prepare: `POST /api/actions/provider-prepare` body `{"operation":"commas.webhook_test_delivery"}` | HTTP 400 `invalid_operation` | none | zero | Any target, persistence, credential, or provider work |
| N09 | Alternate MCP mutation: `tools/call` name `tracekit.execute_commas_test_delivery`, arguments `{}` | JSON-RPC `-32602` `Unknown tool` | none | zero | Tool resolves or provider path begins |
| N10 | Legacy Shopify route: `POST /api/actions/shopify/controlled-webhook-proof` body `{}` | HTTP 404 `governed_action_required` | none | zero | Any credential/provider/lifecycle work |
| N11 | Unknown operation: HTTP prepare body `{"operation":"shopify.arbitrary_graphql_mutation"}` and MCP call `tracekit.execute_provider_action` | HTTP 400 plus MCP `Unknown tool` | none | zero | Generic provider surface accepts request |
| N12 | Caller-selected tenant attempt: HTTP prepare body includes `workspace_id`; MCP Shopify prepare arguments include `organization_id` | HTTP 400 `invalid_operation`; MCP `Invalid params` | none | zero | Tenant hint accepted or foreign data disclosed |

Each test is single-attempt. An ambiguous network result immediately triggers read-only correlation and persistence verification; it is not automatically retried.

## Production execution order

1. Confirm authoritative main/deployment SHA, current application health, active Stem Labs ApplicationSession, `actions.execute`, and exact currently enabled action flag.
2. Capture transactional BEFORE evidence and a telemetry anchor.
3. Run enabled-state read-only `tools/list` and provider discovery only. Require the known three Shopify tools and no Commas mutation tools.
4. Through the existing production environment control, set only `TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF=disabled`; perform the normal Git-integrated/config deployment. Do not change database policy or the global/provider switches.
5. Require the disabled deployment to be READY and its effective configuration fingerprint to show only the exact-action change.
6. Run N01–N12 sequentially. After every request, inspect bounded response, correlation, persistence, and provider telemetry before continuing.
7. Capture disabled-state AFTER evidence. Require zero governed-business delta.
8. Restore only `TRACEKIT_INTELLIGENCE_ACTION_SHOPIFY_CONTROLLED_WEBHOOK_CREATE_DELETE_PROOF=enabled` using the same environment control and normal deployment path.
9. Require the restored deployment to be READY. Run read-only MCP `tools/list` and provider discovery: exactly the three Shopify tools return; Commas remains suppressed; Everflow remains read-only.
10. Capture final evidence. Do not prepare, confirm, execute, or replay after restoration.

Production execution requires separate explicit authorization for the configuration change and every listed request. No database write is authorized except normal session/audit evidence and the two accounted configuration/deployment events.

## BEFORE/AFTER evidence

Capture one transactionally consistent snapshot before disable, one after N12 while disabled, and one after restoration:

- Effective safe-disable keys and a redacted configuration fingerprint; never capture unrelated secret values.
- Deployment SHA/ID, readiness, and timestamps.
- `mcp_action_intents`, confirmations, authorizations/consumptions, execution results, Shopify recovery, Work Items/activity, external-action audit, external-mutation audit, and notification presentation state.
- Counts, deterministic ordered row hashes, latest IDs, `created_at`/`updated_at` watermarks, and hashes for the retained M3 chain.
- Exact HTTP/MCP request timestamps, status, bounded response, membership event ID, and correlation ID.
- Provider/credential/external-delivery telemetry for every request window.

Expected business-state delta is zero. `membership.resolved` and the authorized configuration/deployment audit events are recorded separately. Background work must be attributed by timestamp, object identity, and correlation rather than treated as a request delta.

## Provider firewall

For every negative request require zero attributable:

- Shopify, Everflow, Commas, or Edge requests.
- Credential lookup, resolution, or decryption.
- Governed authorization issuance/consumption or execution dispatch.
- External-action or external-mutation audit creation.
- External notification delivery.
- Intent, confirmation, execution-result, recovery, Work Item, activity, or presentation-state writes.

N06 must be correlated especially closely: the policy check is expected to precede replay lookup, target resolution, credential access, authorization, and orchestration.

## Stop conditions

Stop immediately and begin read-only incident assessment if:

- Authoritative main/deployment changes or the matrix/config differs from the reviewed baseline.
- Active organization, actor, membership, or `actions.execute` is not the reviewed Stem Labs context.
- The disable affects anything other than the exact Shopify action.
- A disabled mutation tool remains discoverable.
- Any negative request creates or changes business/lifecycle/presentation evidence.
- Any provider, credential, dispatch, or external-delivery telemetry is attributable to a request.
- A response is ambiguous, a deployment is unhealthy, or telemetry cannot be correlated.
- Restoration does not complete once, the restored deployment is not READY, or the three tools do not return exactly.

After a stop, do not continue to later tests, do not retry a request automatically, and do not repair production evidence or configuration manually.

## Restore and incident procedure

The planned rollback is the reviewed restore to `enabled` using the same environment control and deployment path. Record the restore start/end and deployment identity. Do not use a database edit, alternate switch, or emergency policy bypass.

If the restore command or deployment is interrupted, inspect the authoritative environment value and deployment state before deciding what occurred. Do not infer failure from client interruption and do not issue a blind second restore.

If the value is not demonstrably restored or the restored deployment is not healthy, classify a production operational incident, notify the operator, keep all provider mutation attempts stopped, preserve captured evidence, and follow the existing deployment rollback/runbook under separate authority. Read-only intelligence may remain available; no governed provider execution is attempted until the incident is closed.

## Regression gates

Before authorization and again after evidence integration require:

- M4.1 frozen matrix, hierarchy, direct-route, and discovery tests.
- M4.2 ApplicationSession, RBAC, tenant-hint, and non-disclosing negative tests.
- M3 authoritative replay database harness and exact retained M3 chain hashes.
- M4.3 lifecycle-history integrity and redaction tests.
- M4.4 projection, presentation, tenant-negative, and provider-isolation tests.
- Production V1 validator, which remains not-ready before live proof.
- No provider/action matrix expansion and no WS-022 dependency-file changes.

## Validator impact

Successful live execution and integrated evidence may change `authoritative_policy`, `safe_disable_controls`, and `capability_suppression` from `blocked` to `pass`. It must not change `regression_gates`; WS-022 owns that requirement. Production V1 remains not ready until WS-022 evidence closes the independent regression gate and the final validator is rerun against authoritative main.

## Local plan validation

- Plan contract tests: pass.
- Frozen policy, M4.2 tenant/RBAC, M4.3 history, and M4.4 notification tests: pass.
- Authoritative M3 execution/replay PostgreSQL harness: pass.
- Combined focused source batch: 100/101 pass. The sole failure is the pre-existing `M3 all confirmation paths use the shared RPC with operation-specific target contracts` assertion for the historical `inspect_evidence` string layout. This branch changes no application or M3 source, and the failing files are byte-identical to `origin/main`; it is not waived as a Production V1 regression gate.
- Current authoritative validator: `productionV1Ready=false`, with the seven unreconciled requirements still missing from the main manifest. This plan intentionally changes no release status.
- `git diff --check`: pass.

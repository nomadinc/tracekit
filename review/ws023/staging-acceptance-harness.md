# WS-023 Offline Staging Acceptance Harness
Accepted baseline: `91ba40ec1690ad4301a2aa7fbddd80c6a3ae9d28`
Permanent origin: `https://staging.trace-kit.io`
Status: OFFLINE PREPARATION ONLY — no authenticated browser execution.

## Offline commands
UI (`cd ui && npm ci`):
```sh
npm test -- ws026-staging-auth-origin.test.ts auth-return-url.test.ts application-session-business-context.test.ts ws001-customer-staging-selector.test.ts ws020-scoped-core-gateway.test.ts ws020-core-read-projection.test.ts ws020-order-read-model.test.ts identity-authorization.test.ts m13-direct-core-customer-read.test.ts m13-server-customer-read-origin.test.ts
node --import tsx --test lib/customers/ws026-*.test.ts lib/orders/ws026-*.test.ts
```
API (`cd api && npm ci`):
```sh
node --import tsx --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/admin-auth-staging-credential.test.ts src/customer-explorer.test.ts src/ws020-customer-orders.test.ts src/journey-events.test.ts src/journeys.test.ts src/ws026/*.test.ts
```

## Staging acceptance cases (NOT authorized to execute)
| Case | Positive | Negative |
|---|---|---|
| WorkOS login | approved origin/client | wrong client, wrong origin |
| Callback/PKCE | valid state/verifier/cookie | missing, stale, mismatched, off-origin |
| Logout | same-origin signed-out state | replay and cross-origin return URL |
| Client-read-only | customer/order reads | financial detail and mutations denied |
| Tenant | authorized organization/workspace | foreign hints and opaque object IDs denied |
| Journey | verified order link | contextual, ambiguous, stale links unresolved |
| Financial | genuine zero, source currency | missing values, unknown currency, raw sensitive data redacted |
| Pagination | cursor traversal | cycles, duplicates, truncation; no snapshot guarantee |
| Edge Model B | correct tenant credential | foreign credential rejected before ingestion |
| Environment | isolated staging targets | production Core, Supabase, WorkOS or cookie target blocked |

## Required evidence
Record exact app/deployment SHA, sanitized role/scope, expected/actual status, redacted logs, test count and exit, PASS/FAIL/BLOCKED, evidence hash and owner. Never capture credentials, auth codes, PKCE verifiers, raw provider payloads or personal information.

## Gates and known gaps
WS-001/WS-022 Core credential/target isolation; WS-024/WS-022 Supabase project/RLS/grants; WS-021/WS-022 WorkOS callback/cookie/PKCE; WS-026 immutable deployment; Master test identities. Existing tests include source-text assertions and do not prove authenticated foreign-object denial. Edge Model B historical redaction/tenant failures need owner disposition. Core pagination has no certified snapshot watermark.

**Production V1 HOLD.** No credentials, mutations, merges, deployments or authenticated staging execution.

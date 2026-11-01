# WS-001 read-only session authority implementation

Source parent: 9d1cc0ff68b5f69ed4948aaa88b561b770e1885c. Exact WS-021 donor: cb22a20efef2f442f458f0e472b5d1c6cb49801b, base e44b59c37873fd70d1a0154304edcdf8fd5eb684. Bundle checksum, validator hash and protected source contract are in SESSION-AUTHORITY-CONTRACT.json.

Implemented GET /v1/session in the existing restricted authority entrypoint. It verifies pinned WorkOS issuer/JWKS/client audience, RSA/P-256 signature and expiry/not-before/issued-at bounds, then makes one GET-only request to the protected membership source. Its exact registered database role headers must match tk_stg_membership_verifier under authenticator; those are expected contracts, not proof of actual installation. No service-role transport, ambient database credential or identity write fallback is implemented.

The UI response validator is imported from the exact, unchanged WS-021 staging-read-only-session.ts. The authority uses that same validator for both initial projection and a final live-clock expiry check. Response timestamps are milliseconds, capped at 45 seconds and bounded by WorkOS, protected-registry and membership expiry. No role-default permissions are added. Only the seven read permissions accepted by WS-021 may survive. Full email is the authenticated user's own protected session identity field required by WS-021; customer PII is not read here. Arbitrary context metadata and raw registry JSON are not returned.

The protected row must carry session_context, an authority-owned projection of current user/account/organization/membership/context evidence. It must agree with the same row's subject, application user, workspace/organization, version and effective permissions. Active account, organization, user and membership are mandatory, as is protected verified-email evidence. Missing context, duplicate/ambiguous rows, foreign identifiers, stale context version, revoked status or expiry deny. The endpoint cannot create or repair that evidence. No SQL, grants or enrollment were performed.

## WS-021 compatibility and ownership

A behavioral integration test calls the actual unchanged WS-021 resolveReadOnlyStagingSession against this authority handler and obtains an authenticated read-only session. Exact endpoint, field names, time units and permissions agree. No second session model was created. The donor's application-session.ts was NOT blindly overwritten: this worktree's existing fail-closed page-entrypoint fence is preserved. WS-021 still must compose its already implemented resolver call at that entrypoint; this source supplies the endpoint and shared validator only. No external WS-021 acknowledgment or WS-022 approval is claimed.

## Installed dependencies, not verified controls

The proposed current_memberships table does not yet contain session_context. A separately reviewed protected projection/column and exact verifier SELECT grant are required; until then the endpoint fails closed. Registry administrators must maintain identity/account/context liveness and membership versions atomically and independently of reporting readers. Prove actual RLS, PUBLIC/inherited/SET ROLE and callable-path closure, schema exposure, narrow verifier token, JWT issuer trust, staging WorkOS pairing and credential custody before activation. No newly provisioned key, role, column or privilege is asserted.

The shared WS-021 validator uses node:crypto. The existing API Wrangler source enables nodejs_compat; the isolated authority deployment must preserve and verify this setting. A local neutral esbuild bundle succeeds and has no legacy identity repository, synchronization, audit-write or service-role-key symbols. This is a source/bundle test, not a Worker deployment acceptance. An ad hoc NodeNext typecheck is blocked by the imported UI source's extensionless Bundler imports and unavailable UI type dependencies in this execution environment; no full TypeScript PASS is claimed.

## Reproduce

    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/session.test.ts
    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/*.test.ts ui/tests/ws001-staging-reporting-cutover.test.ts ui/tests/ws001-staging-session-boundary.test.ts

Observed combined focused results: 82 PASS / 0 FAIL / 0 SKIP. Twelve session cases cover exact WS-021 positive integration, issuer/audience/signature/time denials, cross-tenant/account/context substitution, revoked/inactive/stale evidence, ambiguity, missing credentials/configuration, prohibited writes, expiry during read wait and substituted privileged database role. No live provider, database or operational credential was used in tests.

Staging activation HOLD. Production V1 HOLD. Independent WS-022 security acceptance remains pending.

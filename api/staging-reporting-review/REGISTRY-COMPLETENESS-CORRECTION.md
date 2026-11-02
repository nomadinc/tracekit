# Focused registry completeness closure

Exact parent:4e468b3e64b6f3c8616bd2cf55399b9d6e03f436. Affected historical source:656536a5690b16731109fa352dc04f40a3db5aa1:api/src/staging-reporting/session.ts.

The old session.ts path was retired in4e468b3; it is not reintroduced. The current authority.ts registry lookup uses completeRead followed by singleComplete. This delta makes the single-binding predicate explicit: verified total==1, verified rowCount==1, body length==1. All protected identity, permission and membership read receipts remain mandatory. WorkOS authentication and the accepted Profit runtime are unchanged.

## Original before / corrected after

The regression executes the exact original656 session source together with its exact cb22 WS021 validator. A valid first row is returned with Content-Range0-0/2: two active registry bindings exist but the server page contains one. The original code issues a session. The test records ORIGINAL SECURITY FAIL total=2 returned=1 old656 issued session.

The current end-to-end authority denies the same capped registry result with503 after its FIRST registry request. It does not make a second request to establish completeness. A genuinely complete one-row scoped registry read permits a valid restricted session. Complete multiple rows, duplicates, conflicting application identities, absent exact-count metadata and inconsistent range/body counts deny. A missing complete binding denies with403. Multiple canonical WorkOS-to-user rows are also denied, including when hidden by a cap.

The accepted multi-organization model is preserved: one canonical application identity may have multiple authorized organization memberships. Each scoped registry lookup must have exactly one complete matching binding. Multiple matching identity bindings are not confused with legitimate organization memberships. Native acceptance must verify the global canonical identity constraints and complete RLS visibility, not infer them from response cardinality.

Repeated graph collection is only an additional drift check. It cannot turn missing counts or identical incomplete responses into evidence. Visible concurrent insert/delete/version changes deny in synthetic tests. No cross-request snapshot, concurrency acceptance or protection against all ABA races is claimed.

## Reproduce

    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/registry-completeness.test.ts

10 PASS /0 FAIL /0 SKIP, including the asserted historical vulnerability. Full focused integration105 PASS /0 FAIL /0 SKIP. Historical inputs are retained under api/tests/fixtures/ws001-656-session with exact Git-source hashes in the changed-file manifest.

## Native gates and preservation

Installed PostgREST must independently demonstrate exact count/body consistency and truthful cap/truncation handling under the actual protected role. Verify canonical identity constraints, visibility of all applicable binding/denial rows, issuer/audience/custody, role/session identity, PUBLIC/inheritance/SET ROLE paths, and transactional or revision-fenced authority consistency under concurrent changes. Missing or failed verification must leave activation disabled.

No SQL, grants, credentials, migrations or deployment were performed. All224 migration bytes and the four accepted Profit runtime files are unchanged; frozen financial triggers, WS030 and separate V6 are preserved. Staging and Production HOLD. WS022 independent acceptance is pending.

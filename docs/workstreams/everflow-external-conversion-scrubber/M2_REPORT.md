# M2 Completion Report

STATUS

Complete in branch; not deployed and not production-ready.

MILESTONE

M2 — Atomic decision service + authenticated ingress + mock forwarding.

BRANCH

`workstream/everflow-external-scrubber-v1`

FILES CHANGED

- Atomic decision and mock-forward SQL RPC migration.
- Server-only gateway service and Supabase repository.
- `POST /api/conversion` route.
- Service acceptance tests.
- Dedicated real-Postgres concurrent acceptance harness.

SCHEMA CHANGES

- `decide_everflow_scrubber_conversion_v1`: service-role-only, security-invoker transaction that authenticates active source scope, serializes one Offer × Affiliate bucket, arbitrates duplicates before counters, resolves the rule, versions the period, persists the decision/ingress attempt, and updates counters.
- `record_everflow_scrubber_mock_forward_v1`: service-role-only mock result/retry transition. PASS is retained across failures.

ENDPOINTS

- `POST /api/conversion`
- Bearer source token required.
- M2 route uses an in-process mock forwarder with no Everflow hostname, credential, or network request.

TESTS / TEST RESULTS

- Atomic decision: PASS.
- Concurrency: PASS — 64 parallel unique requests and 20 parallel deliveries of one duplicate identity against the same bucket.
- Duplicate suppression: PASS — one duplicate conversion row, twenty ingress attempts, one controller increment.
- Bypass: PASS — PASS reason, no period/counter mutation.
- Non-eligible path: PASS — PASS reason, no period/counter mutation.
- Authenticated ingress: PASS — bearer token digest lookup; missing/invalid token rejected and recorded.
- Mock forwarding: PASS — exactly once for an accepted non-duplicate PASS; no live implementation exists.
- Retry state: PASS — decision remains PASS, status becomes retry, attempt and next retry time persist.
- Database security: PASS — RLS enabled; RPC execution denied to anon/authenticated and granted to service role.

EVERFLOW TEST RESULT

Not run. Live Everflow forwarding remains disabled and no Everflow URL exists in the M2 gateway path.

SECURITY NOTES

- Source bearer token is hashed before lookup.
- Durable request and forwarding payloads omit plaintext email and authorization material.
- Only allow-listed forwarding fields are built.
- Database mutations run as service role through explicitly revoked/granted security-invoker functions.

KNOWN RISKS

- Fail-open durability and real retry execution remain later certified work.
- Mock success must never be confused with Everflow certification.
- Existing dependency and repository-wide static-check findings remain outside M2.

BLOCKERS

None for M2. M3 and production integration are intentionally not started.

NEXT RECOMMENDED ACTION

Hold at the M2 boundary for review. Do not begin M3 until explicitly authorized.

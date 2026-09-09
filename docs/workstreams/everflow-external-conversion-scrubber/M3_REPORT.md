# M3 Completion Report

STATUS

BLOCKED at the controlled Everflow certification boundary. All local/non-production M3 implementation is complete. M4 has not started.

MILESTONE

M3 — Everflow Metadata Sync + Certified Forwarding Contract.

BRANCH

`workstream/everflow-external-scrubber-v1`

FILES CHANGED

- Existing affiliate/offer sync now persists success/failure audit runs.
- Metadata sync audit migration.
- Atomic global, offer, and pair configuration RPCs.
- Authenticated scrubber configuration API.
- Real Everflow transaction-ID adapter behind an exact disabled-by-default flag.
- Official forwarding contract document and M3 tests.

SCHEMA CHANGES

- Added `everflow_metadata_sync_runs` with RLS and server-only grants.
- Added service-role-only global, offer-default, and pair-override mutation RPCs.
- Rule mutations close affected active periods in the same transaction.

ENDPOINTS

- Existing authenticated affiliate and offer sync routes now create audit records.
- `GET /api/scrubber/config`
- `PATCH /api/scrubber/config`
- Existing `POST /api/conversion` selects the real adapter only when `LIVE_EVERFLOW_FORWARDING_ENABLED=true`; absent flag selects a disabled adapter.

TESTS / TEST RESULTS

- Affiliate sync normalization/upsert/audit: PASS locally with injected provider responses.
- Offer sync normalization/upsert/audit: PASS locally with injected provider responses.
- Metadata upsert retention: PASS against isolated Postgres.
- Admin configuration API structure/auth/scope: PASS.
- Rule change immediate effect: PASS against isolated Postgres; 80% period closed and next conversion used a new 60% period.
- Real adapter disabled by default: PASS.
- Official request/response contract mapper: PASS.
- Mock path and M2 regression suite: PASS.
- Controlled Everflow S2S certification: BLOCKED.
- Production build with `LIVE_EVERFLOW_FORWARDING_ENABLED` explicitly absent: PASS.

EVERFLOW TEST RESULT

BLOCKED — no conversion was sent.

The current official endpoint and schema were verified from Everflow documentation. The configured TraceKit Supabase host is reachable, but authenticated REST reads using the existing local environment time out with no response. Consequently the connected Accufy scope, encrypted credential, safe test offer/affiliate, and a known test transaction ID could not be resolved. No safe test TID was guessed and no meaningful traffic was touched.

SECURITY NOTES

- Live forwarding defaults disabled and requires the exact lowercase value `true`.
- Everflow credentials are decrypted only inside the server adapter after the feature gate.
- Admin reads require `connectors.view`; mutations require `connectors.manage` and same-origin verification.
- Metadata failures persist bounded codes, never credentials or raw error messages.
- Unsupported Everflow fields are omitted rather than assumed.

KNOWN RISKS

- The official endpoint does not accept documented `currency`, `user_ip`, `aid`, or `adv_event_id`; these are retained internally but not forwarded by this adapter.
- Provider duplicate behavior is undocumented; TraceKit local idempotency remains authoritative.
- Live Accufy attribution and forwarding-audit evidence remain unproven until controlled certification.

BLOCKERS

- Reachable authenticated access to the current TraceKit/Accufy connection scope.
- A confirmed test offer, affiliate, and unused valid clicked-traffic transaction ID.
- Explicit temporary enablement of the forwarding flag only in a controlled certification runtime.

NEXT RECOMMENDED ACTION

Provide or restore the safe Accufy certification inputs/access, then run exactly one 100%-pass conversion and one duplicate replay. Do not begin M4 or production routing.

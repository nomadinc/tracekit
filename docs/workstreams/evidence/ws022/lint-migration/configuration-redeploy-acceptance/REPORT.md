# PR #577 authorized configuration and redeployment

The unchanged candidate is `775cbec41b1d937ea59a56d47276ae1a0ecc1c36`. The authorized Preview redeployment is `dpl_A1VTcr4pBbYmMGn2xFEXYUjnX3wR`, READY at https://tracekit-staging-d9dh83u8a-tracekit.vercel.app. Its Git SHA and branch were verified. No production deployment or promotion occurred.

## Configuration changes

Only `TRACEKIT_USE_STAGING_CORE_CREDENTIAL=enabled` was added for Preview branch `ws022/acceptance-runtime-diagnosis` on `tracekit-staging`. It selects the already provisioned staging credential. No credential value was read, replaced or rotated. Environment inventory increased from 38 to 39 entries; all 38 prior entry IDs, scopes, types and update timestamps were unchanged, including production entries.

WorkOS Staging callbacks increased from 16 to 18; sign-out URIs increased from 5 to 7. The authorized original `12hzpje48` callback/root and resulting `d9dh83u8a` callback/root were added. Existing entries and defaults were retained; saved entries were reopened and screenshots captured. Exact URLs are in RESULTS.json.

## Live results on the exact redeployment

A callback request without required parameters displayed the intended HTTP 400 restart page. Its link began fresh authorization; existing Admin AuthKit SSO completed the callback with HTTP 307. The application root then failed with HTTP 500: `Persistent identity storage failed (401)`.

This proves the bounded restart/provider callback flow, not application acceptance or a real delayed-browser expiration reproduction. Customers, Orders, governed controls and foreign-tenant tests cannot be certified when persisted identity resolution fails first. Earlier role and tenant evidence remains attributed to its original deployment and commit.

The new failure is separate from the earlier Core 401. `SupabaseIdentityTenancyRepository` uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It already sends newer secret keys as `apikey` only, with Bearer used for legacy JWT keys. No header workaround was applied.

Read-only Supabase gateway log aggregates for project `uoeosoiegatlqtzemsfv`, from 2026-10-15 05:54:00 to 05:55:30 UTC, show two PATCH requests to `/rest/v1/tracekit_users` returning 401. Both `unauthorized_hint.error_code` and `sb_error_code` are `UNAUTHORIZED_INVALID_API_KEY`. These are normal sign-in synchronization attempts, not membership or role changes. WorkOS authentication succeeded while identity persistence failed; application session resolution did not grant access without persisted identity.

The presented Preview identity credential is not accepted by the configured project's API gateway. Its exact value, validity history, revocation status or possible project mismatch was not inspected. Rotation is not assumed to be the cause. No credential values, prefixes, hashes, authorization headers, cookies, private identity identifiers or live financial/provider payloads were selected or published.

## Evidence qualification and independent assessment

Earlier evidence described deployment metadata as omitting the staging selector. Deployment API `env` arrays can be empty or redacted, so they are not direct runtime proof. The supported evidence is the project environment inventory, selector source and observed baseline 401. Core acceptance of the existing staging credential remains unverified because the new deployment fails at identity resolution before Core reads.

The separate `lint_independent_review` reviewer corroborated the identity repository's configuration/header behavior and failure propagation. The gateway error indicates credential rejection before membership/RLS authorization. The reviewer confirmed that it does not establish rotation, a wrong key versus wrong project pairing, or successful Core remediation. This is independent source/evidence assessment, not independent live browser acceptance.

## Owner, next verification and rollback

The Staging/Supabase credential custodian must verify or repair the existing Preview project/key pairing. Credential changes require additional explicit authorization; no secrets should be sent in chat. The user was notified. WS-022 must then redeploy the same reviewed SHA, verify any new exact URL and its Staging registration, and rerun identity, Customers, Orders, client/Admin permissions, foreign-tenant denial and callback recovery. Do not bypass identity checks or borrow production credentials.

If separately requested, configuration rollback removes only the new branch-specific selector entry `3VHIVjYLeGJXF9GR` and the four new WorkOS URI entries, retaining all prior entries/defaults. No credential, membership, schema, provider or financial rollback is needed for this pass. The rejected identity credential was not changed by this work.

Prior checks retain their tested SHA: full UI 1,465 passed, zero failed/skipped; lint zero errors/nine inherited warnings; TypeScript zero diagnostics; build passed. No application code changed during this configuration-only pass. Database evidence and inherited WS-024 provenance remain unchanged.

PRs #575, #576 and #577 remain draft. Production V1 HOLD; WS-001 monetary certification HOLD; Meta inactive and uncertified. Updated application acceptance remains blocked, not waived.

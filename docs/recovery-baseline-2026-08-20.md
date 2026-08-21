# TraceKit recovery baseline — 2026-08-20

This is the frozen recovery checkpoint for the first initialized TraceKit installation.

- Stable branch: `recovery/current-tracekit-ui`
- Stable tag: `tracekit-recovery-stable-2026-08-20`
- Verified deployed SHA: `b1ae5ff0582d27cf16015ba8a0521009f5ced99f`
- Stable Preview: <https://tracekit-recovery-tracekit.vercel.app>
- WorkOS callback: `https://tracekit-recovery-tracekit.vercel.app/auth/callback`
- Supabase project ref: `uoeosoiegatlqtzemsfv`
- Migration boundary: migration 063 is applied; no later migration is approved for this baseline.

## Required Preview configuration (names only)

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKOS_CLIENT_ID`,
`WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `COMMERCE_CREDENTIALS_ENC_KEY`,
`COMMERCE_CREDENTIALS_KEY_ID`, `NEXT_PUBLIC_API_BASE_URL`,
`TRACEKIT_API_BASE_URL`, and `TK_SECRET_KEY`.

## Expected initialized identity state

- `tracekit_users >= 1`
- `tracekit_accounts = 1`
- `tracekit_organizations = 1`
- active organization-owner membership = 1

Preview deployments must be Git-backed from clean commits. Finished work must not
remain only on a local branch or in a working tree. Production Vercel remains
separate from this recovery Preview.

## Recovery ownership and regression rules

- `main` will eventually become the authoritative complete product branch after recovery.
- Finished features must be merged into that authoritative branch; no completed feature may exist only in a working tree or local-only branch.
- A Git-backed Preview from a clean commit is required before production promotion.
- The capability regression gate must pass before merge.
- The current capability inventory is maintained in `docs/tracekit-capability-manifest.md`.

# Read-only scope inspection and prepared live acceptance

Candidate fixed at `bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6`; staging deployment `dpl_6v7oRFdwYX3TbGpz5PwgsPQCUytF`. This follow-up was explicitly requested by the user. No code, membership, role, invitation, provider or financial mutation was made.

## Existing membership inspection

Used connected Supabase read-only execute_sql SELECT queries over information_schema and existing tracekit_users/memberships/roles/accounts/organizations/business_context_access/business_contexts/permission_overrides. No DDL, DML, grants, impersonation, auth-token extraction or role change. The connected project's allowed business-context ID matches the exact workspace option observed in the authenticated preview during the prior pass. Vercel's public-variable metadata is marked sensitive and its single-variable read did not return a value; no secret extraction or env-file pull was attempted.

The previously observed client identity has exactly one active existing client-read-only membership for its active organization, effective with no expiration, one active explicitly granted business context, and no permission overrides. Membership account_id is null; source resolver derives the owning account from the organization. A further SELECT confirmed that owning account is active and typeclient, and the organization is active. Existing role behavior and UI confirmed client account context. Private user/member/tenant identifiers and names are excluded from public evidence.

Read-only inspection identified two real active organizations outside that client's sole membership for live foreign-tenant probes. It also identified one existing effective platform-owner member on an active platform account. This resolves the earlier identity/scope discovery prerequisite; only browser authentication is required before live checks. No bootstrap or owner-creation route will be invoked.

## Prepared checks

After client authentication: verify exact preview callback/re-login, reload persistence and unchanged allowed scope; read-only GET probes to scoped customer endpoints using both real foreign organization targets and tenant-hint aliases; compare with allowed-scope behavior. Do not equate an anonymous or nonexistent-target404 with authenticated foreign-tenant denial.

Then sign out the client and prepare email sign-in for the existing platform-owner account. Avoid concurrent same-host authentication flows, which could overwrite the client's PKCE state. Pause only for the user's browser authentication. After Admin sign-in, verify platform/client separation, existing allowed scopes, governed controls and read-only chargeback list/detail behavior. No live financial/provider action will be submitted; any write-boundary/race cases use the already reviewed synthetic harness.

## Actual state at this record

Client browser remains at the existing-password challenge. Completed email re-login/persistence and live foreign-tenant probes are **NOT YET EXECUTED** in this pass. Existing Admin sign-in is identified/prepared in sequence but not opened concurrently. Prior authenticated client persistence/logout/denials remain separately attributed to staging-allowlist-acceptance/REPORT.md.

Remaining blocker: user completes client password challenge in browser, then existing Admin authentication when prompted. No password/code is requested in chat, retrieved, reset or saved. Both PRs stay draft; Meta inactive; WS-001 financial certification held; Production V1 HOLD.

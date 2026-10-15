# WS-021 invitation onboarding recovery

Status: REVIEW / NOT DEPLOYED. Baseline: main 57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3.
Branch: ws021/invitation-onboarding-recovery.

## Findings

The supplied production WorkOS screenshot confirms the Initiate login URI is /auth/sign-in and the User invitation URL is unset. The observed callback error is missing_pkce_cookie. That proves absent callback verification, not why the cookie disappeared. Current AuthKit 4.3.1 getSignInUrl establishes PKCE but does not forward invitation_token. TraceKit's sign-in route discarded invitation parameters and callback never bridged provider acceptance to the persisted customer invitation. The root no-membership screen also lacked invitation recovery.

## Candidate

- Validate one bounded invitation token and read its provider record server-side; require pending, unexpired application invitation.
- Start the SDK PKCE flow, add invitation_token to the generated authorization URL, and preserve only provider invitation ID in SDK-sealed custom state. No token in custom state, logs or client data.
- After successful non-impersonated login, require verified email, provider acceptance by the exact WorkOS user, and exact saved provider-to-TraceKit invitation mapping. Invoke the existing acceptance RPC; it rechecks pending state, expiry, recipient, active client/organization, read-only role and explicit workspace scopes atomically.
- Preserve authentication if acceptance/persistence is unavailable. Pending invitation UI remains available.
- Route successful acceptance through invitations to the normal customer landing when there are no pending invitations and an effective membership exists. Multiple pending invitations remain visible; no bulk acceptance.
- After successful exact acceptance, select the returned organization through the existing signed active-organization cookie. This prevents a previously selected client from controlling the new invitation landing; authorization still rechecks persisted membership and workspace access.
- Missing PKCE callback performs one fresh SDK sign-in with a short-lived HttpOnly recovery guard. It never exchanges the rejected code or trusts unverified callback state. Repeated failures show a recovery link. Correct SDK error extraction now retains diagnostic codes.
- Add invitation discovery to the root no-membership screen; use full navigation for sign-in.

## Validation

37 focused tests PASS, including existing 32 authorization tests, three onboarding policy tests and two bundled actual-route tests. Route tests use isolated provider/repository/SDK mocks; they are not live OAuth certification. Covered: PKCE URL preservation, exact invitation mapping, verified identity, unrelated and impersonated session denial, no injected workspace grants, bounded retry and state mismatch fail-closed behavior.
Targeted lint PASS. Production build PASS on Next.js 15.5.23. Initial build failed during generated-directory cleanup (ENOTEMPTY); clean-output rerun passed. Existing unrelated build warnings remain.
No dependency/lockfile changes, migrations, WorkOS configuration changes, live membership mutations, provider sends, merge, push or deployment.

## Release requirements

1. Independent authentication/security review and current-main reconciliation; retain WS-022 dependency boundaries.
2. After approved code release, configure WorkOS User invitation URL to https://app.trace-kit.io/auth/sign-in so email entry reaches this handler with invitation_token. Confirm WorkOS actually forwards that parameter. Do not change certified callback, sign-out or Initiate login URI.
3. Run an authorized real new-user email test, including new/existing identity, desktop and iPhone email launch, same browser callback cookie, exact read-only selected workspace, logout/re-login and tenant/admin denial.
4. Verify provider accepted state/acceptedUserId after the authorization-token handoff. If the provider does not report acceptance, the candidate deliberately leaves TraceKit acceptance pending rather than granting access.
5. Regression-check existing customer landing, platform administrator and distinct Admin Client View; inspect failure diagnostics without logging tokens or cookie values.

The candidate does not prove the original missing-cookie cause is removed. Live configuration and browser verification are mandatory before declaring new-client onboarding PASS.

## Review follow-up

Current main was refreshed and remains 57eaec27. No auth/invitation/identity file overlap was reported in comparison with workstream/ws-023-core-ui-regression. Focused tests also verify organization selection only after successful exact acceptance and no selection during unrelated or impersonated login. Publishing remains pending because the repository's Vercel integration previously built previews for both production and staging projects on PR publication; the earlier no-staging-deployment boundary remains applicable.

## Rollback

Record current production deployment and current WorkOS User invitation URL immediately before release. Restore the recorded build and invitation URL on failure, then revert only these source changes. Preserve accepted memberships, workspace access, invitation history, unrelated migrations and certified authentication redirects. No schema rollback required.


## October 14 staging recovery checkpoint

PR #573 remains a review candidate; no merge or production release is authorized.
Published callback-origin fix: cf304736ab3f59c4389a18f76a6b2e2a5f8b9f33.

Observed staging findings:
- Existing WorkOS users reject application signup invitations with HTTP 400 / user_already_exists. TraceKit access removal does not delete provider identities. Existing-user notification remains an open delivery requirement.
- An authorized fresh-signup reset and resend produced a received staging email. Provider invitation became accepted while the TraceKit invitation remained pending.
- Staging Initiate login URI pointed at production; an independent configured callback pointed at the WS-022 preview. Staging User invitation URL and Initiate login URI were explicitly authorized and changed to the WS-021 branch preview sign-in route. Callback allowlists and production deployment were preserved.
- Preview sign-in now supplies a callback on the request's trusted Vercel branch/build hostname; unrelated hosts and non-HTTPS origins fail closed.
- A fresh verified sign-in recovers exactly one persisted pending invitation only after checking provider acceptance by the same user and email, then invokes the existing atomic acceptance RPC. Multiple pending invitations remain explicit-review only.
- Platform client detail independently showed the test invitation accepted and an active Read-only User membership. The user's screenshot showed Client Organization, Stem Labs client and workspace, without an Admin View banner. The user reported logout/re-login returned to the same customer page.

Fresh live tenant/admin denial and mobile signup checks are still unverified. No full new-client, agency or agency-client certification is asserted.

### Agency continuation

The persistent session resolver previously enumerated direct organization memberships only. Agency account memberships therefore never loaded assigned client organizations. The continuation change enumerates active assigned clients for the selected active agency, retains the agency account/role when selecting those clients, and reads workspace grants from the agency membership. Suspended agencies fail closed. A bundled actual-resolver test covers assigned/foreign/suspended selections and workspace membership binding.

Agency invitation issuance/acceptance and existing-user notification are still open; the current customer invitation RPC only supports client-read-only organization invitations. A client user of an agency's client remains an organization-scoped customer; an agency team member requires an agency account membership. Do not substitute one for the other or automatically assign agency-owner.

Validation: 56 focused tests passed before adding the explicit preview-host regression test; that new test also passed. These are mocked provider/database tests, not live agency certification.

### October 15 scope and acceptance follow-up

Session resolution now excludes organizations whose owning client account is inactive or has a non-client account type, including organizations reached through agency assignments. Suspending the client account removes its organization and workspace from the agency session while preserving the active agency account.

Explicit in-app invitation acceptance now selects the organization returned by the successful persisted acceptance RPC, using a signed user-bound cookie, and clears the previous business-context selection. Rejected or unverified acceptance sets no selection cookie, and callers cannot supply a target organization for acceptance.

Validation: 58 focused tests pass; targeted lint and full production build pass. Tests use isolated provider/repository mocks and do not establish live tenant isolation or agency invitation support. Agency issuance/acceptance, existing-user notification and live mobile/denial verification remain open.

## October 15 tenant invitation implementation candidate

Implemented agency account invitations using agency-read-only and explicit selected workspaces from active assigned clients. Agency-client invitations retain client-read-only organization membership; an agency administrator must have an active assignment and explicit workspace access. Database acceptance revalidates intended verified identity, target/account status, role, workspace status and relevant agency assignment. Membership, workspace grants, invitation consumption and audit commit atomically. Existing memberships, including removed/suspended records, are not silently reactivated.

Added platform-governed agency client assignment controls. Removing an assignment removes the agency's individual workspace grants and revokes affected pending invitations. Reassigning does not restore removed grants. No live assignments or memberships were created by this implementation turn.

Added a signed, user-bound account-selection cookie so accepting an agency invitation selects the agency membership even when the identity already has a direct client membership. Agency organization choices now require explicit active workspace grants. Platform operator precedence is preserved.

Existing WorkOS identities now use a durable sign-in-required outcome, with a copyable TraceKit invitation link and verified-email acceptance. This is an existing-user acceptance path, not automatic notification: WorkOS sends no email for this outcome, and the UI states that explicitly. A transactional email provider remains required for automatic existing-user invitation emails. Unknown provider outcomes cannot be retried, durable settlement rejection cannot report a successful send, and the new RPC returns retry eligibility including cooldown/attempt limits.

Rollout: TRACEKIT_TENANT_INVITATIONS_ENABLED defaults to false. While disabled, existing client lifecycle calls retain the previous RPCs and agency issuance/assignment controls remain disabled. Apply 20261015030546_ws021_tenant_invitations.sql to the verified staging database, verify server-only privileges/RLS, then set the flag only for the WS-021 staging preview and redeploy. Do not enable on other previews or production. Previous RPCs remain intact for compatibility with older deployments.

Activation blocker: the connected Vercel staging project's preview NEXT_PUBLIC_SUPABASE_URL is stored as a Secret and is not returned by the connector. The connected Supabase account lists several ambiguously named projects. None was guessed or mutated. Obtain the exact staging project ref before applying the migration; confirm database isolation from production.

Validation: focused actual-route, authorization, cookie, session and delivery tests pass. The tenant RPC was executed in a disposable PGlite PostgreSQL harness against the repository's actual tenancy schema, business-context schema and migrations. Covered agency/client role and membership separation, wrong/unchecked provider identity, wrong recipient, unverified email, duplicate/replayed acceptance, removed assignments, disabled workspaces, suspended client accounts, explicit permission denial, unauthorized/read-only issuance, expiry/revocation, delivery lease ownership, cooldown/attempt exhaustion, unknown outcomes, assignment removal/reassignment and atomic rollback on audit failure. The harness omits the unsupported pgcrypto extension declaration (built-in UUID generation is used) and stubs an unrelated commerce metadata predicate; it is not live Supabase/PostgREST or browser acceptance certification. Targeted lint and full production build pass, with existing unrelated build warnings.

Remaining live acceptance: verify the migration target, enable only staging, create a controlled agency and client assignment, then test new and existing identities, email-only login, correct shell/workspaces, logout/re-login, cross-tenant denial and admin denial. Production remains on hold; no merge or production release.

### Confirmed staging database and migration execution

User identified https://joahiwgidfbzwzyslrbq.supabase.co as staging. Read-only preflight found certification agency/client records but no customer invitation, delivery or admin provisioning RPCs. Applied the repository's ws020_customer_invitations, ws020_invitation_email_delivery, ws021_platform_admin_provisioning and ws021_tenant_invitations migrations to that project, in dependency order.

A live SQL transaction created disposable operator/agency/client/recipient fixtures, issued and accepted an agency invitation, asserted agency-read-only account membership plus exact workspace grant, and rolled back. Post-rollback fixture count was zero. Verified the new RPC is SECURITY INVOKER with empty search_path, service_role execution permitted, anon/authenticated execution denied, and delivery table RLS enabled. Advisor delta was only the expected informational delivery-table RLS-with-no-public-policy notice; this table is deliberately server-only. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

Configured the confirmed database URL and disabled invitation flag only for the WS-021 branch on tracekit-staging. The stored private database credential is not retrievable through the connector, so a branch-scoped build check verifies server-only catalog access without printing credentials or error bodies. A failed credential check must prevent a replacement READY preview. No production environment or other branch configuration was changed. End-to-end browser acceptance remains pending a successful credential check and feature activation.

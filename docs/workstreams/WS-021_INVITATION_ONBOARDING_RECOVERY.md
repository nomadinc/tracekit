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

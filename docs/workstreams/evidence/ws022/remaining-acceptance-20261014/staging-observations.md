# WS-022 staging execution observations

Candidate88f7411457b988e83e51fbc9bf7b4b5b76002fe7; exact preview https://tracekit-staging-38p6rybzt-tracekit.vercel.app; deployment dpl_7kVc4eqTa3QseM9rMyRjGXkFhZ3U. Executor observations, not independent staged certification.

## Logout investigation and correction

WorkOS dashboard visibly identified environment Staging (`environment_01KZ1RW7BEJ57BNJNPP5JRQD7G`) and application client_01KZ1RW7ZH5X45Y1A8M3YAYDP5. Existing sign-out allowlist contained three destinations: historical tenancy preview root, app.trace-kit.io root, and app.trace-kit.io/auth/signed-out. Exact WS-022 preview root was missing. The prior observed logout landed on the production signed-out page.

Added ONLY `https://tracekit-staging-38p6rybzt-tracekit.vercel.app/` to that Staging application's sign-out URIs. Saved, reopened and verified four destinations. Existing entries/default were preserved. No production WorkOS environment, Vercel production configuration, credentials, memberships, roles or invitation changed. No application edit needed; independent code review confirms returnTo is derived from trusted server-owned origin and installed SDK clears cookie and supplies returnTo.

With the existing authenticated no-membership session, navigating to the exact preview /auth/sign-out now reaches staging AuthKit Sign in with redirect_uri equal to the exact preview /auth/callback. It no longer lands on app.trace-kit.io. A separate no-session HTTP check returns307 to the same preview root. The current preview root is protected and therefore redirects signed-out users to the staging login page; this is expected.

## Email/member identity boundary

Attempted preferred email sign-in using the previously existing anthony@trace-kit.com identity. WorkOS accepted the email and displayed its existing-password challenge. No password was supplied, reset, retrieved, or changed by the agent. The user was asked to complete sign-in in the browser with an already-authorized member identity and identify existing Admin/client accounts and intended tenants/workspaces. No account identifiers with those memberships were supplied at the time of this record.

The prior run verified Google login, persistence over reload, logout cookie clearing and re-login for this identity, but the application explicitly denied access because it has no active membership. Those observations are inherited from the preceding execution and do not establish Admin/client acceptance. The current follow-up verifies corrected logout and email challenge, not a fresh completed email login/re-login.

| Role / tenant | Current authenticated acceptance |
|---|---|
| Existing anthony@trace-kit.com / no effective membership | Prior sign-in/persistence/re-login observed; no TraceKit access; current corrected logout observed |
| Authorized Admin / intended tenant and workspace | BLOCKED: existing member identity and login needed |
| Authorized client / intended tenant and workspace | BLOCKED: existing member identity and login needed |
| Admin versus client / direct foreign tenant | BLOCKED: two member sessions and intended allowed/denied tenants needed |
| Governed-action permissions | Synthetic independent tests pass; authenticated staging BLOCKED |
| Chargeback list/detail/null currency/races | Actual route-to-render synthetic independent tests pass; member staging BLOCKED |
| Inactive Meta and connectors.manage separation | Synthetic route/service independent tests pass; member staging BLOCKED; no OAuth/sync activated |

Rollback for configuration correction: an authorized staging owner may remove only the exact added preview-root entry if needed; retain the prior three entries and default. No production rollback is authorized or necessary.

No cookies, authentication headers, passwords, codes or state-bearing login URLs are recorded in this package.

# Approved WorkOS Staging change and continued acceptance

Candidate and deployment unchanged: `bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6`, `dpl_6v7oRFdwYX3TbGpz5PwgsPQCUytF`, https://tracekit-staging-50e8hokzy-tracekit.vercel.app, READY/Preview. No new code or deployment was needed.

## Authorized configuration change

The user explicitly authorized the two exact URLs. Verified WorkOS environment Staging `environment_01KZ1RW7BEJ57BNJNPP5JRQD7G`, application `app_01KZ1RW86NFKPDAG16GW5FJTRA`. Added only `https://tracekit-staging-50e8hokzy-tracekit.vercel.app/auth/callback` and sign-out `https://tracekit-staging-50e8hokzy-tracekit.vercel.app/`. Saved and reopened both lists: callback count15→16; sign-out count4→5. Existing entries and defaults preserved; no production configuration, credentials, memberships, roles, invitation settings or invitations changed. Saved screenshots show verified state. Screenshots contain configuration only, no session/login state, email addresses or financial payloads.

## Fresh authenticated client observations

Opening the exact preview completed an existing WorkOS session into an existing authorized client-read-only member. Private identity and tenant labels are intentionally excluded from this public evidence package. Account menu confirmed role client-read-only, account type client, active authorized organization and workspace. No member was created or changed.

- Session and selected allowed workspace persisted after navigation and reload. Only one authorized workspace was available; cross-workspace switching is not certified. Selecting the portfolio placeholder returns to the first allowed workspace, consistent with the existing server resolver fallback; no wider scope was granted.
- Direct `/platform` navigation showed404 rather than Admin content; client navigation had no Admin controls.
- `/settings/integrations/meta` showed access denied/missing permission. No OAuth or sync action was invoked.
- `/dashboard/chargebacks` API returned404 resource_unavailable. Source review confirms detailed financial reads require both financials.view and orders.view_financials; this role lacks the latter. This is a verified permission boundary, not successful currency/detail rendering.
- Authenticated Sign Out returned to Staging AuthKit with redirect_uri equal to this exact preview callback, not production.
- Navigating to the protected preview root after logout required Sign in again, demonstrating behavioral session clearing. Cookie values were neither read nor saved.
- Preferred email re-login for the existing client reached its existing-password challenge. No password/code was entered by the executor, retrieved, reset or saved. User completion requested in the browser; completed re-login is still pending.

## Remaining access and certification

Existing Admin member login and expected valid allowed/denied organization/workspace targets are still required. Direct foreign-tenant denial, Admin/client matrix, privileged chargeback currencies/detail races and permitted governed-action UI cannot be certified from a client-read-only session. Prior51focused synthetic authentication/tenant/Meta/Edge/API-to-render currency cases passed at the exact candidate, separately attributed. No live financial/provider write or Meta activation occurred.

Earlier full UI/audit/build checks, DB1115/0/0 at88f7411 and inherited WS-024 evidence retain original commits. This configuration/browser pass is executor evidence, not independent live staging certification. WS-022 policy maintenance acceptance remains closed. Both PRs remain draft; WS-001 monetary reporting held, Meta inactive/uncertified, Production V1 HOLD.

## Configuration rollback

If authorized later, remove only the two URLs added in this pass from this Staging application. Preserve all prior entries/defaults and the original88f7411 preview registration. No production rollback, credential change or database action is required.

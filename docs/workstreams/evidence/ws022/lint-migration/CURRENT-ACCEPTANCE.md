> Latest reviewed candidate is1ea9c54852c5e0e894139a54ba26474cb6002198; READY jc36knwwd Preview, managed preflight200, exact UI1467/0/0. See [remaining acceptance](remaining-hardening-20261016/LEDGER.md). Final Admin browser authentication pending; completed775 client results remain inherited with original provenance.

> Client logout/re-login and post-login reload persistence are now CLOSED on exact775 recovery Preview. See [closure](recovery-client-acceptance-20261016/RELOGIN.md); prior pending wording below is historical.

> Latest exact775 ordinary-client results: [REPORT](recovery-client-acceptance-20261016/REPORT.md). Client identity, persistence, workspace access and tested denial boundaries pass. Final logout/re-login awaits user authentication.

> Latest exact775 recovery-preview Admin results: [REPORT](recovery-admin-acceptance-20261016/REPORT.md). Identity storage and Stem Labs Customers/Orders now pass for Admin. Client authentication is pending; earlier observations below retain their original commits.

> Follow-up: the callback/sign-out configuration prerequisite below is now CLOSED by explicit user authorization and verified additions. See staging-allowlist-acceptance/REPORT.md for fresh client-session evidence and remaining identity blockers. Earlier observations below are retained as historical evidence.

# WS-022 maintenance acceptance and exact-preview follow-up

PR576 head `bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6` records the explicit user decision: WS-022 owns React deprecations, relative navigation, page links and anonymous default-wrapper names. Maintain regression tests; review compatibility on React/Next.js/lint dependency changes; preserve coverage; document replacements/transfers. Ownership decision CLOSED. No security waiver, merge or production deployment authorization. Both PRs remain draft.

Independent reviewer inspected only the five documentation/evidence changes fromb563049a to currenthead and confirmed accurate ownership and DB provenance; no accuracy blocker, no new code/test execution claimed by that reviewer.

Current exact-SHA staging deployment: `dpl_6v7oRFdwYX3TbGpz5PwgsPQCUytF`, https://tracekit-staging-50e8hokzy-tracekit.vercel.app, READY, Preview, project `prj_KPHnqsNayx17VXmMIp7Rasrsp7gc`, team `team_QFcd7GbqA7MfBH9bPM0kAqG9`. Git source matches full candidate SHA and `ws022/maintained-lint-stack`. All three automatic Vercel checks succeeded. Earlier b563049a preview also READY but is not substituted for currenthead.

Currenthead serial lint contract:4passed/0failed/skipped; lint0errors/9unchangedwarnings; TypeScript0diagnostics. Focused auth/tenant/Meta/Edge/API-to-render currency checks rerun through the authoritative repository runner; **51passed,0failed/skipped** (42+9), raw counts in current-head/focused-acceptance.log. Earlier full UI1462/0/0, clean install/tree, audits0 and local build atb563049a remain accurately attributed to that unchanged implementation. New remote preview build passed at currenthead.

Signed-out probes: protected root/dashboard/Meta settings redirect to WorkOS with exact preview callback; no-session logout307 to same preview root; missing-auth Edge POST401 unauthorized before persistence. GET Edge405 matches POST-only handler. /api/health404 is not a configured health implementation and is not claimed as healthy. No authenticated tenant isolation or logout/session-clearing acceptance follows from these probes.

Browser preview reaches WorkOS “Invalid Redirect URI.” Inspected WorkOS Staging `environment_01KZ1RW7BEJ57BNJNPP5JRQD7G`, application `app_01KZ1RW86NFKPDAG16GW5FJTRA`:15callback URIs and4sign-out URIs contain the original88f7411 preview but not the new exact preview. New callback/root registration requires action-time confirmation under computer-use security-access policy; approval requested. Existing defaults/entries preserved and no configuration changed in this observation.

Separate remaining identity blocker: authorized existing Admin/client member sessions and expected allowed/denied organizations/workspaces have not been supplied. No memberships, invitations or roles created.

Database cases were already executed at88f7411457b988e83e51fbc9bf7b4b5b76002fe7:4focusedpassed and fullAPI1115passed,0failed/skipped, disposable schema cleaned. See immutable prior evidence4def7a82567f28db686e992a6ba72d688da2aca1/docs/workstreams/evidence/ws022/remaining-acceptance-20261014/database/. This is prior fresh evidence, not new execution or relabeled WS-024 inheritance.

A direct tsx invocation in this pass was sandbox-blocked (EPERM pipe); the authoritative runner succeeds. Raw failure is preserved separately, not counted as an application failure.

Affiliate/source financial reporting remains held for WS-001. Meta remains inactive/uncertified. Production V1 HOLD. Rollback remains in COVERAGE.md; owner acceptance does not change release authorization.

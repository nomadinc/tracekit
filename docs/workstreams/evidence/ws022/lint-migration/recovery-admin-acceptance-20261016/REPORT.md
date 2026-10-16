# Exact recovery-preview Admin acceptance — 2026-10-16

Candidate: `775cbec41b1d937ea59a56d47276ae1a0ecc1c36` (unchanged application code).
Deployment: `dpl_21SY95PQASdmA9RiDoANK6VebD8s`, Preview, https://tracekit-staging-5bmzzfyf8-tracekit.vercel.app.
Project: Tracekit / tracekit-staging; Supabase project uoeosoiegatlqtzemsfv.

User completed existing Admin browser authentication. Persisted platform-owner role and database-backed catalog of four existing clients loaded. This closes identity-storage failure for the tested application session; the prior managed zero-row check alone did not establish this.

| Boundary | Fresh outcome |
|---|---|
| Identity and Admin scope | PASS: platform-owner; platform navigation and four-client catalog. |
| Explicit support scope | PASS: Stem Labs and Accufy, visible ADMIN VIEW banner; support view is not an ordinary client role. |
| Stem Labs Customers | PASS: list and customer detail GET200; customer evidence workspace renders. |
| Stem Labs Orders | PASS: list and selected-order query GET200, related customer detail GET200; Order workspace renders. Separate Core credential path is now accepted for these reads. |
| Temporary not-found state | OPEN UI defect: both pages show not-found between successful list completion and detail completion; they subsequently render. No permanent not-found/upstream401 reproduced. WS-022 frontend owner. |
| Allowed connected resource | PASS: existing Stem Labs connector loads and persists after full reload. |
| Selected-scope foreign resource | PASS: existing TraceKit-owned connector under Stem Labs support scope returns404 with no detail. Does not substitute for ordinary-client denial. |
| Privileged chargebacks | PASS for reads: Stem Labs successful empty portfolio; Accufy50rows, detail opens; currency unknown explicit. Two successive row selections leave one detail panel. Forced out-of-order network race not established. |
| Meta | PASS inactive display: Accufy settings accessible to Admin, Sync: Off; connect/save controls not invoked. Meta remains uncertified. |
| Accufy Orders | INCOMPLETE: still loading during the observation window; no empty, unavailable or settled success asserted. |
| Governed actions | INCOMPLETE: no live action invoked; full role control matrix still requires ordinary-client comparison and detail controls. |
| Admin persistence | PASS: full reload retained Admin support scope and allowed connector. |
| Logout/session clearing | PASS limited observation: Sign Out led to WorkOS Staging sign-in with recovery-preview callback, not production signed-out page; authenticated app no longer displayed. Cookie bytes were not inspected. Full client re-login pending. |
| Callback recovery | Fresh Admin callback recovered into persisted application. Historical delayed missing-PKCE-cookie cause remains unresolved; not relabeled as proven expiry. |
| Client role matrix | PENDING user browser authentication: existing client email sign-in prepared; no membership or invitation changes. |

No source changes or new full-suite execution in this browser pass. Prior exact775 UI1465/0/0, lint0errors9warnings, TypeScript0diagnostics, build passed retain their original execution provenance. Disposable API1115/0/0 and four focused4/0/0 remain at88f7411, separately from inherited WS-024 evidence.

Rollback: retain all prior evidence; remove only branch Preview sensitive entry t4sxLPrCSTGrmUCO to revert identity override, only with coordinated owner approval (restores known failing configuration). Core selector3VHIVjYLeGJXF9GR is separate. Never alter general Preview or production; do not promote deployments. Exact5bm WorkOS entries can be removed individually if retiring this preview; preserve defaults/other entries. Application SHA unchanged.

Production V1 HOLD. All three PRs remain draft. WS-001 financial certification held. Meta inactive/uncertified. No credentials, authentication state, private member IDs or financial payloads included.

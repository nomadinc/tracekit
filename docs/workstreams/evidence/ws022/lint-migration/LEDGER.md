# WS-022 tooling acceptance ledger

Baseline reviewed candidate: 88f7411457b988e83e51fbc9bf7b4b5b76002fe7 (PR #575, unchanged draft). Migration implementation: e1a6a38bf9694fc4356963f1a5ffe8c99520720f. Canary cleanup correction: 65d5cdef3d0d3021d256f88c1abb7122fb5a1486. This ledger concerns tooling only; inherited acceptance workstreams retain original commits and dispositions.

| Item | Disposition / evidence | Owner |
|---|---|---|
| Five high braces package records | Remediated by removing eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. Baseline fresh audit:5 high; migrated full+production:0 vulnerabilities. No suppressions/new overrides. | Tooling implementation |
| ESLint peer incompatibility | Remediated by supported pinned stack; clean npm ci and npm ls --all succeed. | Tooling implementation |
| 48 enabled rules / 14 Compiler deferrals | Explicit mapping and machine assertions; all 46 diagnostic checks have invalid/valid probes. JSX-used markers have no standalone diagnostic; no unused-variable rule existed. | Tooling implementation |
| Initial runner counted absent native count fields | Corrected to count native diagnostics; deliberate native error now fails lint and build. Never published faulty version. | Tooling implementation |
| Initial canary mismatch | Baseline comparison exposed three invalid fixture assumptions (App page-link discovery, duplicate-head class shape, polyfill URL). Corrected fixtures; baseline catches all46. Replacement then exposed memo display-name gap, corrected with explicit policy. | Tooling implementation |
| Independent review defects | React scope alias corruption, unrelated-class heuristic, optional catchall/index route matching and default-wrapper recognition corrected; independent report records validation. | Independent reviewer |
| First full build after canaries | Failed: synthetic empty pages directory caused hybrid-router nullable useSearchParams types. Harness cleanup fixed in65d5cdef; no application nullability workaround. Rebuilt after removing only the empty synthetic directory. | Tooling implementation |
| Parallel verification race | A TypeScript run overlapped temporary canary fixture removal and returned TS6053. Final verification is serialized; contract tests intentionally materialize files to exercise route discovery and the build gate. | Tooling verification |
| Nine lint warnings | Unchanged severity/rule-equivalent/location:3 Hooks exhaustive-deps,6 relative-location. Policy IDs/messages change for the latter. No warning suppressions. | Frontend owner (existing backlog) |
| Four repository-owned compatibility policies | **ACCEPTED maintenance ownership (user,2026-10-14)**: WS-022 owns React deprecations, relative navigation, page links and anonymous default-wrapper names. Maintain regression tests; review on React/Next.js/lint dependency changes; preserve coverage; document replacement or transfer. No waiver/merge/production authorization. | WS-022 |
| Inherited dependency deprecation notices | Reported in clean-install log; not audit vulnerabilities/peer errors. Existing ExcelJS/archive chain unchanged. | Dependency owner (existing backlog) |
| WorkOS Edge runtime build warnings | Inherited SDK CompressionStream/DecompressionStream warnings; runtime dependencies unchanged. Not certified by lint migration. | Authentication/platform owner |
| Current exact-SHA preview auth registration | CLOSED: user approved two exact URLs; added only callback/root to verified WorkOS Staging, saved/reopened. Counts15→16 and4→5; defaults and existing entries preserved. Authenticated client callback/logout on currentbcd856c3 preview observed. | WS-022 executor |
| Authenticated staging role/tenant acceptance | PARTIAL: existing client-read-only session entered allowed scope and persisted; direct Admin navigation denied, Meta permission denied, detailed financial API denied, logout returned to Staging and protected app required sign-in. Email re-login awaits existing password; Admin/cross-tenant and privileged currency/detail staging need authorized session/targets. No membership/invitation/role changes. | Identity custodian / WS-022 acceptance |
| WS-024 database evidence / four API cases | Prior fresh disposable-schema execution at88f7411457b988e83e51fbc9bf7b4b5b76002fe7 passed four focused cases and full API1115/0/0; durable evidence4def7a82567f28db686e992a6ba72d688da2aca1. No database rerun in this documentation/tooling pass. Inherited WS-024 evidence remains separate with original commits. | Database acceptance owner |
| Affiliate/source monetary certification | HOLD pending WS-001 certification. | WS-001 financial owner |
| Meta | Inactive and uncertified; no activation or provider writes. | Meta integration owner |
| Production V1 | HOLD; no merge, production deployment or risk exception. | Release owner |

Rollback is in COVERAGE.md. The dependent draft PR must remain draft pending broader WS-022 acceptance; maintenance ownership is accepted; green tooling checks do not clear the parent release holds.

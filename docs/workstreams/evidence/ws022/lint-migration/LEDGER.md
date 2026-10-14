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
| Four repository-owned compatibility policies | **OPEN owner decision**: accept maintenance/tests for full React deprecations, relative-location, route-aware page links and default-wrapper display names; or supply supported equivalent. No external drop-in equivalent established, no self-waiver. | Tracekit frontend/tooling owner |
| Inherited dependency deprecation notices | Reported in clean-install log; not audit vulnerabilities/peer errors. Existing ExcelJS/archive chain unchanged. | Dependency owner (existing backlog) |
| WorkOS Edge runtime build warnings | Inherited SDK CompressionStream/DecompressionStream warnings; runtime dependencies unchanged. Not certified by lint migration. | Authentication/platform owner |
| Authenticated staging role/tenant acceptance | BLOCKED on access to existing authorized Admin and client member identities. No memberships/invitations created. Original preview88f7411 unchanged. | Identity/application owner |
| WS-024 database evidence / four API cases | No fresh database execution in tooling task; inherited evidence retains tested commits. Do not infer skips closed from UI results. | Database acceptance owner |
| Affiliate/source monetary certification | HOLD pending WS-001 certification. | WS-001 financial owner |
| Meta | Inactive and uncertified; no activation or provider writes. | Meta integration owner |
| Production V1 | HOLD; no merge, production deployment or risk exception. | Release owner |

Rollback is in COVERAGE.md. The dependent draft PR must remain draft pending maintenance ownership and broader WS-022 acceptance; green tooling checks do not clear the parent release holds.

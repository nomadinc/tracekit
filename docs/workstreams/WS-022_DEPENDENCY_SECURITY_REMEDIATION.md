# WS-022 — Dependency Security Remediation

**Status: PARTIAL / REVIEW. Production dependency audits are clean. Final regression/migration certification remains on HOLD.**

Observed 2026-10-07. Current main was fetched and the isolated WS-022 branch rebased onto `4f65ca1a6ec349671373210a8ac6d55beca905a1`. Main’s intervening changes were documentation and a test, with no overlapping dependency upgrades. No other workstream branch, WS-019 acceptance evidence, production provider, database, credential, or business configuration was changed. The sole CI setting change is the explicitly authorized build-host Node 20 → Node 22 migration.

## Completion record

| Required field | Result |
|---|---|
| STATUS | PARTIAL / REVIEW; final acceptance HOLD |
| CURRENT MAIN | `4f65ca1a6ec349671373210a8ac6d55beca905a1` |
| BRANCH / WORKTREE | `workstream/ws-022-dependency-security`; `/workspace/scratch/61a85fe6297b/tracekit-ws022` |
| BASELINE AUDIT | UI 1 critical / 23 high / 3 moderate; additional package boundaries below |
| DEPENDENCY INVENTORY | Four independent packages; complete direct/transitive inventories retained |
| CRITICAL FINDINGS | Next direct critical advisories resolved; two remaining affected development packages arise from Tinypool advisories |
| HIGH FINDINGS | All remediable production high findings resolved; seven UI development affected packages propagate the unpatched braces advisory |
| MODERATE FINDINGS | Two UI CSS-tool affected packages and one nested test-tool package remain |
| NEXT.JS REMEDIATION | Next/eslint-config-next 15.5.27, safe PostCSS override, patched Sharp and other compatible transitive fixes |
| FILES CHANGED | Four manifests/locks, Node CI setting, config-test helper, WS-022 assessment/evidence |
| BEFORE / AFTER COUNTS | Per-boundary full/production counts below; all production-only counts zero |
| REMAINING ADVISORIES | braces, selector parser, Tinypool, Vitest mocker and propagated paths; development only |
| PRODUCTION EXPOSURE | Zero current npm production findings; audit scope is not proof against unknown vulnerabilities |
| REGRESSION TESTS | UI 1,357 / API 1,112; identical baseline failure titles, no new failures after test-helper compatibility fix |
| M3 / M4 SECURITY GATES | 105/106 pass; one unchanged M3 confirmation-path assertion fails |
| MIGRATION CHAIN | BLOCKED: disposable Supabase/Postgres unavailable; no production DB used |
| BUILD | Baseline, patched local and Vercel-mode production builds PASS |
| VERCEL COMPATIBILITY | Local Vercel build mode PASS; remote deployment/runtime not independently certified |
| CLOUDFLARE COMPATIBILITY | API, continuous-runtime and relay dry-run builds PASS; relay smoke tests 2/2 PASS |
| ROLLBACK PLAN | Revert both WS-022 commits and revalidate; no schema rollback |
| COMMIT | This continuation commit plus rebased initial patch `748cee56`; obtain exact final SHA with `git log` |
| PUSH STATUS | Not pushed; no PR, merge or deployment |
| BLOCKERS | Complete migration chain; existing regression failures; separate dev-framework risk/major review |
| SAFE TO INTEGRATE? | Not certified as completed remediation; bounded production fixes are review-ready subject to outstanding gates |
| WS-019 REGRESSION_GATES IMPACT | No production-proven upgrade; WS-019 owns acceptance |
| NEXT ACTION | Run complete disposable Supabase chain; review baseline failures and residual development advisories separately |

## Dependency inventory and actual install compatibility

Four independent npm boundaries: `ui`, `api`, outer relay, nested relay. No npm workspaces or root manifest. All use lockfile v3. Root dependency declarations match their manifests. The untouched nested relay lockfile failed clean installation because workerd platform entries were missing; the regenerated WS-022 lock passes. Root-only comparison in the initial assessment was insufficient to certify transitive reproducibility.

[dependency-inventory.json](evidence/ws022/dependency-inventory.json) includes baseline/final manifests, production/dev flags, exact locked versions, engines and every transitive node. Clean installs ran with lifecycle scripts enabled on Node 22.23.3/npm 10.9.4, as well as npm 11.9.0 checks. The CI workflow now selects Node 22. Manifests require Node >=22.11.0, matching existing WorkOS AuthKit minimum requirements; npm engines are not separately declared. Remote CI/Vercel settings were not changed or inspected.

`@workos-inc/authkit-nextjs` remains 4.3.1, React/react-dom remain 18.3.1, API Supabase JS remains 2.81.1. Authentication, session propagation, tenancy, RBAC, cache configuration, notification contracts and commerce/Edge source remain unchanged.

## Implemented changes

| Boundary | Package | Baseline installed | Final installed |
|---|---|---|---|
| ui | next | 15.5.23 | 15.5.27 |
| ui | eslint-config-next | 15.5.23 | 15.5.27 |
| ui | postcss | 8.5.6 | 8.5.29 |
| ui | sharp | 0.34.5 | 0.35.5 |
| ui | nanoid | 3.3.11 | 3.3.20 |
| api | sharp | 0.34.5 | 0.35.5 |
| api | ws | 8.18.3 | 8.21.0 |
| api | wrangler | 4.63.0 | 4.148.0 |
| api | @cloudflare/workers-types | 4.20260702.1 | 5.20261007.1 |
| relay | sharp | 0.33.5 | 0.35.5 |
| relay | ws | 8.18.0 | 8.21.0 |
| relay | wrangler | 4.50.0 | 4.148.0 |
| relay-worker | postcss | 8.5.6 | 8.5.29 |
| relay-worker | sharp | 0.33.5 | 0.35.5 |
| relay-worker | nanoid | 3.3.11 | 3.3.20 |
| relay-worker | ws | 8.18.0 | 8.21.0 |
| relay-worker | wrangler | 4.50.0 | 4.148.0 |
| relay-worker | vitest | 3.2.4 | 3.2.7 |
| relay-worker | vite | 7.2.4 | 7.3.7 |

- Next/eslint-config-next 15.5.23 → 15.5.27. The direct critical Windows RCE GHSA-p293-qw3h-jr36 and AVIF image optimizer RCE GHSA-2xp9-vwfh-vxw4 first have a Next 15 fix in 15.5.24; selected 15.5.27 includes later maintenance security releases. Current production audit has no Next finding.
- Next’s pinned PostCSS is overridden to 8.5.29 within major 8. A stale nested lock node was removed and regenerated by npm; clean install/tree validation verifies actual resolution, not just a declaration.
- Glob 10.5.0 receives minimatch 9.0.7 within its existing major. Other compatible transitive updates close brace-expansion, nanoid, source-map-js and related findings without forcing major frameworks.
- API Wrangler 4.148.0 and matching workers-types 5.20261007.1 install on the authorized Node 22 host. Explicit prerelease-qualified Miniflare overrides ensure npm 10 applies Sharp 0.35.5 consistently. Stable upstream Wrangler currently includes Miniflare 5 alpha internally; this is build/development tooling and not bundled production application code.
- Outer relay had no source importing its 31 production tooling declarations; nested relay source is dependency-free Hello World scaffolding. Those unused outer declarations were removed. Its Wrangler tool remains a dev dependency. No relay source/test was removed to hide findings.
- Nested relay retains Vitest 3, patched to 3.2.7, and worker-pool 0.8.71. Vite updates remain within baseline major 7. Scoped Miniflare Sharp/ws/undici patches and worker-pool Wrangler 4.59.1 remove high development findings while preserving the declared framework major.
- `worker-production-config.test.ts` normalizes Wrangler’s null-prototype TOML records using structuredClone. All exact queue, route, cron and control value assertions remain intact. No Worker config value changes.

No `npm audit fix --force`, advisory suppression, framework-major upgrade, auth redesign, RBAC broadening, migration, credential change, governed action, provider mutation, notification change, or business feature change.

Primary framework sources: [August Next security release](https://nextjs.org/blog/august-2026-security-release), [September release](https://nextjs.org/blog/september-2026-security-release), [September upstream hardening](https://nextjs.org/blog/nextjs-security-update-september-22-2026). Individual GHSA URLs and ranges are retained verbatim in audit evidence. September’s Next 16 ImageResponse RCE must not be misclassified as applying to this Next 15 baseline.

## Fresh before / after security audits

Counts are affected npm packages, not unique CVEs. Propagated findings and duplicate packages across boundaries must not be summed as unique advisories. Columns are critical / high / moderate / low.

| Boundary / scope | Before | After |
|---|---|---|
| ui / full | 1 / 23 / 3 / 0 | 0 / 7 / 2 / 0 |
| ui / prod | 1 / 6 / 0 / 0 | 0 / 0 / 0 / 0 |
| api / full | 0 / 5 / 1 / 0 | 0 / 0 / 0 / 0 |
| api / prod | 0 / 2 / 0 / 0 | 0 / 0 / 0 / 0 |
| relay / full | 0 / 5 / 0 / 0 | 0 / 0 / 0 / 0 |
| relay / prod | 0 / 4 / 0 / 0 | 0 / 0 / 0 / 0 |
| relay-worker / full | 2 / 14 / 1 / 0 | 2 / 0 / 1 / 0 |
| relay-worker / prod | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

All four production-only audits are clean. API and outer relay full-tree audits are also clean. Remaining UI and nested relay findings are development-only in their lockfiles and absent from production-only audit. This distinction does not automatically certify every development vulnerability as harmless.

## Advisory dispositions and residual risks

[advisory-inventory.json](evidence/ws022/advisory-inventory.json) records every baseline finding and current residual: installed versions, independent GHSA versus propagated path, severity, vulnerable range, selected patch or removal, exposure, reachability, remediation and breaking-change risk. Reachability was not proven by exploitation.

| Independent residual | Exposure and condition | Disposition |
|---|---|---|
| GHSA-vfj7-8cjw-p6xm, braces | UI build/lint glob patterns; seven affected-package paths propagate one high advisory. No runtime dependency finding. | Latest braces 3.0.3 is affected. Wait for upstream patch or separately review a supported Tailwind/path-removal upgrade. No major Tailwind change applied. |
| GHSA-rj75-hqrm-r3gf, selector parser | CSS build parsing; two moderate affected packages. Current Tailwind 3 tree uses parser major 6. | Patch is 7.1.6; a parser/framework compatibility review is required before crossing its major. |
| GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr, Tinypool | Nested relay test tooling: attacker-influenced worker options/prototype pollution can reach execution. Two critical affected packages (Tinypool and propagated Vitest), not two deployed services. | Both close at Tinypool 2.1.2. Current Vitest 3 depends on ^1.1.1. Do not force a cross-major pool override; separately review a supported Vitest major and matching Cloudflare test pool. |
| GHSA-82fw-gwwq-j7x9, Vitest mocker | Development redirect/mock server file-read path; no such server exposed during `vitest run`. | Patched at 4.1.11; separate Vitest-major review. |

CI deployment installs `api`, not nested relay test tooling. No caller-supplied CSS/glob/pool options or malicious input was exercised; trusted repository tests/builds are the observed scope. Keep development/test servers local and inputs trusted pending reviewed remediation. These are recommended compensating practices, not production-proven controls or advisory suppression.

## Regression results against untouched refreshed main

| Gate | Baseline | Patched |
|---|---|---|
| Full UI | 1,357 tests; 1,264 pass; 93 fail | Same counts/failure titles |
| Full API, concurrency 4 | 1,112 tests; 1,099 pass; 9 fail; 4 skipped | Same counts/failure titles |
| Standalone TypeScript | 60 diagnostic locations | Identical 60 diagnostics, no new locations |
| Configured ESLint | PASS with three existing hook warnings | PASS; same warnings |
| Production build | PASS on Node 22 | Local + Vercel-style builds PASS |
| Named auth/tenancy/M3/M4/Phase B gates | Included in full baseline | 105/106 pass; unchanged M3 confirmation-path assertion |
| Nested relay | Untouched clean install fails from incomplete workerd lock entries | Clean install and two worker smoke tests PASS |

Named gates include ApplicationSession, identity/WorkOS authorization boundary, return URLs, M3 authoritative Shopify execution/replay and atomic confirmation, M4.1 policy/safe-disable, M4.2 tenant/transition fixtures, M4.3 history, M4.4 notifications, Phase B fixture/ACL security, platform-admin transactions, WS-020 MCP/provider customer boundaries, and the current M5 policy-negative proof-plan contract. The sole targeted failure is `M3 all confirmation paths use the shared RPC with operation-specific target contracts`, unchanged on main. Full suites include commerce ingestion and Edge Intelligence tests. No production WorkOS session, Shopify action, replay or provider proof was exercised.

[regression-summary.json](evidence/ws022/regression-summary.json) preserves normalized failure titles, diagnostics and counts. Existing failures were not attributed to dependency upgrades or hidden. The initial new parser-prototype assertions were fixed only in the compatibility test helper; completed API reruns match baseline.

## Migration chain and deployment compatibility

**Complete Supabase chain: BLOCKED.** The existing script’s disposable-local-database guard exited 2. This environment has no disposable Supabase/Postgres instance, psql/Supabase CLI or Docker daemon. No extension/schema stubs, skipped migrations or remote production database were substituted. Static ledger/migration tests ran in the UI suite but cannot replace real complete-chain application. All migrations and WS-019 evidence remain byte-identical to main.

Run the existing `scripts/test-m15-authoritative-migration-chain.sh` in a disposable local Supabase environment with `TRACEKIT_MIGRATION_TEST_DB_URL` pointing to localhost and `TRACEKIT_MIGRATION_TEST_DISPOSABLE=1`. Its final migration target is discovered from current main. Do not use production connection details.

Vercel: `VERCEL=1 npm run build` passes locally on Node 22 with existing App Router, Server Components, API routes and middleware; remote project runtime/staging deployment is not independently certified. Local normal production build also passes.

Cloudflare: latest Wrangler dry-run compiles API, continuous-runtime and relay without uploads. Worker source, routes, bindings, cron schedules, secrets and compatibility dates are unchanged. The old test-pool runtime falls back from relay’s 2025-11-21 date to 2025-09-06; its two smoke tests are not production runtime certification. Tests/config invariants preserve all existing production controls. No environment/credential file changed.

## Rollback and recommendation for WS-019 M5

If not integrated, discard the isolated WS-022 branch. If separately approved/integrated later, revert the continuation commit and initial patch `748cee56`, restoring manifests/locks, Node CI setting and test helper, then rerun install/build/security gates. Rollback restores known vulnerable dependencies and Node 20; it is emergency regression recovery, not a security-ready long-term state. No database rollback required.

**Production dependency remediation is locally review-ready, but final WS-022 acceptance is not certified.** Require complete-chain execution, independent disposition of existing failing regression gates and explicit residual-development risk review before WS-019 closes its release blocker. Production-only audit improvement must not mark `regression_gates` production-proven. Do not mark overall Production V1 ready.

Next action: run the disposable migration chain; separately review a supported Vitest 4.1.11/Cloudflare test-pool 0.23.0 combination, verifying that Tinypool is removed or patched to >=2.1.2, and the Tailwind/parser major or upstream-backport path. Those framework majors were not installed in this workstream. Push, PR, merge and deployment still require separate authorization.

# WS-022 Tooling Migration — Local Review Candidate

Status: PARTIAL. Tailwind and lint-tool migration implemented and validated locally. Dependency-security acceptance and production release remain HOLD.

Baseline: f7f008cd on ws022/security-closure-20261014, including the reconciled PR544 and the prior critical-dependency remediation. Production main remains separately governed at the previously verified 57eaec27 baseline. No source branch or PR was updated remotely.

## Changes
- Tailwind 3.4.19 -> pinned 4.3.3 with @tailwindcss/postcss 4.3.3.
- Migrated theme tokens, class-based dark mode, custom utilities and v3 border compatibility into globals.css; removed the old TypeScript Tailwind configuration and autoprefixer. PostCSS now uses the official v4 integration.
- Explicit @source directives restrict detection to app/components, preserving the previous content scope rather than scanning tests or evidence.
- Official upgrade tool renamed utilities across 72 TSX files: shadows, radii, wrapping, outline visibility, arbitrary properties and related v4 spellings.
- ESLint 8 -> pinned 10.12.0, with eslint-config-next 16.4.0 and flat eslint.config.mjs. Next runtime remains 15.5.27; this is a lint package upgrade, not a Next runtime upgrade.
- npm run lint invokes ESLint directly. All 47 previously enabled rules retain at least their original severity.
- Fourteen newly introduced React Compiler lint rules are deferred in an explicit compatibility profile, because application refactoring was not part of the tooling migration. No baseline rule is disabled. The new Next navigation rule remains enabled and reveals six warnings in addition to the existing three.
- Two style tests were updated to v4 equivalents: scoped custom-utility selector syntax and wrap-break-word. Their scoping/responsive invariants were retained.

## Upgrade-tool review corrections
The automatic template scanner also incorrectly changed business data in two API routes from mode shadow to shadow-sm, and changed Journey shadow report wording. These edits were caught and fully restored before the final build and regression run. Final API routes are byte-identical to the parent commit. This migration does not change ingestion modes, provider semantics or report text.

AST review of all 72 changed TSX files found no changes outside string literals. Changed-string review distinguished styling tokens from business labels; accidental non-style edits were reverted. React checklist review found no changes to hooks, fetches, event handlers, component structure, auth, RBAC, tenant resolution or provider-action governance.

## Verification
- Clean npm ci --ignore-scripts: PASS.
- Final production build: PASS.
- Final lint: 0 errors / 9 warnings. Three prior Hook dependency warnings plus six new navigation warnings. The initial unrestricted React Compiler defaults exposed pre-existing application issues; the compatibility profile preserves the previous lint contract instead of widening this workstream into application refactoring.
- All 47 baseline-enabled rules retain severity; none weakened.
- Focused design-system + Journey risk signals suites: 25 pass / 0 fail / 0 skip.
- Complete configured UI suite, both groups: 1,375 pass / 32 fail / 0 skip; no new failing names versus parent.
- Full TypeScript: 62 diagnostics, no new diagnostic strings versus parent. WS023's separately accepted zero-diagnostic candidate is not included in this isolated dependency branch.
- Browser: local Chromium compared a synthetic representative styling fixture with actual baseline/migrated generated production CSS at 1440px and 390px, in light/dark modes. Card/button/input/text measurements preserve geometry, padding, radii and wrapping. Eight serialized shadow differences contain only extra transparent zero-size layers. Screenshots were visually inspected internally.
- Browser fixture is NOT authenticated customer/admin-page acceptance, Safari/Firefox certification or full application visual coverage. Existing staging, tenancy and governed-action gates remain independent.
- Final diff whitespace: PASS.
- API source has no diff from parent; API suite was not repeated for a CSS/lint-only change.
- Final patch and logs are preserved in the evidence archive. Internal screenshots are not included.

## Audit outcome and limits
UI production audit: ZERO findings.
UI full audit: FIVE HIGH package records, reduced from seven in the prior candidate:
braces -> micromatch -> fast-glob -> @next/eslint-plugin-next -> eslint-config-next.

Tailwind's chokidar/glob paths have been removed. The current Next lint plugin still declares fast-glob 3.3.1 and retains the vulnerable braces chain, even at 16.4.0. No published braces patch was available in the observed registry metadata. The migration does not fully eliminate GHSA-vfj7-8cjw-p6xm; all five records remain unwaived.

The prior API/outer relay/nested relay audit results remain clean; their dependencies were not changed by this tooling commit. Prior critical Vitest/Tinypool remediation is preserved.

ESLint 10 installation succeeds and actual lint/build passes, but several bundled React/import/accessibility plugins do not yet declare ESLint 10 in their peer ranges. npm ls reports an invalid ESLint peer and optional wasm dependency entries as extraneous after clean installation. Next's current documentation explicitly notes these ESLint 10 peer-range gaps. Record them as compatibility limitations, not a clean dependency-tree acceptance. No --force or --legacy-peer-deps bypass was used. ESLint 9 was tested as an intermediate but its registry deprecation notice indicated it is no longer supported; the final candidate uses ESLint 10.

Tailwind v4 requires modern browsers (documented minimums: Safari 16.4, Chrome 111, Firefox 128). Only Chromium was exercised here. Preserve the requirement for customer browser acceptance before release.

## Release and ownership
This is a local review candidate, not merge clearance. The broader Tailwind class migration overlaps files also changed by WS023; reconcile its currency-race fix and other pending runtime changes explicitly before any combined acceptance. Do not overwrite those changes with this candidate.

The 163-row historical candidate ledger remains 130 resolved / 33 unresolved, plus the separately tracked PR570 currency race; raw isolated-tree failures do not reopen accepted workstream corrections absent new defects.

Remaining dependency gate: supported removal/patch of the Next lint glob chain, or an explicit security-owner containment/risk disposition with verified build/test isolation. No waiver or owner approval was invented. Authenticated combined staging, regression-owner dispositions and deployment/rollback readiness remain required.

No push, GitHub PR update, merge to main, deployment, production data or provider mutation occurred.

Primary migration references consulted:
- https://tailwindcss.com/docs/upgrade-guide
- https://nextjs.org/docs/app/api-reference/config/eslint


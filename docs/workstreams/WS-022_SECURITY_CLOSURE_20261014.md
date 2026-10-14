# WS-022 Dependency Security Closure Checkpoint — 2026-10-14

Status: PARTIAL implementation; HOLD for PR544 integration/release. No merge, push or deployment authorized.

## Baseline and isolation
Main: 57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3.
PR544 head: 779b1d6b581606ebf0b48eefe5e531478eb03c70, unchanged remotely.
Isolated branch: ws022/security-closure-20261014.
Local clean reconciliation commit: b87ea1dac9eda59e6b90650ffe1efc383e0319ed.
WS023/PR570, PR569 and WS024/PR571 were not merged into this candidate. Their accepted evidence and outstanding conditions remain separate.

## Fresh audit results
Initial reconciled candidate:
- API: full and production zero.
- Outer relay: full and production zero.
- UI: production zero; full 7 high and 2 moderate package records.
- Nested relay: production zero; full 2 critical and 1 moderate package records.

Therefore all six WS024 findings against main (brace-expansion, miniflare, sharp, undici, wrangler, ws) are absent from the reconciled PR544 API audit. This is scoped remediation evidence, not a waiver for other dependency trees.

New bounded remediation:
- Nested relay moved from Vitest 3.2.7 to pinned 4.1.11 and from @cloudflare/vitest-pool-workers to maintained @cloudflare/vitest-plugin 1.4.2. Removed the old pool-specific Wrangler compatibility override.
- Replaced removed defineWorkersConfig configuration with cloudflareTest plugin in an ESM vitest.config.mjs. Existing Worker test assertions were unchanged.
- Final nested full audit: ZERO findings. Critical Tinypool stack and moderate mocker findings no longer present.
- UI override pins postcss-selector-parser 7.1.6. The two moderate records (parser and parent postcss-nested) disappeared; build/lint and regression comparisons passed.
- CI checkout now sets persist-credentials: false. Cloudflare credentials remain limited to deployment steps. This reduces retained Git credential exposure; it does not prove every build/install environment is credential-free.

Cloudflare's published migration/configuration guidance and installed package exports/peer declarations were consulted. The old pool package was explicitly deprecated in registry metadata, so the final candidate uses the maintained plugin. No unsupported Tinypool major override was forced under Vitest 3.

## Remaining security findings — NOT WAIVED
UI full audit: SEVEN HIGH package records, all dev/build/lint paths, one underlying unpatched advisory GHSA-vfj7-8cjw-p6xm:
braces, chokidar, micromatch, fast-glob, tailwindcss, @next/eslint-plugin-next, eslint-config-next.

braces 3.0.3 is the latest published version observed by npm registry lookup and remains covered by the advisory. The audit recommends broad major migrations/removal through parent packages; do not downgrade Next ESLint to the audit's suggested 14.x solely to silence its propagated record. Tailwind 4 and ESLint/Next tooling migration would need bounded design/build compatibility work, not an unsupported transitive replacement.

All four production audits are clean. API/outer relay/nested relay full audits are clean. No risk acceptance is inferred from development-only placement, trusted repository globs, passing tests or production audit status.

Release options requiring explicit disposition: a supported migration/removal that eliminates every vulnerable glob path; or security-owner acceptance documenting actual reachability, trusted-input restrictions, isolated build/test execution, absence of release credentials and tracking for a future patch. No named acceptance was invented. Vercel build-secret isolation and untrusted deployment controls remain unverified here. persist-credentials: false alone does not close them.

## Executed validation
Node 24.19.0. UI Next.js 15.5.27. Current tests are deliberately kept separate from WS023 candidate acceptance.

| Check | Result |
|---|---|
| Nested relay final full audit | 0 findings |
| Nested relay existing Worker unit + integration tests | 2 pass |
| Nested relay clean npm ci --ignore-scripts, then tests | install PASS; 2 pass |
| API clean npm ci --ignore-scripts | PASS |
| UI dependency installation | PASS |
| UI production build | PASS |
| UI lint | PASS; 3 pre-existing Hook dependency warnings |
| API and continuous Worker deployment dry runs | PASS; no deployment |
| Full UI both configured groups | 1,375 pass / 32 fail / 0 skip |
| Full API | 1,099 pass / 9 fail / 4 skip |
| TypeScript | 62 diagnostics; identical to current-main baseline |
| UI failing-name comparison | no new names versus same-main baseline |
| Diff whitespace | PASS |

UI main baseline from the prior independent run on the identical main SHA: 1,372 pass / 35 fail; the difference is the three existing PR544 assertion repairs. TypeScript comparison used that exact main's baseline-types.log and found no new diagnostic strings.

The four API skips reappear when the full suite has no disposable database credentials. Their historical ledger entries stay closed by independently reviewed WS024 live disposable-schema evidence; no skip is relabeled as an executed pass in this run.

The global candidate ledger remains 130 resolved / 33 unresolved plus the separate PR570 currency race. This isolated dependency candidate has 32 UI failures because it does not include WS023's eight accepted local test corrections; do not replace the combined ledger counts with bare-tree counts. Likewise, 62 bare-tree TypeScript diagnostics do not reopen WS023's verified fixes. No accepted WS019 closure was reopened.

No authenticated live staging, production database, provider mutation, migration replay, or rollback action was attempted. Accepted WS024 migration evidence is preserved but does not substitute for final combined-candidate certification.

## Files and ownership
Changed beyond the clean reconciliation:
- .github/workflows/deploy-tracekit-api.yml: credential persistence disabled.
- api/konnektive-relay/konnektive-relay/package.json and package-lock.json: supported test stack upgrade.
- api/konnektive-relay/konnektive-relay/vitest.config.js replaced by vitest.config.mjs.
- ui/package.json and package-lock.json: parser override.
- this checkpoint report.
No application runtime source, provider contracts, migrations, tenancy, authentication or action-governance semantics changed.

PR544 remote head remains unchanged. New work is committed only on the isolated local WS022 branch. Full logs/audit JSON and comparison summary are in the accompanying evidence archive.

## Next gate
Security disposition for the seven UI build/lint records and verified CI/Vercel containment controls is the remaining dependency gate. Separately retain WS023's currency-race correction, domain-owner regression dispositions, authenticated combined staging and rollback readiness. PR544 remains HOLD; Production V1 remains unauthorized.


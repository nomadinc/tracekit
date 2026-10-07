# WS-022 — Dependency Security Remediation

**Status: BLOCKED / PARTIAL. Bounded Next.js patch complete; dependency remediation and release certification incomplete.**

Observed 2026-10-07. No push, PR, merge, deployment, provider mutation, credential/configuration change, migration change, or application behavior change. WS-019 evidence is unchanged.

## Baseline and isolation

- Fetched `origin/main`: `8436004def0cad5dcf70493a9d91a7cb0b000e17`, matching the requested last verified main.
- Branch: `workstream/ws-022-dependency-security`.
- Worktree: `/workspace/scratch/61a85fe6297b/tracekit-ws022`.
- Recent WS-020/WS-021 manifest changes added test tooling/runners; no overlapping Next.js remediation found. No other workstream branch modified.

## Dependency inventory

Four independent npm packages; no declared npm workspaces or root package. All four lockfiles are version 3 and root dependency declarations agree with their manifests. Manifests declare no Node/npm engines. Actual pinned CI versions and full direct/transitive inventories are in [dependency-inventory.json](evidence/ws022/dependency-inventory.json).

| Package boundary | Direct production dependencies | Development dependencies |
|---|---|---|
| ui | @workos-inc/authkit-nextjs ^4.3.1, date-fns ^4.1.0, exceljs ^4.4.0, fast-csv ^4.3.6, lucide-react ^0.461.0, next 15.5.27, next-themes ^0.2.1, react 18.3.1, react-dom 18.3.1, recharts ^3.6.0 | @electric-sql/pglite 0.3.14, @types/node ^20.12.12, @types/react ^18.2.79, @types/react-dom ^18.2.25, autoprefixer ^10.4.19, esbuild 0.25.10, eslint ^8.57.0, eslint-config-next 15.5.27, postcss ^8.4.38, tailwindcss ^3.4.10, tsx ^4.23.1, typescript ^5.4.5 |
| api | @supabase/supabase-js ^2.81.1, exceljs ^4.4.0, fast-csv ^4.3.6 | @cloudflare/workers-types ^4.20260702.1, tsx ^4.23.15, typescript ^5.4.5, wrangler ^4.63.0 |
| api/konnektive-relay | acorn ^8.14.0, acorn-walk ^8.3.2, blake3-wasm ^2.1.5, color ^4.2.3, color-convert ^2.0.1, color-name ^1.1.4, color-string ^1.9.1, cookie ^1.0.2, detect-libc ^2.1.2, error-stack-parser-es ^1.0.5, esbuild ^0.25.4, exit-hook ^2.2.1, glob-to-regexp ^0.4.1, is-arrayish ^0.3.4, kleur ^4.1.5, mime ^3.0.0, miniflare ^4.20251118.1, path-to-regexp ^6.3.0, pathe ^2.0.3, semver ^7.7.3, sharp ^0.33.5, simple-swizzle ^0.2.4, stoppable ^1.1.0, supports-color ^10.2.2, undici ^7.14.0, unenv ^2.0.0-rc.24, workerd ^1.20251118.0, ws ^8.18.0, youch ^4.1.0-beta.10, youch-core ^0.3.3, zod ^3.22.3 | wrangler ^4.50.0 |
| api/konnektive-relay/konnektive-relay |  | @cloudflare/vitest-pool-workers ^0.8.19, vitest ~3.2.0, wrangler ^4.50.0 |

CI deploys API/continuous workers on Node 20 using `npm ci` against `api/package-lock.json`. UI uses Next.js/Vercel build scripts; remote Vercel Node configuration was not inspected. Local verification used Node 24.19.0/npm 11.9.0. WorkOS AuthKit 4.3.1 already requires Node >=22.11.0. Next.js 15.5.27 retains Node ^18.18.0 / ^19.8.0 / >=20 support. Existing API undici requires Node >=20.18.1.

## Stop / compatibility decision

Further dependency expansion stopped for explicit deployment compatibility review. API `npm audit fix --dry-run` fails ERESOLVE: latest Wrangler 4.148.0 requires workers-types ^5.20261006.1, while main declares ^4.20260702.1. Registry metadata for Wrangler 4.94.0 (the first version outside the audit aggregate <=4.93.0 range) requires Node >=22, whereas deployment CI selects Node 20. This proves the examined upstream remediation paths are incompatible with current CI; it does not prove every alternative bounded override is impossible. No forced resolution or runtime/CI upgrade was attempted.

Additionally, braces GHSA-vfj7-8cjw-p6xm affects <=3.0.3, and registry latest is 3.0.3. Audit proposes major Tailwind 4 to remove the dependency path. This remains a build-chain risk requiring separate major-framework review or an upstream patch. Nested Cloudflare test-pool remediation also proposes a semver-breaking 0.x update. These have not been applied.

## Implemented bounded fix

- `ui/package.json`: Next.js 15.5.23 → 15.5.27; eslint-config-next 15.5.23 → 15.5.27.
- `ui/package-lock.json`: corresponding Next environment, SWC and ESLint packages. No other direct dependency version changes.
- No source, auth, tenancy, permissions, governed-action, notification, commerce, worker-routing or migration edits.

The reproduced audit identifies GHSA-p293-qw3h-jr36 (Windows-hosted RCE) and GHSA-2xp9-vwfh-vxw4 (AVIF image optimization RCE), both fixed starting at 15.5.24 on the 15.x line. Selected 15.5.27 incorporates subsequent maintenance security releases and is the audit-recommended non-major target. The two direct critical advisories disappear after upgrade. Next.js remains an aggregate moderate finding through its pinned vulnerable PostCSS dependency: this patch does not clean the production tree.

Primary sources: [August security release](https://nextjs.org/blog/august-2026-security-release), [September security release](https://nextjs.org/blog/september-2026-security-release), [September upstream hardening](https://nextjs.org/blog/nextjs-security-update-september-22-2026). The September ImageResponse RCE described in the last link applies to Next 16, not this Next 15 baseline.

## Before / after audits

Counts are npm affected-package counts, not unique CVEs. Shared packages are counted within each boundary; do not sum rows as unique repository advisories. All after full-tree audits were freshly run; production-only rows classify omitted dev dependencies separately.

| Boundary / exposure | Before critical / high / moderate / low | After critical / high / moderate / low |
|---|---|---|
| ui, full tree | 1 / 23 / 3 / 0 | 0 / 23 / 4 / 0 |
| ui, production only | 1 / 6 / 0 / 0 | 0 / 6 / 1 / 0 |
| api, full tree | 0 / 5 / 1 / 0 | 0 / 5 / 1 / 0 |
| api, production only | 0 / 2 / 0 / 0 | 0 / 2 / 0 / 0 |
| relay, full tree | 0 / 5 / 0 / 0 | 0 / 5 / 0 / 0 |
| relay, production only | 0 / 4 / 0 / 0 | 0 / 4 / 0 / 0 |
| relay-worker, full tree | 2 / 14 / 1 / 0 | 2 / 14 / 1 / 0 |
| relay-worker, production only | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

Production API and relay counts remain unchanged; their manifests/locks were not edited. Relay worker production-only audit is clean, but its development tree retains two critical findings (vitest/tinypool). Those are test-tool exposure, not demonstrated deployed worker vulnerabilities. Full-tree minus production-only affected counts are not necessarily an additive dev-only count because package severity/path aggregation can change when omitted. See advisory nodes and lockfile dev flags for exact exposure.

## Advisory inventory and residual risk

[advisory-inventory.json](evidence/ws022/advisory-inventory.json) records every reproduced finding/advisory, exact installed versions, vulnerable ranges, identifiers, severity, direct/transitive classification, production/dev classification, patch/disposition, reachability and risk. Propagated package rows explicitly distinguish dependency-path effects from independent advisories. Patch targets other than the applied Next fix and no-patch braces were not fully established before the compatibility stop; those fields are explicitly unresolved, not silently certified.

Remaining production exposure: UI brace-expansion/minimatch (ExcelJS/archive tooling paths), nanoid/PostCSS/source-map-js (Next/build-related production dependency paths), sharp (image processing); API brace-expansion and ws; outer relay sharp/undici/ws/miniflare. Package presence does not prove request reachability. No exploit was attempted. No advisory suppressed. No compensating control has been production-proven here. Build tooling should handle only trusted repository inputs and local test services should not be exposed; these recommendations do not close the release risk.

## Regression and security gates

| Check | Untouched current main | Patched Next.js |
|---|---|---|
| Full UI suite | 1,355 tests; 1,262 pass; 93 fail | Identical counts and failure titles; zero new titles |
| Full API suite | 1,112 tests; 1,099 pass; 9 fail; 4 skipped | Dependencies unchanged; baseline result retained, not claimed green |
| Standalone `tsc --noEmit` | 60 diagnostic locations, predominantly existing test typing/target issues | Same 60 diagnostic locations |
| Configured `npm run lint` | PASS with warnings | PASS; identical output |
| Production Next build | PASS | PASS on retry after transient Google Fonts download failure |
| Clean `npm ci` | PASS (`--ignore-scripts`) | PASS (`--ignore-scripts`); lockfile reproducible with lifecycle-script limitation |
| Named auth/tenancy/M3/M4/Phase B gates | All included in full baseline suite | 104 tests; 103 pass; 1 pre-existing M3 confirmation-path failure |

The named gate set includes ApplicationSession, identity authorization/WorkOS boundary coverage, return URLs, M3 authoritative Shopify execution/replay and atomic confirmation, M4.1 release policy/safe-disable, M4.2 tenant transitions/fixtures, M4.3 history, M4.4 notification presentation/contracts, Phase B fixture/ACL security, platform-admin PGlite transactions, and WS-020 MCP/provider customer boundaries. The only targeted failure is `M3 all confirmation paths use the shared RPC with operation-specific target contracts`, also failing unchanged on main. No live WorkOS login, provider action/replay, or customer production session was exercised. Full suites also include commerce ingestion and Edge Intelligence regressions; their existing failures remain disclosed in [regression-summary.json](evidence/ws022/regression-summary.json).

## Migration chain

BLOCKED. Complete chain not run: no psql, Supabase CLI, Docker or disposable local database available. Existing `scripts/test-m15-authoritative-migration-chain.sh` requires a disposable localhost Supabase instance and explicit test attestation, and discovers the current final migration dynamically. Existing static ledger/migration tests ran as part of the UI suite; they are not a substitute for complete database application. All migrations remain byte-identical to main. No production database accessed.

## Deployment compatibility

- Local production Next build passes with existing App Router/Server Components/API/middleware structure and the same WorkOS Edge warnings as baseline. No request/session/cache contract edits. Runtime production behavior remains unproven.
- Vercel-style `VERCEL=1 npm run build`: PASS (exit 0). This checks existing `.next` output selection locally, not a remote staging deployment or remote environment.
- Cloudflare source, lockfiles, compatibility dates and nodejs_compat flags unchanged. No upgraded Worker bundle or deployment certified. Wrangler remediation compatibility blocker described above.
- No environment-variable files, credentials, database schema, Vercel config or Cloudflare config changed.

## Rollback

Before any integration, abandon the isolated branch to discard the patch. If separately approved and integrated later, revert the WS-022 commit, run clean install/build/regression checks, and follow WS-019 release controls. Reverting restores known vulnerable Next.js 15.5.23, so it is an emergency regression rollback, not an acceptable long-term security disposition. No database rollback needed.

## WS-019 M5 recommendation

**Do not integrate as completed remediation; do not close the Production V1 security blocker.** Direct Next critical patch is isolated and locally validated, but remediable production high findings remain, Cloudflare toolchain remediation requires compatibility review, standalone TypeScript/full suites are not green, and the mandatory migration chain is unverified. `regression_gates` must not be marked production-proven on this evidence. WS-019 retains acceptance/release ownership.

Next action: review Node 22 / workers-types compatibility or a safely bounded alternate Wrangler transitive remediation; review the unpatched braces/major Tailwind path separately; continue production-tree fixes on this same isolated branch after resolving the stop condition; rerun all mandatory gates in a disposable Supabase-capable environment. Push/PR/merge/deploy require separate authorization.

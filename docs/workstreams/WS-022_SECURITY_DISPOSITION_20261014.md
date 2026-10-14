# WS-022 dependency disposition and recovered integration

Decision: PARTIAL technical validation; security/release HOLD. No remote branch, PR, merge, deployment, provider or database mutation.

## Provenance

The later scratch worktrees and Git objects were absent after session restoration. Recovered the saved WS-022_Security_Closure_20261014.zip and WS-022_Tooling_Migration_20261014.zip through Library. Applied their preserved patches to fresh main + PR544, then integrated accepted PR570 at 550c030b, resolving only its Tailwind class overlap as before. Recovery creates new commit identities; do not represent the old code commit as freshly tested.

Fresh remote refs: main 57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3; PR544 779b1d6b581606ebf0b48eefe5e531478eb03c70; PR570 550c030b734443a67c4333d707ae01f717cd1964; PR569 9fe121aad6f8e0842675907f7f651be0b9ddb785. PR569 remains excluded and unmerged.

Tested code commit: 3283b01fcc3b5624d0b8647cd5c220b0df43c8c0.
Branch: ws022/recovered-tooling-integration-20261014.

## Fresh validation

- Clean npm ci --ignore-scripts: PASS. Lifecycle scripts were not run by install; production build ran separately.
- TypeScript: zero diagnostics.
- Production build: PASS.
- Lint: zero errors / nine warnings.
- Focused race/currency/identity/bearer/scoped gateway: 25 passed / zero failed or skipped.
- Complete configured UI suite: 1,399 passed / 24 failed / zero skipped (1,354/22 and 45/2 across both groups). Same totals as previous combined review. No API suite, browser or database replay claimed in this run.
- Full UI audit: five high package records, zero other severities. UI production audit: zero findings. API, outer relay and nested relay full audits: zero findings.
- npm ls eslint reports invalid ESLint 10 peer ranges for bundled plugins. Successful install/lint/build does not resolve this compatibility limitation.

## Residual vulnerability disposition

Five affected package records represent one advisory, GHSA-vfj7-8cjw-p6xm: braces 3.0.3 -> micromatch -> fast-glob -> @next/eslint-plugin-next -> eslint-config-next. Fresh registry metadata still lists braces 3.0.3 and eslint-config-next 16.4.0; latest Next plugin retains fast-glob 3.3.1. No newer supported published upgrade closes this path. No audit suppression, forced downgrade, custom parser patch or dependency removal applied.

Installed primary package source locates Next's fast-glob use in dist/utils/get-root-dirs.js. Its globSync call requires settings.next.rootDir to be a string or array; otherwise it returns context.cwd directly. This repository's current lint config supplies no rootDir setting. A runtime probe wrapping fast-glob calls allowed the full lint run with one module import and zero calls. A positive control invoked globSync and was correctly blocked (one import, one call).

This is bounded observed non-invocation for the current lint command and config. It does not certify all package APIs, arbitrary future configs, other environments or build-host isolation. It does not remove the vulnerable package or authorize risk acceptance. The instrumentation is a local verification harness; no application or dependency source was modified by it.

GitHub workflow source retains contents:read and persist-credentials:false, with Cloudflare credentials scoped to deploy steps. Actual Vercel environment exposure/isolation was not verified. No secret values inspected.

Disposition: OPEN / release blocker. A reviewed upstream fix or supported replacement remains preferred. Any alternative risk acceptance must explicitly bind exact package/commit, trusted config inputs, host isolation/resource limits, expiry and owner; this report grants none. ESLint peer-range compatibility also remains open.

## Release ledger and next gate

Historical ledger remains 130 resolved / 33 unresolved (24 UI + nine API). Supplemental PR570 race finding remains resolved. Local passes do not alter independent owner acceptance or authorize release. Continue owner reconciliation and PR569 financial-contract acceptance while upstream dependency remediation remains tracked. Production V1 HOLD.

The evidence archive includes a complete binary-capable patch relative to main so the local candidate can be recovered if scratch worktrees disappear again. It includes no credentials, browser screenshots, node_modules or environment files.

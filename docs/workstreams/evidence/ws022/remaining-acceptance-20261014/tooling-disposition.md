# WS-022 supported tooling remediation investigation

Candidate: 88f7411457b988e83e51fbc9bf7b4b5b76002fe7. Registry/audit refreshed 2026-10-14; machine-readable responses are in tooling/.

## Advisory

Full UI audit: five high package records; one underlying advisory GHSA-vfj7-8cjw-p6xm, stack-exhaustion denial of service through deeply nested braces patterns, affected braces <=3.0.3. Exact installed dependency path: eslint-config-next16.4.1 → @next/eslint-plugin-next16.4.1 → fast-glob3.3.1 → micromatch4.0.8 → braces3.0.3. Records are eslint-config-next, @next/eslint-plugin-next, fast-glob, micromatch, braces. UI production audit: zero advisories.

Registry latest braces is still3.0.3. Latest stable Next lint config/plugin is16.4.1; plugin still depends on fast-glob3.3.1. No supported patch upgrade removes the path. npm audit's proposed downgrade to eslint-config-next14.2.35 is a major framework/lint-contract change, not a safe patch for the reviewed flat-config migration. No automatic/force downgrade, override, suppression or waived audit finding was applied.

Exposure: development/build/lint process handling glob patterns; not a production browser or request-time dependency in the production audit. Repository/configuration-controlled paths lower ordinary runtime exposure, but hostile repository/config input or dependency behavior could deny service to CI/lint/build. A production audit result of zero does not waive CI/supply-chain exposure or prove containment. Existing source probes in recovered evidence are inherited and not fresh containment certification.

## ESLint peer contract

ESLint10.12.0 is retained. Current latest stable eslint-plugin-import2.32.0 declares maximum ESLint9; jsx-a11y6.10.2 declares maximum9; react7.37.5 declares maximum9.7. npm ls eslint reports ELSPROBLEMS. Lint/build success is observed but does not establish supported peer compatibility.

The peer-compatible ESLint9.39.5 registry metadata explicitly says the version is unsupported/deprecated; it is not retained as remediation. Latest stable eslint-config-next16.4.1 is already installed. No force, legacy-peer-deps, peer declaration override, rule removal or finding suppression was used in this follow-up.

## Explicit owner decision required

Security owner and UI tooling maintainer must choose and record one of:

1. Wait for supported patched braces/Next lint dependencies and ESLint10-compatible plugin releases, then install normally and re-run clean dependency resolution, lint, audits, build and regression checks.
2. Authorize and review migration to a maintained supported lint stack that removes the glob chain while preserving the existing rule/security/accessibility contract. This requires comparative rule coverage and whole-application validation; replacing or deleting rules solely to silence audit/peer output is not accepted.
3. Approve a time-bounded residual-risk exception with explicit advisory/path, affected CI/build inputs, verified containment, owner, expiry and tracking issue. This agent has no authority to grant that exception, and none is recorded.

Until a supported remedy or explicit owner decision exists, both ledger items remain OPEN/UNWAIVED. Production V1 HOLD.

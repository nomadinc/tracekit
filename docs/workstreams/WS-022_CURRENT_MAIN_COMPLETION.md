# WS-022 — New current-main completion report

Executed 2026-10-08 UTC. Status: REVIEW / P0; local reconciliation complete,
release-risk decisions and staging certification remain OPEN.

## Authoritative trees

- Freshly fetched main: `c2051ae1ff4d856a5bd79b3b9296c592655f1018`.
- Candidate tested: `bf47f689ff25065b0736b4144f37b5bee8a0695c`.
- Branch: `workstream/ws-022-dependency-security`.
- Worktree: `/workspace/scratch/61a85fe6297b/tracekit-ws022`.
- Untouched baseline: `/workspace/scratch/61a85fe6297b/ws022-baseline-c2051ae1`.

Current main is an ancestor of the candidate. Fetch found no further main
changes. Since historical remediation baseline, main added only WS-019
acceptance documentation, production evidence and two policy-negative tests.
No semantic collisions. WS-019 evidence/tests and migrations are unchanged
by the candidate. Older SHAs are provenance, not this regression baseline.

## Commands actually executed in this rerun

Node 22.23.3 / npm 10.9.4; complete command outputs and comparison are in
[evidence/ws022/current-main-rerun](evidence/ws022/current-main-rerun/).

- `git fetch origin main`; `git rev-parse origin/main HEAD`;
  `git merge-base --is-ancestor origin/main HEAD`.
- `npm ci --no-audit --no-fund` with lifecycle scripts enabled in all four
  candidate packages, and untouched baseline UI/API: all six PASS.
- `npm audit --omit=dev --json` and `npm audit --json` in all four candidate
  boundaries. Production: all exit 0. Full UI/nested audits exit 1 as expected.
- `npm test` in baseline/candidate UI; `npm test -- --test-concurrency=4`
  in baseline/candidate API.
- `npx tsc --noEmit` in baseline/candidate UI.
- `npm test -- m3-atomic-confirmation-integrity.test.ts mcp-action-eligibility-inspection.test.ts m5-policy-negative-production-acceptance.test.ts`
  in candidate UI: 11/11 PASS.
- Baseline isolated recheck:
  `node --import tsx --test --test-name-pattern='identity diagnostics timeout a never-resolving' src/identity-service.test.ts`: PASS.
- Read installed `ui/node_modules/next/package.json`: exactly **15.5.27**.
- `git diff --quiet` checks for WS-019 files, migration/config/chain inputs;
  all unchanged. Application source implicated by the three assertions is unchanged.

## Results and dispositions

| Gate | Untouched current main | Candidate |
|---|---|---|
| UI | 1359 total; 1266 pass; 93 fail | 1359 total; 1269 pass; 90 fail |
| API | 1112 total; 1098 pass; 10 fail; 4 skip | 1112 total; 1099 pass; 9 fail; 4 skip |
| TypeScript | 60 test-only diagnostics; exit 2 | Exact same 60 diagnostics; exit 2 |
| Production audits | Not substituted for candidate audits | All four zero critical/high/moderate/low |
| Focused M3/eligibility/M5 | Three known baseline assertion failures | 11/11 PASS |

No new candidate failure title. The baseline API run has the historical nine
failures plus `identity diagnostics timeout a never-resolving repository await
as transient`: expected lookup stage, observed normalization stage. Isolated
baseline recheck PASS. A short deadline can expire at an earlier stage under
concurrent load; classify as pre-existing timing/setup variability, not an
upgrade fix. Core owns deterministic timeout-stage testing. Preserve both
results; do not report the new full baseline as nine failures.

M3 root cause is a literal contract assertion expecting no spaces while the
source uses `expectedOperation: "inspect_evidence"` and formatted target fields.
The candidate normalizes whitespace, retaining the five operation/target
contracts and negative confirmation/execution boundaries. Test/source-layout
issue, not a functional defect or dependency regression.

The two eligibility failures expect disabled registry capability metadata and
ban every serialized `executionAvailable:true`, including nested metadata for
an available non-mutating capability. The candidate checks registry availability
separately from actual eligibility and still asserts blocked state, no permission,
no satisfied prerequisites, no valid human confirmation, no executable eligibility
and null confirmation audit identities. Current source is unchanged. Pre-existing
contract assertions, not evidence of unauthorized execution or dependency regression.

The remaining 90 UI/9 API failure ledger is
[final-readiness/failure-dispositions.json](evidence/ws022/final-readiness/failure-dispositions.json).
Historical migration/component paths and fixture-wrapper loading are known test
issues. Other source/behavior assertions remain unresolved owner review, not waived.
Queue 800-versus-1000 is an unresolved resource contract. Four API skips require
disposable TKID persistence setup. All 60 type errors remain test target/fixture
issues. Genuine underlying defects have not been ruled out for every remaining
failure; WS-019 must approve coverage dispositions with the responsible owners.

## Development-only advisory recommendations

Fresh full audits retain UI 7 high / 2 moderate and nested relay 2 critical /
1 moderate. API and outer relay full audits are zero. Full audit JSON and
previously captured actual npm path trees remain available.

| Advisory / dependency path | Exposure and exact recommendation |
|---|---|
| GHSA-vfj7-8cjw-p6xm; braces 3.0.3 via Tailwind→chokidar/fast-glob/micromatch and Next ESLint→fast-glob→micromatch | Build/lint glob stack DoS; no published patch reported. Fixed trusted repository globs reduce observed reachability. Require CI owner verification of isolated untrusted builds without release credentials, and track patch/removal. Tailwind major alone does not remove ESLint path. No blanket acceptance. |
| GHSA-rj75-hqrm-r3gf; selector-parser 6.1.4 via Tailwind/postcss-nested | Crafted-selector quadratic CSS build processing; patched 7.1.6 is a library major. Authorize separate parser/Tailwind compatibility review, or bounded trusted-CSS acceptance after input/control verification. No request-time parsing path established. |
| GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr; Vitest→Tinypool 1.1.1 | Prototype-pollution gadgets can yield host RCE when an upstream pollution primitive exists. Require removal or >=2.1.2. Do not force unsupported Tinypool major under Vitest 3. Restrict to trusted tests in isolated credential-free jobs pending separately authorized migration. |
| GHSA-82fw-gwwq-j7x9; Vitest/@vitest/mocker 3.2.7 | Reachable mocker dev-server redirects can read files; patch 4.1.11. No public mocker/browser server configured in tested suite. Keep servers private; address with Vitest migration. |

Separately review previously identified Vitest 4.1.11 with Cloudflare pool
0.23.0 or its supported plugin replacement. Verify peers, configuration,
bindings/storage isolation, smoke tests and entire fresh audit tree; prove
Tinypool absent or >=2.1.2. This is a proposal, not an installed/tested upgrade.
No major upgrades or dependency changes were performed in this rerun.
Controls are proposed requirements, not independently certified organization-wide
facts. Named security/release owner acceptance remains outstanding.

## Migration applicability and staging certification

Existing migration validation remains user-reported PASS on disposable
Supabase PostgreSQL 17.6 with Storage through `20261007175026`. Original local
logs are external and not independently inspected here. Historical baseline,
current main and candidate have identical migration/config/chain-script inputs;
no dependency change in this rerun requires repeating that chain. No production
DB access occurred. Import original evidence if independent provenance review
is required; do not claim fresh chain execution.

Staging plan is prepared in the final reconciliation section of
[WS-022_DEPENDENCY_SECURITY_REMEDIATION.md](WS-022_DEPENDENCY_SECURITY_REMEDIATION.md).
After separate deployment authorization, record the candidate SHA and isolated
staging deployment/bindings; validate startup/App Router, WorkOS/ApplicationSession,
signed-out/expired denial, cross-tenant and insufficient-role reads, cache/session
separation, MCP tools/list and read-only capability/eligibility discovery,
notification reads and Worker compatibility. Never prepare/confirm/execute/replay,
call a provider or mutate business data. Stop on tenant/auth leak or action
activation. Existing staging configuration and credentials are not certified here.

Prior current-main local production/Vercel-mode builds, lint, Worker dry runs
and relay smoke tests PASS; these were not rerun in this audit/regression pass
and do not replace candidate authenticated staging certification.

## Integration decision and next action

Review PR: technically ready, but push/opening require separate authorization.
Merge: HOLD for explicit remaining gate/advisory dispositions and deployment
coordination. Deploy: HOLD for authorized isolated candidate staging acceptance
and confirmed deployment-owner rollback access/artifacts. Main merge triggers
actual Worker deployments, so merge authorization must account for this.
Rollback restores reviewed manifests/locks/runtime workflow via implementation
revert or integration squash; no DB rollback; older dependencies restore known
vulnerabilities and are emergency recovery only.

Exact next action: WS-019 and named owners review the unresolved baseline ledger,
additional timing variability and bounded development-risk proposals; then obtain
separate authorization to push/open a review PR and deploy/test the isolated
staging candidate. WS-022 is not declared complete or Production V1 ready.

Files changed this continuation: two WS-022 reports and rerun evidence only.
No push, PR, merge, deployment or production mutation.

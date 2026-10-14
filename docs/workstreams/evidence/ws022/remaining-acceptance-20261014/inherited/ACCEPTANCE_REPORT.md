# WS-022 consolidated acceptance report — 2026-10-14

Status: REVIEW / HOLD. Recovery, independent code review, correction, publication and exact-candidate preview deployment completed. Authenticated tenant acceptance remains blocked on existing member identities. Production V1 remains HOLD.

Draft PR: https://github.com/nomadinc/tracekit/pull/575
Published and deployed SHA: `88f7411457b988e83e51fbc9bf7b4b5b76002fe7`
Branch: `ws022/acceptance-hardening`
Preview: https://tracekit-staging-38p6rybzt-tracekit.vercel.app
Deployment: `dpl_7kVc4eqTa3QseM9rMyRjGXkFhZ3U`, READY, Preview environment (not Production).
Team: Tracekit / `team_QFcd7GbqA7MfBH9bPM0kAqG9`
Project: tracekit-staging / `prj_KPHnqsNayx17VXmMIp7Rasrsp7gc`, root ui, Node 24.x.
Deployment API githubCommitSha matches the published SHA. Vercel inspect independently identifies target Preview. Automatic Git previews from branch publication also occurred; only the exact deployment above was used for browser acceptance.

## Recovery and review

Archive SHA256: `a279cb46e168a8f2b4a48bc48fded4fc93427fc7e26c8074f2508f988c5155a3`. All 11 inner manifest entries match. Git verified bundle prerequisites `c2051ae1ff4d856a5bd79b3b9296c592655f1018` and `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3` after a full remote clone, before importing. Recovered head `2db2ca87a6cfdb50c9768a5ed4860f520b38bcb2`; recorded latest code `fee88aa23e9a1762c5f866e6ab96ed01eff2f59e`. Refreshed main equals recorded baseline `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3`; no reconciliation delta. Original worktree and all workstreams preserved. PRs #544, #569, #570 and #571 and their branches were not modified or merged.

A separate reviewer, not the implementation author, reviewed changed expectations, Meta authorization/routes, Edge service authentication and tenant binding, nullable currency and detail races. One verified medium defect: qualified currencies live inside the detail response's dispute object, but the UI consumed top-level fields. Fixed at `122dc065e0fe5c594ea32e1b0696e320209f1d52`; added actual route-to-render regression for independent EUR/GBP provenance, authoritative nulls and stale selection. Reviewer independently passed 26 focused checks and closed R1. Final `88f74114` adds only .vercelignore; reviewer independently confirmed application/API/migration/test trees unchanged and reviewed that final delta. No remaining verified code defect in reviewed scope. This is independent code review, not independent authenticated staging certification. See checks/independent-review.md.

## Current verification

On exact final commit `88f74114`: UI 1,462 pass / zero fail or skip (1,415 + 47); API 1,111 pass / zero fail / four database-dependent skips; relay worker two pass; TypeScript zero diagnostics; lint zero errors / nine warnings; whitespace clean. Remote production-mode Next build passed on exact final commit, and deployment READY. Local production-mode build passed on `122dc065` with identical application/lock/test trees. First local build failed because sandbox DNS blocked Google Fonts; authorized network retry passed. Node local 22.22.1, npm 10.9.4. Exact-final logs distinguish those runs from inherited recovery logs.

Four API skips remain: actual-schema journey_started persistence pipeline, evidence-only interrupted event resumption, Stage-1 shared persistence mapping, and missing matching evidence fail-closed integration. No fresh disposable-schema database test was run; no skip is closed.

Full/production audits refreshed at all recovered package locations: UI has five high full-audit package records, zero production records. API, relay, relay worker have zero full and production advisories. continuous-runtime has no independent package.json/lock and uses the API dependency tree; its audit is the API audit, not a distinct package remediation.

Unwaived UI advisory: GHSA-vfj7-8cjw-p6xm, braces stack-exhaustion denial of service on deeply nested glob patterns, affected <=3.0.3. Path: eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. The five records represent that one advisory chain. Registry latest braces remains 3.0.3. Updated lint config 16.4.0→16.4.1; risk remains. Audit suggests config14.2.35 as a major downgrade; that is incompatible with the reviewed flat-config migration and is not an accepted supported remediation. No advisory suppression or risk waiver.

ESLint peers: supported ESLint10.12.0 conflicts with current eslint-plugin-import2.32.0, jsx-a11y6.10.2, react7.37.5 declarations (ESLint9 maximum). Investigated9.39.5; registry explicitly marks it unsupported/deprecated, so it was not retained. npm ls eslint exits ELSPROBLEMS. Current lint/build success does not establish supported peer compatibility. Security/tooling owner must choose a supported replacement/updated chain or explicitly approve a bounded temporary risk disposition, including CI build/lint inputs and containment; no such decision exists in this report.

## Staging evidence and limitations

- Exact preview signed-out page HTTP200. Unauthenticated financial tenant-hint and Meta status requests redirect to WorkOS; Meta selection POST without a session redirects without route persistence. Edge missing-token POST returns401 unauthorized with no-store. These are unauthenticated boundaries, not cross-tenant authenticated proof. See staging-negative.json.
- Initial WorkOS callback was unregistered. User added the exact preview callback. Retried same deployment successfully through existing Google identity anthony@trace-kit.com. Application reports “Your identity is verified, but no active TraceKit account membership is assigned.” Reload preserves this state. No membership, invitation or credential changes made by the agent.
- Logout cleared the preview session: returning to preview required WorkOS login. Re-login with the same identity succeeded and again reached the no-membership screen. Logout landed on `https://app.trace-kit.io/auth/signed-out`; therefore end-to-end staging return-destination acceptance remains unresolved. Application signedOutReturnUrl is designed to preserve trusted preview origin; WorkOS return-destination configuration still needs inspection by the staging identity owner. No configuration change or production release was performed.
- Browser direct /api tenant navigation was blocked by the browser client; it is NOT counted as a passed authenticated tenant-denial test.
- Organization/workspace selection, Admin/client separation, direct cross-tenant denial, governed actions, authenticated chargeback UI/races, and authenticated inactive Meta UI remain BLOCKED on existing staging Admin/client identities with effective memberships. Synthetic route/render tests passed; they are not represented as these staged flows.
- No live provider/financial actions, Meta OAuth activation, invitations, or membership changes performed. Meta remains inactive and uncertified; affiliate/source monetary reporting remains held for WS-001.

## Remaining blockers and owners

| Gate | Owner | Required outcome |
|---|---|---|
| Existing staging Admin/client access | Staging identity/access custodian | Identify already-provisioned test identities with effective memberships and intended org/workspace; no new membership authorized |
| Logout staging destination | Staging WorkOS/identity configuration owner | Inspect registered post-logout return behavior and verify same-preview return; current logout lands on production signed-out page |
| Authenticated acceptance matrix | WS-022 execution owner plus staging custodian | Run all blocked tenant/UI/governed-action flows on the exact preview after access supplied |
| braces and ESLint peers | Security and UI tooling owners | Supported patch/replacement or explicit bounded residual-risk decision; currently unwaived |
| Actual-schema skips/final database proof | WS-024/database validation owner | Run required disposable-schema tests on this candidate before closing skips; inherited evidence retained |
| Affiliate/source financial reporting | WS-001 financial owner | Separate financial certification; reporting remains held |
| Meta activation | Meta integration owner | Separate provider certification and authorization; inactive |
| Production V1 | Release owner | All gates plus separate explicit production authorization; HOLD |

Post-commit evidence is intentionally packaged separately and summarized in the draft PR so the published/deployed candidate and user-registered callback remain fixed. It is not an unpushed runtime change. See acceptance-manifest.json, release-ledger.md, rollback-plan.md, checks/, inherited-ws024/, and SHA256SUMS.json.

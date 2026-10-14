# WS-022 remaining acceptance — consolidated report

Status: REVIEW / HOLD. PR575 remains draft. No runtime source change or new deployment was required in this pass; the staging logout defect was corrected in WorkOS Staging configuration. Live member acceptance remains blocked on existing authorized identities; dependency risk remains unwaived. Production V1 HOLD.

Candidate/final runtime commit: **88f7411457b988e83e51fbc9bf7b4b5b76002fe7**.
Draft PR: https://github.com/nomadinc/tracekit/pull/575
Exact preview: https://tracekit-staging-38p6rybzt-tracekit.vercel.app
Deployment: dpl_7kVc4eqTa3QseM9rMyRjGXkFhZ3U, READY, Preview, project tracekit-staging / prj_KPHnqsNayx17VXmMIp7Rasrsp7gc, team Tracekit / team_QFcd7GbqA7MfBH9bPM0kAqG9. Refreshed deployment metadata confirms exact commit. Main remains57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3. Original tracekit-main modifications, workstreams and source PRs544/569/570/571 are preserved.

## Fresh checks on the exact candidate

| Check | Pass | Fail | Skip / other |
|---|---:|---:|---|
| Full UI | 1462 | 0 | 0 skips |
| Full API with disposable database configured | 1115 | 0 | 0 skips |
| Focused four actual-schema cases | 4 | 0 | 0 skips; included in full API count |
| Relay worker | 2 | 0 | 0 skips |
| Independent focused authentication/tenant/Meta/Edge/currency review | 51 | 0 | 0 skips; overlaps full UI |
| TypeScript | — | 0 | zero diagnostics |
| Production-mode build | PASS | 0 | Node22.22.1 local; existing remote preview READY |
| Lint | — | 0 | nine existing warnings |
| Whitespace/source status | clean | 0 | runtime checkout unchanged |

Default API invocation without integration environment also produced1111 pass/0fail/4skip, preserved as api-default.log. Those default configuration skips are NOT presented as failed tests or silently removed: the four exact cases were subsequently executed successfully against the authoritative fresh schema and the entire configured suite passed1115/0/0. Setup failures (sandbox/connection initialization, missing authentic Storage prerequisite, direct PostgREST URL-prefix mismatch) are distinguished from final results. Raw early attempts1–4 were overwritten; their diagnostics survive only in the executor report/transcript. Later raw attempts are preserved. This provenance limitation is explicit. No assertion weakening or application edit was used to close them.

## Fresh database evidence

The executor created an isolated disposable local database and initialized authentic platform prerequisites, including the official Storage API. Ran unchanged scripts/test-m15-authoritative-migration-chain.sh with its disposable/local safeguards and historical M15 fixture. It converged through20261014034517_ws001_dispute_source_currency_contract and passed final ledger/RPC/RLS/ACL verification. A local HTTP adapter only strips Supabase's /rest/v1 prefix before forwarding to real owned PostgREST, preserving methods, bodies, headers and responses; no persistence responses were mocked. Ephemeral credentials are excluded from this package.

Fresh tested commit is88f7411457b988e83e51fbc9bf7b4b5b76002fe7. Exact commands, case identifiers, setup failures, results, resource identities and cleanup are in database/. This closes the four outstanding actual-schema execution skips for this candidate; it does not expand to all production/database/provider certification. Inherited WS-024 evidence remains separately under inherited/ws024 with original tested commits; its provenance is not relabeled as fresh execution.

## Authenticated staging and logout

WorkOS Staging sign-out destinations lacked the exact WS-022 preview root and defaulted to the production signed-out page. Added ONLY https://tracekit-staging-38p6rybzt-tracekit.vercel.app/ in the verified Staging environment; existing entries/default and production configuration remained unchanged. Saved and reopened the allowlist to verify. Logout of the existing no-membership preview session now reaches staging AuthKit Sign in with the exact preview callback; a no-session HTTP check returns307 to the same preview root. No app edit was required.

Preferred email sign-in reached the existing-password challenge. The user was asked to complete sign-in in-browser with an already-authorized Admin member identity and supply the existing client identity/expected tenants. No member identifiers or completed member session were supplied. The prior no-membership identity's login/persistence/re-login evidence is retained as inherited and is not application acceptance. This pass verifies the corrected logout destination and email challenge; completed email member login/persistence/logout/re-login remains blocked.

| Role / tenant | Result |
|---|---|
| Existing no-membership identity / no authorized tenant | Corrected logout observed; email sign-in requires existing password; prior no-access denial retained |
| Admin / allowed organization and workspace | BLOCKED: existing member identity/session and expected scope needed |
| Client / allowed organization and workspace | BLOCKED: existing member identity/session and expected scope needed |
| Admin/client separation and direct foreign-tenant denial | BLOCKED: both role sessions and allowed/denied tenant targets needed |
| Governed actions, chargeback UI and inactive Meta permission separation | Synthetic independent boundaries pass; live member acceptance BLOCKED |

No invitation, membership, role, credential or production configuration changed. No live financial/provider write or Meta activation performed. See staging-observations.md for the exact boundary between fresh and inherited observations.

## Tooling risk and explicit owner decision

Fresh UI full audit still has five high records representing one braces advisory, GHSA-vfj7-8cjw-p6xm. Path: eslint-config-next16.4.1 → @next/eslint-plugin-next16.4.1 → fast-glob3.3.1 → micromatch4.0.8 → braces3.0.3. UI production audit has zero findings. Latest stable braces remains3.0.3; current stable Next lint config/plugin retains the vulnerable chain. ESLint10.12.0 peers remain incompatible with current latest stable import/jsx-a11y/react plugin declarations. Peer-compatible ESLint9.39.5 is explicitly unsupported/deprecated in registry metadata.

No supported patch remediation is available from the inspected stable chain. No force, legacy-peer-deps, unsupported override, rule deletion, finding suppression or self-waiver was used. Security and UI tooling owners must choose supported upstream remediation, authorize a maintained replacement lint-stack migration preserving rule coverage, or issue an explicit time-bounded residual-risk exception with verified containment. See tooling-disposition.md and tooling/ responses. Both items remain OPEN/UNWAIVED.

## Independent review and durable publication

Separate reviewer examined auth return trust, tenant permissions, Meta route/service boundaries, Edge authentication/binding/redaction and actual API-to-render currency behavior. Fresh independent execution:51pass/0fail/0skip. No verified blocking code defect. Narrow staging configuration remedy is consistent with reviewed source/installed SDK; dashboard/browser observations remain attributed to executor and are not independent live acceptance.

Visible COMMENT review: https://github.com/nomadinc/tracekit/pull/575#pullrequestreview-5524567480. The report is independently authored and posted through the connected execution account; it is not a GitHub approval or staged certification.

Post-commit evidence is published on evidence/ws022-acceptance-followup-20261014 in nomadinc/tracekit and linked from PR575. It is an evidence-only branch based on candidate88f74114, preserving the tested PR head and registered preview. The package includes manifest, exact failure ledger, rollback plan, independent report, fresh logs/registry evidence, separate inherited provenance and SHA256 integrity manifest. Immutable evidence-commit/package links are recorded in the PR and final response after publication.

Remaining owners: staging identity custodian for existing Admin/client credentials/session and expected scopes; WS-022 executor for live role matrix once access exists; security/UI tooling owners for unwaived dependency decisions; WS-001 for affiliate/source financial certification; Meta owner for activation certification; release owner for separately authorized Production V1 release. Affiliate/source reporting remains held. Meta remains inactive/uncertified. Production V1 HOLD.

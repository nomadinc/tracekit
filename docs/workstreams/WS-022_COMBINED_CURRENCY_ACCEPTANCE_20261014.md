# WS-022 combined regression and PR569 currency acceptance

Status: PASS for bounded local integration; REVIEW / Production V1 HOLD for release.
Code commit: 2332a66f96a50b41d79b21a2b2ac5840a13f519f.
Local merge: d52e1434c58bb4623aad971ddb224176d027403a, combining repaired candidate cdec2a5f and PR569 9fe121aad6f8e0842675907f7f651be0b9ddb785.
Branch: ws022/currency-final-integration.
Fresh fetched main: 57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3.

No main merge, remote push, deployment, migration execution, provider call, credential change or live OAuth performed. Separate source branches/PRs remain untouched.

## Fresh combined checks

| Check | Result |
|---|---|
| Complete UI including both groups | 1,457 passed / zero failed / zero skipped (1,410 + 47) |
| Complete API | 1,111 passed / zero failed / four local schema-dependent skips |
| Focused currency contract + API-qualified formatter path | Five passed / zero failed / zero skipped; included in UI count |
| TypeScript on final commit | Zero diagnostics |
| Production build | PASS on d52e1434; final commit changes only two test files |
| Lint | Zero errors / nine warnings on identical runtime tree |
| Merge and whitespace | Clean merge; diff check passed |

Installed dependency trees are reused from the reviewed clean installations; no dependency/lock changes in this integration. Four API skips do not count as freshly executed database tests. Previous WS024 disposable database evidence remains inherited, not replayed here.

## Currency review

The additive nullable migration changes no existing values and introduces no currency default. Existing live currency values without approved source provenance remain unverified. Webhook normalization no longer supplies default USD when currency is absent, preserves zero fees, and carries independent principal/fee source fields into provider projection. Import paths preserve missing workbook currency as unknown.

List/detail qualification applies separate principal and fee provenance allowlists. Crossed principal/fee provenance is rejected, including workbook sources. New tests prove this rejection and the API-qualified UI formatting path: EUR principal with GBP fee, zero GBP fee, unknown legacy principal despite a valid GBP fee, and unknown fee despite valid EUR principal. Existing stale-detail coordinator and null-authority fixes remain intact.

All automated failures repaired in the preceding candidate remain green after adding PR569. No restoration of the uncertified affiliate/source monetary panel, aggregate financial certification, wallet-loss inference or provider identity heuristic was introduced. Authentication, organization scoping and redaction code are preserved by this diff; complete configured negative suites pass locally. This is not an authenticated deployed-environment certification.

## Evidence provenance

acceptance-manifest.json records full tested SHAs for original 222-migration chain (57eaec27), strengthened Commas SQL (18198adc), PR569 223-migration chain (f750a5f5), corrected API regression (9fe121aa), original UI currency regression (f750a5f5), and this combined candidate (2332a66f). Earlier chain/API/UI records are explicitly distinguished from fresh combined runs. Storage HTTP acceptance is inherited from previously reviewed WS024 evidence and was not repeated.

## Decision and remaining gates

The PR570 currency UI is technically compatible with PR569 in this combined local candidate. The separate unmerged API dependency is now represented and verified in the candidate; neither PR is merged or release-approved.

Independent review of the combined change remains required, particularly the new inactive Meta setup routes from the preceding remediation. Real Meta certification is required before activation. WS001 financial aggregation certification, five high dev-tooling package records from the braces advisory, ESLint peer compatibility, combined authenticated staging/rollback readiness and explicit release authorization remain open. No risk waiver or production acceptance granted.

A recoverable Git bundle and complete logs are included in the evidence archive. Production V1 HOLD.

# WS-022 candidate review and staging checkpoint

Status: REVIEW / HOLD. Self-review and synthetic route verification completed; independent acceptance and authenticated staging are pending. This report does not claim independent review of agent-authored changes.

Reviewed parent: 2332a66f96a50b41d79b21a2b2ac5840a13f519f, documentation head 385feedb. Follow-up code: fee88aa2 (full SHA in provenance). Branch: ws022/acceptance-hardening. No push, main merge, deployment, live database/provider request, credential retrieval, invitation or OAuth action.

## Review and concrete fix

Reviewed the changed Edge tenant-delivery assertions against canonical migration 20261004204342. The source explicitly separates global Edge service authentication from tenant binding ownership; treating the credential as tenant-owned would misrepresent the current contract. Added actual-handler tests with a synthetic persistence origin and bundled Next JSON adapter. Tests verify missing/inactive credential rejection before tenant access; active binding lookup; unbound rejection before ingestion; nested raw-IP rejection; and ingestion organization taken from the authoritative binding rather than caller organization.

The persistence parse-error test reproduced a real logging defect: malformed persistence JSON propagated its raw response fragment through error.message to console.error. A short synthetic marker (X_SECRET) demonstrates the leak; no real sensitive values were used. Replaced arbitrary exception-message logging with fixed code delivery_unavailable while retaining the diagnostic event and generic 503/no-store response. Before: three pass / one fail. After: all four request-boundary tests pass; all 11 focused Edge tests pass.

The tests use the real validator and route body; persistence and Next serialization are synthetic. They do not certify deployed database grants/RLS, a real Edge service token, concurrency or the staging environment. Existing credential/tenant ownership model was not changed.

Meta review: server page and GET/POST independently require authenticated organization plus connectors.manage; POST enforces same origin and bounded internal IDs. Existing service checks connection membership in the authenticated organization and repository checks selected account ownership. Status explicitly drops arbitrary metadata. Selection does not create schedules or enable sync. These reviewed boundaries remain subject to independent acceptance and real-provider certification before activation.

Changed tests retain source identity preference, bounded queue/provider behavior, append-only mapping/version guards, retry and read-only conditions. Hash-based metrics and canonical deployable migration definitions replace obsolete implementation names and quarantined paths. Held chargeback money reporting remains hidden; green tests do not financially certify that feature.

## Final validation

On fee88aa2: complete UI 1,461 passed / zero failed or skipped (1,414 + 47); TypeScript zero diagnostics; production build PASS; lint zero errors / nine warnings; whitespace PASS. API source/locks are unchanged from the preceding 1,111 pass / zero fail / four skip run, which is inherited rather than re-executed.

## Staging inspection

Used the Vercel deployment skill for read-only inspection. Team Tracekit/team_QFcd7GbqA7MfBH9bPM0kAqG9 is visible. Project search and team project list return zero projects; lookup of known tracekit-staging returns 404. Query for the combined commit returns zero deployments. Thus this connection cannot currently resolve the staging project, and the candidate has not been published/deployed by this workstream.

Do not interpret empty listing as proof the user's projects do not exist. An exact accessible project/deployment identity or connection access correction is needed. No fallback browser session was probed. No preview was created because the instruction withholding deployment authorization remains active.

Staging plan after exact target/access and authorization: bind deployment metadata to the reviewed code SHA and environment; perform existing operator/client login persistence and logout/re-login; verify selected org/workspace and Admin Client View; check direct cross-tenant denial, client permission denial and governed-action suppression; verify chargeback list/detail currency/race behavior; verify Meta remains inactive; capture safe outputs and exact rollback deployment identity. Do not send invitations, alter memberships, run provider actions or post financial entries as part of these checks.

## Remaining decisions

Independent reviewer must assess this combined candidate and new Meta implementation. Dependency risk remains unwaived (five high dev-tooling package records, one braces advisory; ESLint peer mismatch). WS001 financial certification, real Meta activation certification, exact combined staging/rollback acceptance and explicit release authorization remain open. No automatic release acceptance was inferred.

Production V1 HOLD.

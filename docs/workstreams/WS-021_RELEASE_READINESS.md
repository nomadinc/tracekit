# WS-021 production integration preparation

Observed 2026-10-09 UTC. REVIEW; no merge, push, deployment, invitation, database or provider mutation authorized or performed.

## Identity and scope

- Current origin/main: edbb7640ee6f0df1c7c0484ea84eea0b2210a1f5.
- Production: dpl_AgiVCej9gK87ZaXSRgM2zbwXGAtv, READY, app.trace-kit.io, same SHA.
- Isolated branch: ws021/review-edbb7640. Implementation candidate: 77cb124778f38407a5f08f147466df980701f2e5.
- Original review merge 65db11f6 is unavailable after cloud workspace maintenance. Its source commits 0566fa9d, 7f551eb9 and feaf6847 were recovered from the saved bundle. Admin/invitation/identity implementation is byte-identical to feaf6847; no released ab0b07f4 reapplication.
- WS-016 PR #545 merged at edbb7640 and deployed. Changes: Google Ads daily due migration and two reporting/scheduling modules. No semantic or direct overlap with Admin UI, invitations, RBAC or client context.
- WS-022 PR #544: open draft, unmerged, reported head 779b1d6b. No direct source-file collision; dependencies/Next.js 15.5.27 require combined build/auth/layout validation if merged first. Do not import its dependency changes into WS-021.

## Changed implementation files

1. ui/app/(app)/platform/clients/[accountId]/page.tsx
2. ui/components/platform/client-invitations.tsx
3. ui/app/api/invitations/route.ts
4. ui/lib/identity/invitation-target-access.ts
5. ui/lib/platform/admin-repository.ts
6. ui/tests/ws021-invitation-target-access.test.ts

## Verification

- Focused authorization: 32/32 PASS; five platform/invitation/integration suites. Logs under evidence/ws021/release-readiness.
- Production build: PASS, Next.js 15.5.23 from current main; existing lint/chart/tooling warnings remain. Dependency remediation is not included or certified by this build.
- Layout render: PASS using actual server page and invitation component with fixture repository/session and Next navigation. Four anchor targets, prominent invite action, responsive grid class, explicit workspace control and denied-control suppression verified. Fixture is local-only, no auth bypass in product.
- Prior user desktop/local layout and scroll acceptance applies to identical UI source. New current-main authenticated browser/narrow-viewport verification was not performed; rendering check does not establish pixel layout.
- No full regression rerun/waiver: prior UI/API failures and WS-022 dispositions remain independent release review concerns.
- No real invitation sent/revoked. Mailbox delivery and new-user acceptance remain unverified.

## Authorization and tenancy

Persisted platform user/account/membership/role/capabilities are rechecked via requirePersistedPlatformAccess, including canonical isMembershipEffective. Target organization and owning client account must be active. Contexts come from activeBusinessContextsForOrganization and are constrained to target organization. Scope expansion is request-only and preserves active context and membership. Customer sessions cannot widen scope/query catalog. Invitation issue fixes role to client-read-only and explicitly selected context IDs; existing durable RPC, same-origin validation and delivery flow remain. Acceptance, customer authorization, Admin Client View and WorkOS redirects are unchanged. No new migration, RBAC broadening or alternate authentication path.

## Deployment and rollback plan

1. Open a review-only PR after authorization to publish the branch; do not merge automatically. Attach these limits and existing regression owner dispositions.
2. Refresh main immediately before integration. If WS-022 lands first, reconcile on its dependency baseline and rerun installation, focused authorization, build and browser checks. Otherwise WS-021 can integrate after already-deployed WS-016 without source reconciliation.
3. Require independent PR review, CI, deployment-owner authorization and a recorded decision on outstanding invitation acceptance/regression evidence. WS-019 window release is not deployment authorization or Production V1 certification.
4. Record current production deployment and rollback target at release time, rather than assuming today's target remains current. Deploy only approved commit through existing release pipeline; no env/WorkOS/database configuration changes.
5. Post-release verify Clients/Users/Connections, invite workspace controls, signed-out/customer denial, persisted customer login/logout, separate Admin Client View/banner/exit, unchanged redirect destinations and read-only MCP inventory. Perform a controlled real invitation only with an authorized recipient and explicitly approved test.
6. On authorization/rendering failure, promote the recorded previous production build. Revert only WS-021 implementation in a corrective PR to converge source; preserve WS-016 migration and later unrelated changes. Existing invitation audit/history/memberships must not be deleted or rolled back. No schema rollback required by WS-021; an issued invitation requires a separate explicit revocation decision.

## Decision

Safe to open review PR: YES, with evidence limits; not opened/pushed in this task.
Safe to merge: technically compatible after WS-016; NOT AUTHORIZED and subject to PR/CI and outstanding release dispositions.
Safe to deploy: NOT AUTHORIZED; current evidence does not certify mailbox delivery/acceptance or full Production V1.
Next: independent review and release-owner decisions; retain WS-022 HOLD and exact reviewed scope.

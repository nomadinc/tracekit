# WS-022 independent acceptance code review — PR #575

Reviewed commit: `88f7411457b988e83e51fbc9bf7b4b5b76002fe7`.
Reviewer: separate delegated review agent; no implementation edits performed.
Disposition: no verified blocking code defect found in the reviewed boundaries. This is independent source and synthetic execution review, **not authenticated staging acceptance** or financial/Meta certification.

## Scope and findings

- Authentication/logout: `app/auth/sign-out/route.ts` derives returnTo exclusively through `signedOutReturnUrl`; arbitrary query return destinations and untrusted origins are rejected. Explicitly configured/Vercel deployment origins are server-owned. Preview returns to its own root, production to its own signed-out route. Installed AuthKit SDK clears its session and PKCE cookies and sends the supplied returnTo to WorkOS logout. Adding ONLY the exact preview root to the Staging WorkOS allowlist is consistent with this implementation and is the narrow supported remedy for the reported fallback. I did not independently inspect or mutate the WorkOS dashboard; configuration change and staging observations must be attributed to the executor. No application edit is needed on this evidence.
- Authorization/tenant isolation: financial detail requires effective membership, both financial permissions, accessible active organization, and rejects conflicting tenant hints. Actual chargeback persistence queries remain organization-scoped. Synthetic permission/tenant tests passed. This does not prove existing Admin/client memberships or direct browser access behavior in deployed staging.
- Meta: status and account-selection routes deny missing authentication, organization and connectors.manage; writes enforce same origin and validate selections. Actual service rejects foreign connections before writes. Returned status is allowlisted; selections do not activate schedules. Meta remains inactive and uncertified.
- Edge: synthetic actual-handler tests reject missing/inactive service credentials, reject unbound tenant and nested IP payloads, use the stored organization binding rather than caller organization, and redact persistence parse-error response/logs. System identity/control-plane tests also passed. Some system-identity checks inspect source and are not a substitute for live control-plane acceptance.
- Currency: independent execution bundled the actual detail API route and actual ChargebackReviewWorkspace. Synthetic persistence/session boundaries produced EUR principal and GBP fee; route response rendered €200.00 and £5.00 independently. Null authority rendered explicit currency unknown without a USD fallback. An obsolete selected-detail ID did not render the stale detail amounts. This is API-to-render integration evidence, not real provider/financial execution. Affiliate/source monetary reporting remains held for WS-001.

## Independent fresh execution

Working directory: `/private/tmp/tracekit-ws022-recovery-20261014/ui`.

```sh
node scripts/run-tests.mjs auth-return-url.test.ts m4-permission-tenant-audit-acceptance.test.ts meta-request-boundaries.test.ts meta-oauth-foundation.test.ts meta-connection-ui.test.ts edge-tenant-system-identity.test.ts edge-tenant-binding-control-plane.test.ts edge-delivery-request-boundaries.test.ts chargeback-detail-currency-render.test.ts chargeback-detail-request.test.ts chargeback-selected-detail.test.ts
```

Result: **51 passed, 0 failed, 0 skipped** (42 ordinary suites' cases plus 9 server-condition cases). Log: `ws022-independent-fresh-tests.log`. An initial direct node invocation omitted the repository runner's required React server condition and failed the server-only Meta suite; rerun through the authoritative runner resolved that invocation issue. No code or assertion was changed.

## Limits and remaining acceptance

No live member credentials, authenticated Admin/client staging session, disposable database results, dependency remediation, or WorkOS dashboard state were independently certified in this review. The database executor and staging executor must supply separate attributable evidence. Dependency residuals require explicit owner disposition; this review does not waive them. Production V1 remains HOLD and PR #575 should remain draft pending independent acceptance.

# WS-022 runtime diagnosis and bounded fixes

Starting candidate bcd856c39a5ab6dfbf6bdd8418afef78f931e5b6, isolated branch ws022/acceptance-runtime-diagnosis. Original workstreams and both draft PRs575/576 untouched. Prior live evidence remains at88b98489281b6e907fa25c5fedb0c08ea1297dae; database evidence remains4def7a82567f28db686e992a6ba72d688da2aca1 with original tested commits. ProductionV1 HOLD.

## Customers trace

The authenticated Preview /api/customers route calls scopedCoreGet('/v1/customers', ..., 'customers.view'). It requires authenticated active organization and permission, rejects forged tenant hints, replaces browser tenant scope with session organization, selects server credential and sends GET with x-tk-secret. Preview TRACEKIT_API_BASE_URL was read as the non-secret https://api.trace-kit.io. Core /v1/customers invokes adminAuthError before data access; configured expected credentials are compared with supplied header/bearer, mismatch or absent supplied credential returns401. No key values were read, printed, hashed or compared externally.

Current exact deployment metadata omits TRACEKIT_USE_STAGING_CORE_CREDENTIAL. Fresh project metadata scopes that selector only to production target of tracekit-staging; Preview has both TK_SECRET_KEY and TK_SECRET_KEY_STAGING. The selector code consequently chooses legacy TK_SECRET_KEY in Preview. Current serverless customer401 confirms upstream rejection is surfaced (session/permission/scope rejects use404). This establishes the routing/configuration mismatch and the observed rejection, but does not prove the already-provisioned staging key will be accepted by deployed Core. No attribution to key rotation is made. Authoritative backend credential acceptance must be verified after coordinated branch-specific configuration correction; no credential changes are proposed.

Proposed configuration, pending user response: add TRACEKIT_USE_STAGING_CORE_CREDENTIAL=enabled only for Preview branch ws022/acceptance-runtime-diagnosis on project tracekit-staging, preserving all existing entries/targets/defaults. This selects the existing staging key. Do not change production or credential values. New preview callback/sign-out allowlist additions also require coordination once an exact URL exists.

## Orders traced separately

ProductionOrderRepository sends GET /api/customer-orders. That route calls scopedCoreGet('/v1/customer-orders', ..., 'orders.view'), using the same server credential selector and base URL; Core gates it with adminAuthError. A separate serverless401 was observed on /api/customer-orders. OrderWorkspace previously caught repository errors and set orders=[] then rendered No accessible Orders. Thus both reads share credential selection and observed401; Orders has an additional verified presentation defect that masks failure as empty. It now distinguishes failed load from successful empty portfolio, clears stale snapshot on failure, and displays generic Order Workspace unavailable. No raw upstream message or customer data is rendered. Permissions and tenant checks unchanged.

## Delayed callbacks

Historical400 callbacks for both identities contain SDK missing_pkce_cookie; fresh flows on the same callback return307. These failures occur before WorkOS code exchange or state equality validation. They are missing verification-cookie failures, not an observed oauth_state_mismatch or redirect allowlist rejection. SDK cookies and sealed state each live600seconds, with state-specific names and a five-cookie cap. Delay expiry is consistent with the observed long waits, but browser cookie expiry/eviction was not recorded at failure; historical expiration is not certified as the sole cause. Callback configuration is supported by successful fresh flows on the exact host.

The application onError logger mistakenly inspected the SDK wrapper {error,request}, so application logs hid the actual code. Fix unwraps error and emits only fixed code/category allowlists. Arbitrary error messages, request, state, codes, cookies and headers never leave this diagnostic. Callback remains SDK handleAuth with400, SDK state/PKCE checks, single-use deletion and no-cache semantics. Static restart link starts a fresh flow; no stale callback replay or lifetime extension.

Fresh synthetic reproduction executes the installed AuthKit callback and PKCE code with synthetic requests: absent cookie yields missing_pkce_cookie; unequal state yields oauth_state_mismatch; matching expired sealed state is rejected before provider call. Only unreachable session-save seam replaced; provider fetch calls0. This separates failure paths without live authentication credentials. It does not claim a delayed live browser reproduction or a successful provider exchange.

## Verification and independent review

Fresh clean npm ci passed. Full UI1465passed (1418ordinary+47server),0failed,0skipped. Focused3/0/0. Lint0errors/9inheritedwarnings; TypeScript zero diagnostics after correcting a synthetic test callback parameter annotation; production build passed (local build only, no production deployment). Initial sandbox font DNS failure was rerun with authorized network access. Inherited WorkOS Edge compression and chart-dimension build warnings remain. No dependency or lockfile changes. First test harness attempt used the React-server condition with Next's React18 entry and failed before execution; corrected fixture bundles only SDK callback with unreachable session-save seam, keeping actual callback/PKCE logic. This is a harness correction, not an authentication bypass. Current installed SDK version is from unchanged lockfile.

Independent lint_independent_review reviewer inspected diff and ran focused3/0/0. No blocking defect found; safe fixed diagnostics, retained SDK verification, distinct Orders unavailable state, no tenant/permission changes. Reviewer explicitly says configuration remediation needs authorization and staging validation; expired sealed-state test does not prove historical browser cookie disappearance.

## Failure ledger / owners

- Customer and Orders functional availability: OPEN; Core/Staging configuration owners plus WS022. Coordinate selector, deploy reviewed branch, verify upstream acceptance and rerun roles. Do not assume rotated key cause or waive failures.
- Delayed callback: safe diagnostics/restart implemented; exact historical missing-cookie path identified; real delayed-browser cause/reproduction still OPEN, Authentication owner/WS022.
- Updated preview and client/Admin acceptance: PENDING configuration coordination and exact-host auth registration/user browser authentication if needed. No fresh live acceptance claimed for un-deployed branch.
- WS001 affiliate/source monetary reporting HOLD; Meta inactive/uncertified; broader API/live financial-provider mutation certification outside scope. ProductionV1 HOLD; draft status preserved.

## Rollback

Revert this branch's bounded code changes to bcd if necessary; no schema/financial/provider/member changes. If authorized later, remove only this branch-specific selector entry to undo configuration; preserve all preexisting entries and production targets. Never promote to production. Prior evidence is immutable and separately linked.

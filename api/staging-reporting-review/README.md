# Restricted reporting integration — independent review required

Exact combined source: e44b59c37873fd70d1a0154304edcdf8fd5eb684 (tree 0090e73fc4cc715449d423c54ffb87bbcdacfe9c). Recovered through GitHub Git data, with exact blob, tree and raw commit hashes verified. Earlier ancestry is shallow; no claim of recovered full history. Restricted source input: f3090f62b6d67d03830b70c1f3a2e5c7f3c7a2f3. Original repair branch is not overwritten; this is a separate WS-001 integration branch.

## Implemented paths

The closed COMPUTED registry in manifest.ts contains customer_list, customer_detail, journey_detail, journey_activity, customer_orders, attribution_evidence, commission_evidence and profit_summary. The first seven execute the original Customer Explorer functions through a guarded SELECT-only repository. Direct generic PostgREST operations remain empty; a Core endpoint does not become a raw table endpoint. columns.json records exact source constants, selected aliases, physical columns and scope bindings. Query projections drop raw_json, metadata, policy_snapshot and candidate identity arrays. Nonfinancial roles cannot fetch money columns or commissions. Order reads require orders.view. Financial detail requires BOTH financials.view and orders.view_financials. Existing exact person/journey checks are preserved.

The worker entrypoint is api/src/staging-reporting/worker.ts. It imports no integration/write/scheduler handlers. The only intentional change to the accepted Customer Explorer is an opt-out of work_items reads used by the restricted caller; existing callers retain their prior default. Restricted responses explicitly mark work_items unavailable. Source-record financial NULL/zero/currency values survive; unverifiable aggregate money values are unavailable, not synthesized zero or reconciled Profit.

UI preview reads route through staging-reporting-proxy/runtime instead of the historical TK secret path. Preview requests without the restricted mode fail closed. Read-mode POST operations deny. The SSR Customer repository uses the same cutover. Production routing is unchanged when the staging mode is absent. The read transport uses AuthKit's existing access token and verifies the active-organization cookie against the protected application-user identity. It never calls synchronizeUser. Existing application-page session bootstrap still uses the separate application-session.ts; WS-021 must independently ensure that UI session bootstrap has a safe read-only identity path before customer activation. This implementation does not silently grant identity-sync writes to fix that dependency.

## Issuer and current authority

Deploy the separate authority-worker.ts only after custody/configuration review. It verifies WorkOS RS256/ES256 tokens against explicitly pinned issuer/client/JWKS, reads only current_memberships with a separate tk_stg_membership_verifier token, and issues a maximum 45-second Ed25519 reporting token. subject maps external WorkOS identity to protected application_user_id. JWT aud=authenticated, purpose=tracekit-staging-reporting, role is one of the two restricted roles, scope is organization/workspace and membership version. Current membership is checked before/after reads. Permission loss denies stale tokens even if version maintenance fails. JWKS publication exports only public material. These are implemented code paths, not enrolled keys, approved custodians or a deployed service.

The source uses the combined candidate's organization-as-workspace contract and rejects organization != workspace. No arbitrary workspace/organization mapping is invented. Supporting distinct workspace identities requires an explicit protected mapping contract.

## Staging configuration (no values installed)

Target URL is exclusively https://joahiwgidfbzwzyslrbq.supabase.co.

UI: VERCEL_ENV=preview; TRACEKIT_REPORTING_MODE=restricted-staging; REPORTING_SUPABASE_URL; REPORTING_AUTHORITY_URL; REPORTING_CORE_URL; existing staging-only AuthKit/cookie configuration. No service-role or direct database credentials.

Core Worker: REPORTING_SUPABASE_URL; REPORTING_PUBLISHABLE_KEY; REPORTING_ISSUER; REPORTING_PUBLIC_JWK; REPORTING_AUTHORITY service binding. No signing key, membership-verifier token, service-role key or direct database password.

Authority Worker only: REPORTING_PUBLIC_JWK; REPORTING_PRIVATE_JWK; REPORTING_ISSUER; REPORTING_PUBLISHABLE_KEY; MEMBERSHIP_READER_TOKEN; WORKOS_REPORTING_JWKS; WORKOS_REPORTING_ISSUER; WORKOS_CLIENT_ID. Its registry reader must have only the exact private-registry SELECT columns. Identity/permission assignment is owned by the independently enrolled registry administrator; issuer cannot grant or mutate membership. Recommended proposed reporting issuer is https://staging.trace-kit.io/reporting-authority, matching the SQL draft. The actual staging PostgREST signing-key/issuer/audience/schema configuration must be independently accepted; no claim of token compatibility from synthetic tests.

## Concrete blockers

1. Profit Summary in e44b59c reads profit_daily_rollups, outside the approved eight-object list. Its registered operation returns 503 without fetching another table or approximating costs. An explicit source/grant scope amendment is required for that existing calculation.
2. Source order view is SECURITY INVOKER and needs platform_orders and person_source_identities privileges. Neither is in the approved list. Actual installed view definition/dependencies/ACLs were not verified by list_tables. No view grant or owner-bypass conversion is proposed. Order-dependent operations cannot receive native acceptance until this conflict is reviewed.
3. Protected current_memberships, restricted roles, actual authenticator membership, public-key trust, API schema exposure and custody are uninstalled/unassigned. Existing user/organization data is not copied or promoted into authority automatically.
4. Existing UI page/session initialization requires a separately verified read-only identity path. No UI identity administrator credential is authorized here.
5. Effective inherited/PUBLIC ACLs and reachable SECURITY DEFINER paths remain native catalog/HTTP acceptance gates. Database-only mutation/privilege denial has NOT been proved by mock tests.

## SQL and review handoff

roles-and-authority.sql is an UNREVIEWED staging-only proposal, 97 syntax-checked SQL statements, ending in ROLLBACK. It contains exact base-column grants derived from source plus the captured staging table definitions, restrictive tenant SELECT policies, a private current-membership guard, and fail-closed checks for unexpected mutation or privileged-function exposure. It intentionally grants no order-view access, Profit table access or work_items access. It does not enroll authenticator role memberships or signing keys. It is not ready to apply while the blockers above remain. No migration file was created or changed.

WS-023 review is required for the exact three existing UI/API-file deltas and financial-unavailability behavior; this branch has not been pushed into WS-023's branch. WS-021 owns the staging configuration and credential custody. WS-022 independent security acceptance is pending. No staging activation is authorized by this source.

Mandatory token-authority gate: accepting an issuer key alone is insufficient. The SQL proposal adds a SECURITY INVOKER, GET-only db_pre_request hook that admits only the two reporting roles and the narrow registry-verifier role, with exact path/purpose/issuer/audience checks. Other roles and every RPC/write path deny before the main query. This is a project-wide staging configuration change, not an applied setting. Actual authenticator identity, existing pre-request composition, schema exposure and effectiveness must be independently verified before any signing-key enrollment. Without this gate, issuer-key enrollment is NO-GO. PostgREST semantics were checked against its official authentication/configuration documentation; no installed-version behavior is claimed from documentation.

Preservation finding: e44b59c omits two accepted files present in 9834295: 20261025000000_ws030_edge_intelligence_release10_exclusion.sql and 20261028043828_ws001_next29_refund_financial_integrity.sql. This isolated candidate restores their exact accepted bytes. All 224 original migration commitments then match. Neither file was changed or executed; the four financial triggers and WS-030 protections are not weakened. This source restoration must be included in integrated migration-order review, not silently omitted on release.

Secret-free actual-role evidence: the proposed pre-request hook emits only X-TraceKit-DB-Login, X-TraceKit-DB-Role and X-TraceKit-DB-Session-Authorization. Every guarded database response must report the expected authenticator physical/session identity and the exact reporting/verifier effective role; missing or privileged-role evidence denies before data serialization. These are proposed expected values, not observed installed identities. Live acceptance must independently establish them. Logs/errors contain no token, credential or raw provider response.

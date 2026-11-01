# Bounded WS-021 session bootstrap handoff

Current candidate descends from c921b3e98cd78a6db2f1cb1d0c9f4b808a209ccc. No credential assignment or deployment authorized.

Verified source behavior: `resolveApplicationSession`, `resolveAuthenticatedPersistentIdentity`, `synchronizeWorkOSUser` and `recordAuthenticationSuccess` previously reached the legacy service-role identity repository. All four are now fenced before repository construction in Preview or restricted-staging mode. This deliberately makes the ordinary UI session unavailable while the read-only bootstrap is unresolved. It is not a functioning replacement identity service.

The restricted reporting GET caller continues to use AuthKit `withAuth`, the trusted issuer and signed active-organization selection without identity synchronization. Its role, scope, current-membership and permission checks are separate from page-level session serialization.

WS-021 must provide an independently reviewed read-only page-session boundary: authenticated WorkOS subject to protected application-user identity; current organization/workspace membership and effective permissions; current account/organization status; only explicitly authorized organization/context display metadata. Do not fabricate a persistent membership, account, bootstrap owner or default workspace from a reporting token. No impersonation or platform-admin authority follows from a reporting claim. The existing reporting registry does not carry enough account/context evidence to build the full legacy session.

Staging-only configuration already required by the reporting transport: VERCEL_ENV=preview, TRACEKIT_REPORTING_MODE=restricted-staging, REPORTING_SUPABASE_URL=https://joahiwgidfbzwzyslrbq.supabase.co, independently approved HTTPS REPORTING_AUTHORITY_URL and REPORTING_CORE_URL, and staging-only WorkOS/session registrations. Do not install SUPABASE_SERVICE_ROLE_KEY/TK_SECRET_KEY or use production credentials for this boundary. Actual issuer/key/JWT trust and registry administrator custody remain unassigned and must be verified.

Acceptance: missing/revoked membership, expired token, foreign org/workspace, missing bootstrap configuration or identity-service failure must produce denial/unavailable before any privileged read/write; no automatic user synchronization, membership enrollment or privileged fallback. Production behavior outside restricted mode is unchanged.

This file is a prepared coordination handoff; no external WS-021 acknowledgment is claimed.

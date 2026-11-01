# Focused integration handoff

Input: e44b59c37873fd70d1a0154304edcdf8fd5eb684. Earlier WS-001 input: f3090f62b6d67d03830b70c1f3a2e5c7f3c7a2f3.

WS-023-owned source delta is confined to api/src/customer-explorer.ts (optional work-items suppression), ui/lib/identity/scoped-core-proxy.ts (fail-closed preview cutover), and ui/lib/customers/production-repository.ts (SSR cutover). No original branch is overwritten or pushed. Review these exact deltas and UI unavailability behavior before combining on WS-023's branch. Existing operations/projections are recorded in columns.json and manifest.ts; no direct unbounded table API is exposed.

WS-021: use separate Core and authority Worker entrypoints. Core holds publishable/public verification data plus a service binding; authority alone holds issuer signing material and a restricted registry-reader token. UI receives only issuer/Core URLs and existing staging AuthKit bindings. Install no service-role or migration credentials. Native key trust, PostgREST pre-request enforcement, actual effective roles and read-only UI session initialization require separate acceptance. No deployment or credential assignment occurred.

Finite Master decisions: authorize reviewed dependencies for the existing SECURITY INVOKER order view (platform_orders/person_source_identities), or supply an independently accepted replacement view contract; approve profit_daily_rollups as an additional read source, or keep Profit unavailable. Do not weaken view security or fabricate financial calculations to fit the eight-object list. work_items stays excluded.

WS-022: independently review issuer impersonation boundary, exact protected membership identity mapping, role-scoped token/pre-request enforcement, PUBLIC/inherited privileges, per-column/RLS rules, financial redaction/NULL preservation, no-fallback cutover and exact native/HTTP gates. No independent acceptance has been claimed.

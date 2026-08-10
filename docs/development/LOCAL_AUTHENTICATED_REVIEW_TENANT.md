# Local Authenticated Review Tenant

The Bullseye authenticated review tenant is disposable local data. It is intentionally not part of a production migration and is not created by `supabase db reset`, because membership must reference the TraceKit User synchronized from a real WorkOS session.

## Restore after a reset

1. Run `npx supabase db reset --local`.
2. Start the TraceKit UI and complete one WorkOS login. The secure no-membership screen is expected on this first login because it creates only `tracekit_users`.
3. Run `./scripts/bootstrap-local-review-tenant.sh` from the repository root.
4. Sign out and sign in again, or hard-refresh the authenticated application.

The default WorkOS fixture identity is `user_01KZ1XCDJ94Y2K6GDS8QNME4J6`. To use another already-synchronized local WorkOS user without editing files:

```sh
TRACEKIT_REVIEW_WORKOS_USER_ID=user_example ./scripts/bootstrap-local-review-tenant.sh
```

The bootstrap fails unless exactly one matching `tracekit_users` row exists. It never creates a user. Account, Organization, Business Context, membership, and access writes are idempotent and use existing database uniqueness constraints. Conflicting non-fixture tenants named Bullseye Health cause a failure instead of creating duplicates.

Expected scope after bootstrap:

- Account: Bullseye Health (`client`)
- Organization: Bullseye Health
- Membership: active Organization membership using `organization-admin`
- Product review entitlement: active Account membership using `platform-admin`
- Investigation capability: explicit local `admin.manage_feature_access` allow on the Bullseye Organization membership
- Managed TKID origin capability: separate explicit local `admin.manage_feature_access` allow scoped to `tkid_origin_registry`
- Business Context: Bullseye (`offer-bullseye`, digital)
- Business Context access: active

This fixture contains no WorkOS credential, session token, provider credential, customer row, or production data.

The platform membership does not replace the Bullseye membership. Session resolution remains anchored to the Organization membership so Bullseye and `offer-bullseye` continue to authorize normally. Separate local capability overrides grant only Investigation and managed-TKID-origin Product/Admin review. They do not expose either resource to ordinary Organization, Client, or Agency memberships.

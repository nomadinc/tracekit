# Restricted staging source assembly — 2026-11-02

Disposition: assembled offline review candidate; NOT activation acceptance.

Parents: preferred accepted WS-021 callback correction `f0faa18b2090d3c0503cd30c271c2e56d5d1a1bf` and reporting branch tip `ad94083507bab13bd633b8359767d92ed4cbe5d1`. Common reporting base: `e44b59c37873fd70d1a0154304edcdf8fd5eb684`.

The alternative callback sibling is not integrated. Core runtime, accepted authorization modules, Profit implementation, and migrations are unchanged from the first parent. Reporting UI changes are imported without behavioral edits. Permanent-origin helper, middleware, and tests are restored byte-for-byte from accepted source `91ba40ec1690ad4301a2aa7fbddd80c6a3ae9d28`. Middleware matcher is unchanged and the opt-in guard executes before AuthKit. No configuration activates it.

## Verification

244 focused tests pass: UI 146, Core 62, permission/registry completeness 23, session 13. No skipped tests. Synthetic fixtures only; no native database or authenticated customer test.

From `ui/`:

```sh
node --conditions=react-server --import ./node_modules/tsx/dist/loader.mjs --test tests/ws021-read-only-staging-session.test.ts tests/ws001-staging-session-boundary.test.ts tests/persistent-identity.test.ts tests/auth-return-url.test.ts tests/ws020-scoped-core-gateway.test.ts tests/ws023*.test.ts tests/ws026-staging-auth-origin.test.ts
```

From repository root:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test api/src/staging-reporting/authority.test.ts api/src/staging-reporting/client.test.ts api/src/staging-reporting/computed.test.ts api/src/staging-reporting/order-view.test.ts api/src/staging-reporting/profit-pagination.test.ts api/src/staging-reporting/profit.test.ts api/src/staging-reporting/repository.test.ts
node --conditions=react-server --import ./ui/node_modules/tsx/dist/loader.mjs --test api/src/staging-reporting/permission-completeness.test.ts api/src/staging-reporting/registry-completeness.test.ts
node --conditions=react-server --import ./ui/node_modules/tsx/dist/loader.mjs --test api/src/staging-reporting/session.test.ts
```

Native Node alone cannot resolve extensionless transitive UI imports in the completeness tests; the recorded successful run uses tsx. Initial native-run errors were runner failures, not accepted test results.

Targeted lint passes with five hook-dependency warnings in imported customer/profit/offers components. React review confirms context-bound drawer ownership and stale-response fencing remain present; warnings are retained for reviewer disposition rather than silently refactoring reviewed source.

Full UI TypeScript check reports 67 diagnostics; see log. This is not a clean typecheck or build-ready claim. No build was attempted after this failure. No diagnostics occur in the newly imported/restored files (verify against exact changed-file manifest).

## Remaining gates

- WS-022 review of this exact combined composition and unresolved singleton/UI review dispositions; prior component acceptance is not composition acceptance.
- Resolve full-source TypeScript diagnostics and obtain build acceptance.
- Guard requires deployment branch `workstream/ws-026-product-recovery`; this local review branch must not activate it. Permanent origin is exactly `https://staging.trace-kit.io`.
- Keep authorization and Profit snapshot gates unset pending native completeness, restricted-role, ACL/RLS, credential-custody and tenant-isolation acceptance.
- Staging Core target, restricted session-reader credential authority, WorkOS runtime/cookie pairing and candidate-bound isolated deployment remain runtime prerequisites.
- No grants, SQL, credentials, environment changes, pushes, deployments or live identity tests performed.

Staging activation HOLD. Production V1 HOLD.

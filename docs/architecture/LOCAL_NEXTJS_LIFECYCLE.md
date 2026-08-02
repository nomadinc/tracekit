# Local Next.js Lifecycle

TraceKit development and production validation must never write to the same Next.js output directory. Development uses `.next`; production validation uses the supported Next.js `distDir` setting with `.next-build`.

## Required sequence

1. Stop the active `npm run dev` process.
2. Run `npm run build`. The lifecycle guard refuses to build while any Next.js process from `ui` is active and validates that production manifests reference existing CSS and JavaScript.
3. Run `npm run dev`. The lifecycle script removes stale development and completed production-validation output, refuses duplicate TraceKit Next.js processes, binds port 3000, loads the public signed-out page, and verifies referenced CSS and JavaScript return HTTP 200 before reporting readiness.
4. Run `npm run review:check` at any time to require exactly one TraceKit Next.js process and recheck development assets.

`npm run start` consumes `.next-build`, never `.next`. Generated directories are ignored. Do not invoke `next dev`, `next build`, or `next start` directly because doing so bypasses lifecycle protection.

The readiness page is `/auth/signed-out` because it is public and exercises the root layout without changing WorkOS configuration or weakening route protection.

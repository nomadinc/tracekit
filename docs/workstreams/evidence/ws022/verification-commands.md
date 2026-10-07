# Verification commands

All commands ran locally with Node 22.23.3. No deployment or production database access.

- UI: `npm test`, `npm run build`, `VERCEL=1 npm run build`, `tsc --noEmit --incremental false`, `npm run lint`.
- API, on baseline and patched tree: `node --import tsx --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test-concurrency=4 --test src/*.test.ts`.
- All four boundaries: `npm ci` with lifecycle scripts enabled under npm 10.9.4 and npm 11.9.0; fresh `npm audit --json` and `npm audit --omit=dev --json`. Final nested npm 10 install/test is authoritative after the last scoped override.
- API/continuous/relay: `wrangler deploy --dry-run --outdir <scratch-output>`; metrics disabled.
- Relay: `vitest run` (two trusted Hello World tests; no UI server exposed).
- Migration guard: `bash scripts/test-m15-authoritative-migration-chain.sh`; exit 2, disposable local database absent.

The unrestricted parallel API run did not complete its full aggregate summary under concurrent builds; baseline and patched suites were rerun at concurrency 4 and completed with identical counts/failure titles.

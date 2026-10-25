# WS-023 P0 Edge regression evidence — pending execution
Base: `c1931ad63c82741d74405841c5cd3485870c3bf6`
Historical checkpoint: 276 PASS / 0 FAIL / 0 SKIP, unchanged.
Source files changed: only `ui/tests/edge-intelligence-v1-validator.test.ts` and `ui/tests/edge-intelligence-v1-delivery.test.ts`.
Historical failures retained: wrong-tenant credential HTTP 201, and sensitive persistence exception logged. Do not mark remediated without passing behavioral tests.
Offline execution from `ui/` after `npm ci`:
```sh
npm test -- edge-intelligence-v1-validator.test.ts edge-intelligence-v1-delivery.test.ts > /tmp/ws023-edge-p0.log 2>&1
echo "EDGE_EXIT=$?"
grep -E '^not ok|^# (tests|pass|fail|skipped)' /tmp/ws023-edge-p0.log
```
Expected current failures: Model B cross-tenant denial and persistence-exception log redaction. These are runtime defects owned by WS-004/WS-001/WS-022, not WS-023.
Never publish raw error logs; redact secrets and PII before WS-022 review. Repository-wide TypeScript baseline comparison remains pending local execution; use exact `c1931ad6` base and same dependency locks/options. Staging-only: WorkOS PKCE/callback, Core/Supabase isolation, authenticated object-level tenant denial. Production V1 HOLD.

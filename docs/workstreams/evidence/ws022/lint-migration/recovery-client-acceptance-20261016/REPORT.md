# Exact recovery-preview client acceptance — 2026-10-16

Application SHA775cbec41b1d937ea59a56d47276ae1a0ecc1c36, deployment dpl_21SY95PQASdmA9RiDoANK6VebD8s, Preview https://tracekit-staging-5bmzzfyf8-tracekit.vercel.app. No source or environment changes this pass.

User completed existing ordinary-client authentication. Account menu confirms client-read-only, Stem Labs organization/business context. Client Organization navigation (no Admin support banner) and only the allowed Stem Labs workspace are displayed. Earlier read-only membership discovery retains original provenance; no membership changes made.

| Check | Result |
|---|---|
| Recovered client identity | PASS: application loads persisted client-read-only scope. |
| Persistence | PASS: full root reload retains Stem Labs Mission Control and client session. |
| Allowed workspace | PASS: existing Stem Labs connector renders. Read-only page carries production provider metadata; no provider action invoked and Vercel deployment remains Preview. |
| Foreign tenants | PASS: two existing foreign connectors (TraceKit and Accufy) each404, no detail. |
| Admin/client separation | PASS: /platform404 for client; Admin catalog access documented separately. |
| Customers | PASS: allowed customer evidence workspace renders. |
| Orders | PASS: allowed Order workspace renders, monetary amounts Not available / Profit details not available; no live financial action attempted. |
| Chargeback privileged reads | PASS denial: list request reports404 resource_unavailable, no dispute rows. Admin successful reads separately documented. |
| Meta authorization | PASS denial: settings destination outside allowed scope. No activation/connect/save invoked. |
| Governed-action discovery | PASS limited read-only boundary: no Prepare governed action buttons; unavailable reason Required action permission is not granted in the active organization. Confirmation required displayed. No prepare/confirm/execute POST performed. Admin positive discovery remains incomplete, not inferred from client denial. |
| Logout/session clearing | PASS behavior: Sign Out reaches WorkOS Staging sign-in; direct navigation to protected /orders remains at Staging sign-in. No cookie values inspected or retained. |
| Re-login after this logout | PENDING user browser authentication; email challenge prepared. Initial client sign-in followed Admin logout, but does not substitute for this final lifecycle check. |

Fresh exact-SHA affected checks: npm test -- ws022-runtime-diagnostics.test.ts ws020-scoped-core-gateway.test.ts m4-permission-tenant-audit-acceptance.test.ts m12-execution-permission-gate.test.ts chargeback-detail-request.test.ts chargeback-selected-detail.test.ts chargeback-detail-currency-render.test.ts meta-oauth-foundation.test.ts. Authoritative runner25+9 =34 passed,0failed,0skipped, exit0. These include deterministic late-detail race regressions; they do not establish forced browser network-race acceptance. Source worktree clean, unchanged SHA. See focused-checks.log.

Full UI1465/0/0, lint0errors9warnings, TypeScript0, build passed retain original exact775 execution provenance; no new full-suite claim. Disposable API1115/0/0 and four focused4/0/0 remain at88f7411, distinct from inherited WS-024 evidence.

Open owners: WS-022 frontend transient not-found while detail loads and unfinished Accufy Orders observation; WS-022 acceptance Admin positive governed discovery and forced browser race; Authentication/WS-022 delayed callback cause; user browser authentication / WS-022 final re-login; Platform-CI managed preflight integration; WS-001 monetary certification; Meta owner inactive/uncertified; Release owner Production V1 HOLD. Previous recovery Admin report and rollback remain applicable, no rollback/config change required for this read-only pass. All PRs draft.

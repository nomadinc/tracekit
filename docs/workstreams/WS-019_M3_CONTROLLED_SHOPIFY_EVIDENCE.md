# WS-019 M3 — Controlled Shopify Production Evidence

Status: **BLOCKED BEFORE MUTATION** on 2026-10-03.

Baseline: M2 `ebc263c308daea4b19320586d5dcf1411d9a6b7e`; `origin/main` `828c32225ad93899a5f0e974a2e3fc9964776558`.

## Proven preflight facts

- Repository-approved organization: Stem Labs, `8f6bb14b-2126-49b8-bfdb-c60edbc3549b`.
- Repository-approved M15 Shopify connection: `d69a93dd-98ed-46fd-b486-1a39fb8388dd`.
- Approved operation: `shopify.controlled_webhook_create_delete_proof`.
- Exact server-resolved provider target: `izkfvg-k0.myshopify.com`, proof-only topic `APP_UNINSTALLED`, callback derived server-side from the authenticated application origin.
- The governed implementation requires `actions.execute`, opaque preparation, fresh explicit confirmation, immutable target resolution, atomic consumption, provider read-back, exact deletion, absence verification, durable recovery/audit, and replay.
- Production V1 policy leaves Shopify controlled proof enabled unless a global, provider, or action disable is explicitly set. Commas remains disabled and Everflow remains read-only.

These are repository assertions, not current production evidence.

## Blocking preflight facts

- The isolated worktree has no `.env.local` or other production runtime environment.
- No production Vercel project is linked; project and production UI deployment identity cannot be verified without guessing.
- No authenticated application browser session is available.
- Therefore the current operator identity, active organization/workspace, effective `actions.execute` permission, live safe-disable values, current connection/credential state, current proof-topic absence, tenant-negative fixture, and production telemetry cannot be proven.

No Shopify request, action intent, confirmation, execution, provider mutation, or database mutation was performed.

## Acceptance manifest

`evidence/WS-019_M3_SHOPIFY_PRODUCTION_ACCEPTANCE.incomplete.json` intentionally contains no qualifying production evidence. The M2 validator must reject it. It must be replaced by a fresh evidence-producing run only after every blocked prerequisite is established.

## Regression baseline

The full UI suite was executed outside the filesystem sandbox because `tsx` requires a local IPC socket.

| Revision | Tests | Pass | Fail | Classification |
|---|---:|---:|---:|---|
| M2 plus M3 preflight repair | 1,153 | 1,031 | 122 | Every remaining failure name reproduces on `origin/main` |
| `origin/main` `828c322` | 1,148 | 1,025 | 123 | Baseline |

The exact M3 failure-name inventory is in `evidence/WS-019_M3_REGRESSION_FAILURES.tsv`; every row is classified `PRE-EXISTING`. Set comparison found no failure name unique to WS-019. One genuine M2 regression was found and repaired before recording this baseline: provider safe-disable policy had incorrectly gated the non-provider `inspect_evidence` action. One directly superseded M14 Commas assertion was updated to the frozen M2 classification. No unrelated historical test was edited.

The suite contains historical milestone assertions that intentionally disagree with later repository state, missing historical migration fixtures, and several malformed test files containing literal `\\n` separators. These remain baseline debt and were not changed.

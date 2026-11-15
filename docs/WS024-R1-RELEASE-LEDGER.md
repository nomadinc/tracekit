# WS-024 R1 — UI-only customer-demo candidate

**Canonical disposition:** FIXED — INTEGRATION / PREVIEW ACCEPTANCE PENDING. **NOT DONE.**

Production UI baseline: `6bbfae0fa8d60a1a950f68a1e13c601ea8bf4a2f`, tree `31bb569583fcaa80f5b79ea7c12e7aa89cfd7bd0`.
Production Core Worker is pinned and unchanged: `e2996eaa-badf-4584-991d-3e6560feece0`.

## Included (source-only)
- R1-INVALID-CUSTOMER-ID: Preserve explicit requested Customer ID; never substitute first list row.
- R1-NH-DEEP-LINK: Persistent Orders deep links do not invoke development-only organization/Business Context selection.
- R1-CUSTOMER-SCOPE: Persistent Customer deep links do not invoke development-only tenant resolution; render-time owner fence rejects stale snapshot across organization/context/customer selection. Existing customer repository and Core endpoint unchanged.
- R1-OFFERS-READONLY: Hide entire administrative product-mapping wrapper unless `offers.manage` and authorized client/agency shell; server-side mutation authorization unchanged.
- R1-MC-OWNER: Mission Control hides stale portfolio props when active authenticated organization/Business Context does not match.

## Explicitly excluded / gated
- R1-PRODUCT-LINES: existing production UI Order repository does not consume `order_lines`; accepted newer source requires Core `/v1/customer-orders` response to expose scoped `order_lines` plus canonical order identifiers. Existing production Worker response is not independently authenticated/attested here. No fabricated line items or fallback from totals. Excluded until read-only authenticated payload evidence establishes compatibility.
- R1-CANONICAL-JOURNEY: richer Journey canonical event/relationship fields require exact live Core payload evidence. Existing baseline behavior retained.
- R1-FINANCIAL-QUALIFICATION: newer financial portfolio and financial read contracts require coverage/authorization and shared Core source verification. Existing production portfolio calculation and authorization retained; no invented zero or newly certified totals.
- R1-SESSION-REVISION: new session-selection handlers, SQL, cookies and client ordering mechanism excluded because required SQL is not installed. Existing WorkOS sessions and selection endpoints retained unchanged.
- R1-CORE-PROXY: new Core transport/projection, Next29 writer, encryption, provider or database code excluded.

## Production Core dependency map
| Included change | Existing UI/Worker API | New fields | Assessment |
|---|---|---|---|
| Invalid Customer ID | Existing `/api/customers` and `/api/customers/{id}` reads | None | UI-only, preserves original requested ID; hosted denial requires Preview |
| NH Orders deep link | Existing `/api/customer-orders` read and existing session | None | UI-only; no new session SQL |
| Customer scope owner | Existing `/api/customers` read and existing WorkOS session | None | UI-only; server tenant denial remains mandatory |
| Offers admin visibility | Existing `offers.manage` authorization | None | UI-only, mutation API guard unchanged |
| Mission Control owner | Existing active organization/context and server portfolio props | None | UI-only; no new financial qualification |
| Purchased Products (excluded) | Core `/v1/customer-orders` | `order_lines`, `canonical_order_id`, scoped line metadata | Live deployed Worker payload **NOT VERIFIED** |
| Rich Journey (excluded) | Core `/v1/customers/{id}/journeys/{id}` | canonical Journey and commerce evidence | Live deployed Worker payload **NOT VERIFIED** |
| New financial presentation (excluded) | Core financial read and coverage | coverage completeness, qualified amounts | Live deployed Worker payload **NOT VERIFIED** |

## Validation / independent gates
- Exact baseline and six-file source comparison: source-only.
- Six changed TypeScript/TSX files: TypeScript isolated parser/transpile PASS; six static assertions PASS.
- Strict project `tsc --noEmit`: **HOLD** — missing `@types/d3-*` and incomplete local Node dependencies; not a pass.
- Production Next.js build: **HOLD** — incomplete local Node dependency installation; not a pass.
- Shared mounted Stem/NH Orders/Customer/Journey, cross-tenant, financial and Offers regressions: **HOLD** — test dependencies unavailable; no pass claimed.
- Independent WS-022 review: **PENDING**. Protected authenticated Preview/WS-020 both-account acceptance: **PENDING**.
- Actual Core response compatibility: **HOLD** — no authenticated production Worker payload read; only unchanged API dependency proven.

## Preview checklist (requires separately authorized protected Preview)
1. Confirm deployment commit/tree, existing Worker ID, WorkOS callback, read-only memberships and existing selection endpoints; no new SQL or credential changes.
2. Stem Labs: select correct org/context; order `next29:103104`, Customer, back to Order, Journey; explicit invalid UUID stays unavailable; read-only Offers has no administrative mapping; financial denials persist; refresh and back/forward.
3. NH Discounts: select org/context; direct `/orders?v=1&order_id=next29%3A103533`, refresh; Orders -> Customer -> Orders; invalid customer/order IDs unavailable; no selection POST from deep link; no stale Stem rows.
4. In both tenants, capture sanitized actual Core `/v1/customer-orders` and Journey API payload shapes and permitted fields. Do **not** infer products or financials from totals. The R1 candidate intentionally does not add product-line rendering.
5. Negative: foreign tenant IDs, wrong context, unauthorized financial API and Offers mutations fail closed. Record requests and UI with no customer PII.
6. Stop on any scope drift, cross-tenant render, false zero, unauthorized control or auth failure.

## Deployment / rollback plan (not authorized for execution)
- After strict TS, reproducible build, focused WS-022 approval and signed protected Preview acceptance: request separate production authorization.
- Deploy immutable R1 UI SHA to existing UI project, preserving Worker `e2996eaa-badf-4584-991d-3e6560feece0`; no SQL, encryption or provider changes.
- Independently verify both customer sessions and tenant negatives before marking DONE.
- Rollback UI to verified `6bbfae0fa8d60a1a950f68a1e13c601ea8bf4a2f` if authorization or isolation fails; retain current Core Worker and session DB unchanged. Rollback requires release-owner authorization.

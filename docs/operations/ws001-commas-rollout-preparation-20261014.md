# WS-001 Commas rollout preparation

Status: REVIEW / DISABLED. PR #574. No main merge, production SQL, UI integration, migration activation or release is authorized. WS-022 owns release; WS-023 owns presentation. Accufy's offers remain fixed.

## Prepared lookup and persistence

`prepared/commas-dispute-order-link.sql` is an executable review fixture outside `supabase/migrations`. It creates only the isolated `ws001_dispute_preparation` schema in a disposable test database. It has no runtime grants, enrollment endpoint, RPC adapter, scheduler or ingestion import.

The lookup uses the existing scoped source mappings: numeric `transaction` and public `commas_public_transaction`, each active and canonical type `order`. Authority is supported by `ui/scripts/backfill-commas-public-transaction-identities.ts` and the exact ORD refund lookup migration. The existing unique source identity constraint is a prerequisite. The canonical order must also match organization, connection and provider account.

The trusted evidence verifier must authorize the Commas account, fetch retained restricted bytes, verify their SHA-256, check event/dispute identity, and extract only provider-confirmed paths before enrolling the immutable verified identity. The fixture checks enrollment against retained event and evidence hashes, scope, source type, restricted classification and deletion state. Enrollment is not independent proof of raw bytes; no enrollment privileges are granted.

The function locks the dispute row, event/evidence/proof and resolved mappings/order. It writes the immutable identity audit and exactly two projection fields in one transaction. Lifecycle timestamps, latest lifecycle evidence, terminal status, principal, fee, currencies, refund links and wallets remain untouched. The identity audit independently retains its evidence/event and mapping references. Missing identifiers/mappings, conflicting identities and an existing different order hold. A replay after an exact link is a noop.

PGlite tests verify rollback and sequential replay in disposable PostgreSQL. They do not certify simultaneous sessions, lock contention, mapping-writer races or the full migration chain. Before activation, run the full chain and two-session tests on disposable PostgreSQL, including concurrent lifecycle advancement, mapping replacement and audit failure. Preserve the existing source uniqueness constraint; add bounded statement/lock timeouts at the runtime transaction boundary and retry only retryable database conflicts from fresh evidence.

Reproduce the database suite with a disposable, pinned `@electric-sql/pglite@0.5.10` install. Set `WS001_PGLITE_MODULE` to its `dist/index.js` absolute path and run `node --test api/src/commas-dispute-order-persistence.test.mjs`. No dependency was added to production packages.

## Customer journey contract and verified gap

Inspection at main `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3` confirms `getCustomerDetail` in `api/src/customer-explorer.ts` queries the authorized person, scoped order read model, journeys, attribution, commissions and work items. It does not query `commerce_provider_disputes`. `api/src/explanations.ts` currently counts chargebacks from order status; this is not a live-dispute read contract, and its chargeback amount calculations must not be reused as wallet loss.

The disconnected `commas-dispute-customer-read-preparation.ts` demonstrates the bounded read contract: exact matched dispute → completely scoped canonical order → the authorized resolved person. Retain an existing order journey relationship. A person-linked order without TKID still permits the dispute to be shown with journey unknown and tracking identity unavailable. Do not manufacture a TKID, journey event, order status change or refund relationship. Suggested historical matches are not promoted to exact authority.

The output excludes raw payload, buyer/contact fields, metadata and TKID values. It retains safe evidence references, principal and fee separately, source-qualified currencies, and null wallet loss. The real API must authorize the person first, verify the matching scoped identity audit (a matched label alone is insufficient), query both order and dispute tables in all three scope dimensions, paginate complete results, and reject ambiguous/foreign rows. The identityAuditVerified input is an adapter attestation, not proof by itself. This preparation is not wired into customer detail, chronology or UI; browser-to-API acceptance remains outstanding until integration is authorized and real rollout evidence exists.

## Currency and source-level reporting determination

PR #569 remains the nullable row currency contract. Its principal provenance allowlist is `provider_payload.currency` / `workbook.Currency`; fee provenance is independently `provider_payload.fee_currency` / `workbook.Fee Currency`. The approved historical workbook has neither currency field, so both are unknown. 29Next report currency does not substitute for principal currency. Legacy stored USD without qualified provenance remains unknown. No evidence backfill was performed.

Source/sub-ID reporting remains required. The existing `buildFinancialIssueAnalysis` in `api/src/profit.ts` chooses source_id first, otherwise the first populated sub1–sub5. It is not an independent breakdown per dimension. It joins legacy ledger/platform rows by order_id and sums amounts without qualifying currency partitions; its monetary reporting remains on HOLD.

The preparation adds a pure disputed-principal aggregation contract: scope and exact order/attribution authority must be established by the caller; group by source and independently source-backed currency; keep unknown source and currency explicit; reject repeated dispute projections; use exact decimal arithmetic without two-decimal currency assumptions. An incomplete amount group returns a null principal total and a separately named known subtotal plus unknown count. Fees, wallet movements, refunds and recoveries are not part of principal exposure. No rates or denominator claims are produced. A production contract must separately provide complete scoped denominator coverage, independent sub-ID dimensions, attribution provenance, principal/fee partitions and actual wallet ledger identity before reporting is financially cleared.

WS-023 may format PR #569's source-backed nullable principal/fee fields independently and retain unknown labels. WS-023 must not remount the legacy source panel, reinterpret principal as wallet loss, or infer USD. No overlapping UI edits were made here.

## Validation and activation gates

- Resolver: 14 tests.
- Prepared SQL: 15 disposable database tests.
- Customer/source contract: 10 tests.
- Currency PR #569: 16 complete Commas API tests and 3 currency tests.

All passed with zero failures or skips. Tests are preparation evidence, not production or end-to-end certification.

Remaining gates: Commas confirms rollout and exact field paths for both event types; independently hash-check real scoped payloads; confirm whether old disputes receive fields through future updates or supported replay; integrate a trusted verifier and bounded atomic caller; certify concurrent PostgreSQL behavior and the customer read path; obtain WS-022 release approval. Retained legacy events without authoritative parent IDs remain unresolved.

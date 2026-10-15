# WS-001 internal follow-up

Status: draft / disabled. No production SQL, merge, release or deployment. WS-022 retains release authority and WS-023 retains UI ownership.

## Customer API integration

`getCustomerDetail` now invokes the prepared read adapter after the existing scoped person lookup. Its code default is false; no HTTP parameter or environment variable enables it. Disabled requests do not query new storage and expose an additive provider_disputes section marked disabled. Existing order/status/financial summaries are unchanged. An explicit internal test option allows integration checks; the router never passes it.

The prepared public read RPC is review SQL outside the migration directory, with no PUBLIC, anon, authenticated or service_role execution grants. It requires the authorized organization/person, exact identity audit, canonical order and all three matching tenant dimensions. It uses the existing customer order read model, bounded keyset pagination and independent PR #569 currency provenance. It returns no raw payload, buyer/contact data, TKID value, audit payload or financial loss. Customer adapter output always keeps wallet loss null. Missing TKID does not prevent linking to a verified person. This bounded reader leaves journeyId null; direct chronology placement still needs a separately verified journey/order relationship and WS-023 presentation work.

API tests cover disabled no-I/O, scoped RPC and redaction, invalid bounds/error handling, and person denial before RPC. Disposable database tests exercise the actual reader's scope, audit, currency, pagination and ACL predicates. PR #569 remains a schema/integration dependency; these preparation SQL files have not been applied to production.

## Source/sub-ID reporting contract

`buildPreparedSourceDisputeReport` defines an order-cohort incidence contract: [from,to) order dates, disputes observed through an explicitly reported cutoff, and separate affiliate, source, sub1, sub2, sub3, sub4 and sub5 dimensions. Every order and dispute belongs to the complete supplied tenant scope. Every populated attribution dimension requires source evidence and observed/exact authority. Unknown attribution remains a null bucket. Unverified dispute identity is diagnostic only, not assigned by customer/amount/time similarity.

The denominator is distinct orders in the cohort; the numerator is distinct affected orders, separately from dispute event count. A complete transport scan is insufficient when dispute identity remains unresolved: rates stay null. Order-cohort incidence is not a dispute-event-period rate, a mature lifetime rate, or a probability forecast. Unknown/outside-cohort diagnostics and cutoff are returned. The production adapter must verify complete pagination, coverage certificates, exact identity audits and dimension evidence rather than trusting client-supplied completeness/authority flags.

Principal and descriptive fees are separate currency-partitioned decimal aggregates; fee provenance cannot inherit principal currency. Unknown amounts suppress a total while retaining a named known subtotal and missing count. Currency partitions are never added together; dimensions are independent and must not be summed together. Wallet loss, refunds and recovery are not derived. No production reporting route or UI was activated. The legacy monetary analysis endpoint remains HOLD and must not be restored on the strength of these pure tests alone.

## Database validation boundary

Existing preparation tests remain 14 resolver, 15 atomic persistence and 10 customer/source tests. Fresh follow-up tests: 4 customer adapter, 3 customer database reader, 7 source report, 11 existing customer regressions and 7 repository migration-identity checks. Combined focused run: 71 PASS, zero failures/skips. Strict TypeScript checks on the new pure modules and syntax checks on the native scripts pass.

Repository migration-identity checks are not a full SQL chain replay. The real full-chain and simultaneous-session validations are BLOCKED in this workspace: only UID 0 is mapped, and native PostgreSQL initdb rejects root ownership. No disposable database service is running. PGlite results do not certify native concurrent sessions.

Two reproducible native harnesses are prepared:

- `scripts/test-commas-prepared-concurrency.mjs`: requires WS001_CONCURRENCY_DB_URL on loopback and WS001_CONCURRENCY_DISPOSABLE=1, plus a pinned pg client. Creates a separate random test database, verifies actual lock waits for duplicate delivery, lifecycle CAS and mapping replacement, and drops the database afterward. It has no fallback or silent skip. This minimal-schema race harness does not replace full-chain functional acceptance.
- `scripts/test-commas-prepared-full-chain.sh`: uses the existing authoritative migration harness, requires its local disposable URL/attestation plus WS001_CURRENCY_MIGRATION_FILE pointing to PR #569's reviewed 20261014034517 migration. It copies the migration tree into a temporary directory, replays the chain with the existing historical test fixture, then applies only the review SQL to that disposable database and checks disabled ACLs. The repository's migration directory is unchanged.

Native harnesses were syntax checked but could not be executed here. Before release, execute both on a normal disposable Supabase/PostgreSQL host, run full-chain functional fixtures and customer browser/API acceptance, validate real Commas payload fields/retained hashes, and obtain WS-022 approval. Existing disputes without authoritative IDs remain unresolved; Commas replay support is still unconfirmed.

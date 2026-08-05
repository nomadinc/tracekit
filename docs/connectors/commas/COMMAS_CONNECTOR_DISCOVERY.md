# Commas Connector Discovery

**Phase:** 1 — Discovery, Authentication, and Read-Only API Client

**Status:** Phase 1 complete; approved for closure

**Reviewed sources:** supplied Commas API Reference screenshots dated 2026-07-22 and 2026-08-03, the current [Commas API Reference](https://commasdocs.com/), `products-2026-07-30.xlsx`, and TraceKit's Commerce Provider Framework.

## 1. Provider overview

Commas currently serves its public API from the FanBasis domain. Products are also called services in parts of the API. The first TraceKit client is deliberately read-only and covers only endpoints evidenced by the supplied/current documentation.

The Phase 1 boundary is:

```text
local server-only credentials
  -> typed Commas read client
  -> bounded provider response
  -> redacted schema discovery summary
```

It does not write provider data to TraceKit, create a persistent connection, run an import job, normalize a Customer/Order/Financial Event, or serve a production Workspace.

## 2. Authentication

Every documented request uses:

```http
x-api-key: <server-only credential>
```

No username/password, bearer token, or separate merchant/account identifier is documented for these endpoints. The API key scopes the creator account. Whether keys can be restricted to read-only operations is not documented and must be confirmed with Commas before Production Beta.

Authorized keys for the small and main accounts succeeded against Customers and Transactions. This proves live authentication for both accounts. Products returned HTTP 500 for both keys rather than 401 or 403, so Products is treated as a provider/account endpoint defect rather than an authentication failure.

The client constructs only `GET` requests and does not expose mutation methods. This application restriction does not prove the upstream key itself is read-only.

## 3. Environment and base URL

Verified production origin:

```text
https://www.fanbasis.com
```

All verified resources use `/public-api/`. No staging/sandbox origin is evidenced by the supplied material. Production is therefore the only named provider environment. Custom origins require an explicit client opt-in and exist only for local synthetic tests; non-HTTPS custom origins are limited to localhost.

Open environment questions:

- Is there a Commas sandbox or staging tenant?
- Does IP allowlisting exist?
- Are API keys account-wide, creator-specific, or capability-scoped?
- Does each Commas account require a distinct API key? The current evidence implies yes but does not state it.

## 4. Credential boundary

Phase 1 supports local server-only configuration:

```text
COMMAS_API_KEY_SMALL_ACCOUNT
COMMAS_API_KEY_MAIN_ACCOUNT
COMMAS_BASE_URL=https://www.fanbasis.com
```

The repository includes placeholders in `api/.dev.vars.example`; real values belong in ignored `api/.dev.vars` or another approved server secret store. Every discovery invocation requires exactly one explicit `--account=small|main`. Missing, invalid, duplicated, or unconfigured selections fail closed; the runner never defaults to the main account. The client never serializes either key. Discovery output reports account provenance, field shapes, and redacted structures only.

TraceKit already has AES-GCM server-side credential encryption for `integrations_credentials`, but Commas is not persisted there in Phase 1. Persistent Organization-bound connection storage and rotation are Phase 2 work.

## 5. Verified endpoints

| Resource | Method | Endpoint | Client method | Status |
|---|---|---|---|---|
| Products | GET | `/public-api/products` | `listProducts` | Documented; HTTP 500 observed for both tested accounts |
| Product | — | No direct Product detail GET evidenced | — | Unsupported/unverified |
| Customers | GET | `/public-api/customers` | `listCustomers` | Live HTTP 200 verified |
| Customer | — | No direct Customer detail GET evidenced | — | Unsupported/unverified |
| Transactions | GET | `/public-api/checkout-sessions/transactions` | `listTransactions` | Live HTTP 200 verified |
| Transaction | GET | `/public-api/transactions/:transactionId` | `getTransaction` | Live HTTP 200 verified on main account; no useful fields beyond list response |
| Refunds | — | No read-only list/detail endpoint evidenced | — | Nested observations only |
| Disputes | — | No read-only list/detail endpoint found | — | Obvious collection probes returned 404; webhook lifecycle documented |

The reference also documents product/checkout-session transaction lists and `/public-api/transactions/all`. They are not needed for the minimum client. The latter has a documented issue where nested refund amounts may be zeroed, so TraceKit does not use it as the Phase 1 source.

Documented write endpoints for product creation, customer charging, subscription changes, refund creation, and checkout-session mutation are intentionally absent.

## 6. Products schema

Verified list fields:

| Field | Observation |
|---|---|
| `id` | Public Product hash ID; immutable matching candidate |
| `title` | Descriptive product title |
| `internal_name` | Nullable descriptive/internal name |
| `description` | Nullable descriptive text |
| `price` | Decimal-dollar response value; exact JSON scalar type requires live verification |
| `payment_link` | Ready-to-use provider URL; retained only behind raw/provider boundaries |

The Product list excludes Community and Courses products. The list response does not evidence currency, status, created/updated timestamps, product type, recurring terms, or funnel/payment-link metadata beyond the link itself. The workbook contains additional UI/export columns; those are not treated as API fields.

A direct `getProduct` method is not implemented because no Product detail GET is documented. Product-specific transactions and subscriptions are separate collection endpoints, not Product detail.

For both tested accounts, `GET /public-api/products` consistently returns HTTP 500 while each identical key succeeds for Customers and Transactions. Phase 1 does not block on this provider limitation. Transaction responses embed Product and Service records, providing the initial source for observing sold products. This cannot prove catalog completeness and does not replace a repaired Products endpoint.

## 7. Customers schema

Verified list behavior and fields:

- `search` accepts a name, email, or phone query.
- `id`, `name`, `email`, `phone`, `country_code`, `total_transactions`, `total_spent`, and `last_transaction_date` were observed.

Saved payment-method and direct-charge endpoints exist but are outside this read-only client. No payment-method metadata is requested or sampled. There is no documented direct Customer detail GET, so `getCustomer` is not implemented.

Customer data is sensitive. The discovery runner replaces names, email, phone, Customer fields, payment-method fields, and identifiers with type/redaction markers.

The latest bounded runs reported 45 Customers for the small account and 50,622 for the main account.

## 8. Transactions schema

Verified transaction detail/list fields include:

- row `id` (the detail example is numeric, while the detail path takes a public hash ID);
- `transaction_date`;
- `fan` with public ID, name, email, phone, and country code;
- `servicePayment` with public ID, payment type, fund-release date, and release state;
- `service` and `product` objects with Product hash ID and Product descriptive fields;
- `refunds` array;
- optional `customFields` entries containing label, type, and value;
- `fee_amount`, `net_amount`, and `amount` in decimal dollars.

The public order ID used by webhook events (`ORD-…`) is distinct from the numeric row ID and transaction hash used by the detail endpoint. These identities must remain distinct until Phase 2 source mappings are defined.

### Transaction list/detail distinction

The Transaction list is operational for both accounts. The documented detail endpoint works on the main account when called with the returned Transaction ID. The bounded comparison found no useful detail-only fields; notably, the list response contains `amount` while the detail response does not. The list remains the authoritative Phase 2 discovery source, and the detail request remains optional enrichment rather than a required sync dependency.

Not verified from the supplied read response: quantities/line arrays, subtotal, discount, tax, shipping charge, currency, general status, updated timestamp, processor/payment method, funnel ID, subscription/rebill flag, parent transaction, or explicit upsell/order-bump metadata. The client does not invent these fields.

The latest bounded runs reported 47 Transactions for the small account and 73,018 for the main account. Rows contain embedded `fan`, `service`, `product`, `servicePayment`, and `refunds`, plus `amount`, `fee_amount`, and `net_amount`. In the bounded samples, Product and Service were structurally and materially identical. `servicePayment` exposed `id`, `payment_type`, `fund_release_on`, and `fund_released`.

## 9. Refunds schema

Refunds are exposed as a nested `refunds` array on Transaction responses. No Refund was found in the bounded discovery scans, so a live nested Refund item schema was not observed. The documentation's refund page describes a **write** operation and its synchronous response, not a read-only list or detail resource.

Consequently:

- `listRefunds` and `getRefund` are not implemented;
- no mutation is used as a discovery mechanism;
- amount, fee, proportional fee, creator deduction, partial/full status, multiple-refund behavior, and update timestamps remain unverified for read ingestion;
- `/public-api/transactions/all` is avoided because its nested refund amounts have a documented zero-value issue.

Phase 2 may normalize Refunds only when embedded rows are observed and validated. No separate polling endpoint was proven, and Refunds must never be treated as Chargebacks.

## 10. Disputes schema

The reference documents dispute lifecycle statuses and `dispute.created` / `dispute.updated` webhook events.

No read-only Dispute list/detail endpoint is documented or operational. Focused GET probes to `/public-api/disputes?page=1&per_page=2` and `/public-api/chargebacks?page=1&per_page=2` both returned HTTP 404. `listDisputes` and `getDispute` are therefore not implemented. The illustrative webhook is not treated as a polled response schema, and no webhook receiver is added in Phase 1.

Documented webhook paths include `id`, `type`, `created_at`, `data.id`, `data.dispute_id`, `data.amount`, `data.dispute_fee`, `data.total_amount`, `data.status`, `data.reason`, `data.payment_intent_id`, `data.due_by`, `data.created_at`, `data.updated_at`, `data.organization_id`, `data.buyer`, `data.item`, `data.customFields`, and `data.event_type`. Forward ingestion therefore requires signed webhooks. Historical recovery requires a provider export, support-assisted backfill, webhook replay, or another supported mechanism.

## 11. Pagination

Verified request parameters for Products, Customers, and Transactions:

- `page`, starting at 1;
- `per_page`, maximum 100.

The documentation shows multiple response-envelope forms: Laravel-style pagination fields, resource-specific `pagination`, and an example using `meta.has_next_page`. The client accepts only these observed families, validates positive page numbers, enforces the maximum page size, requires forward progress, and bounds iteration by `maxPages`.

The live Customers and Transactions envelopes confirm `current_page`, `total_pages`, `total_items`, and `has_more`; `per_page` is returned as a string and normalized safely. Bounded traversal of pages 1 and 2 produced distinct IDs with no overlap. The discovery runner reports counts without emitting IDs. Stable ordering under concurrent writes remains unverified.

## 12. Incremental filters

| Resource | Documented filters | Created filter | Updated filter | Sorting/cursor |
|---|---|---|---|---|
| Products | `page`, `per_page` | No | No | Page only |
| Customers | `search`, `page`, `per_page` | No | No | Page only |
| Transactions | `product_id`, `customer_id`, `page`, `per_page` | No | No | Page only |
| Refunds | No read endpoint | Unverified | Unverified | Unverified |
| Disputes | No read endpoint | Unverified | Unverified | Unverified |

No reliable incremental field is documented for the verified list resources. The strongest safe future strategy is idempotent source-ID upserts, overlapping bounded page/date windows where a supported date filter is later proven, and periodic reconciliation scans. A full backfill/poller is intentionally not implemented in Phase 1.

## 13. Rate limits

The reference documents these response headers for checkout-session and Customer groups:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` on HTTP 429

It also states that thresholds may vary by account/endpoint, while a changelog note says limits increased to 100 requests/minute across all endpoints. The tested accounts returned a limit of 10,000. TraceKit does not hard-code that account-specific value; the client captures limit, remaining, numeric reset timestamp, and `Retry-After`. ISO-8601 timestamps and numeric reset timestamps remain visible in discovery diagnostics while actual phone fields and strongly validated phone-like text are redacted.

Account-wide versus endpoint-specific enforcement and burst behavior remain unresolved.

## 14. Retry behavior

Client defaults:

| Setting | Phase 1 default |
|---|---|
| Request timeout | 15 seconds |
| Maximum attempts | 3 |
| Retry statuses | 429, 500, 502, 503, 504 |
| Backoff | Exponential with jitter |
| Backoff base/cap | 250 ms / 5 seconds |
| `Retry-After` | Honored, bounded by cap |

Network failures and timeouts are retryable and bounded. Authentication, authorization, not-found, validation, and other ordinary 4xx failures are not retried. Pagination callers receive pages; future ingestion must checkpoint only after idempotent persistence so a retried page cannot duplicate downstream records.

## 15. Error behavior

Typed errors:

- `CommasAuthenticationError` — 401;
- `CommasAuthorizationError` — 403;
- `CommasNotFoundError` — 404;
- `CommasRateLimitError` — 429;
- `CommasValidationError` — 400/422 or unsupported successful response shape;
- `CommasTransientError` — timeout/network/5xx;
- `CommasConfigurationError` — invalid local configuration.

Errors preserve safe status, resource, retryability, internal correlation ID, provider request ID, provider code, and retry delay. They never serialize the API key, raw response body, error payload, email, authentication header, or token-like values. The documented 429 envelope differs from standard errors, so classification is driven by HTTP status rather than a `status` field.

## 16. Request IDs and observability

Every request has a TraceKit-local correlation ID. If the response provides `request_id`, `x-request-id`, or `request-id`, it is captured after redaction. Discovery reports presence and safe values only.

Safe discovery output includes resource, item count, top-level/data keys, pagination, rate-limit headers, field names, observed JSON types/nullability, redacted example structure, and request correlation. It omits raw rows and response bodies.

## 17. Sensitive-data handling

Single-resource discovery requests at most two records. Bounded discovery requests exactly two two-record pages for Customers and Transactions, then may inspect two-record Transaction pages only until the first Refund or an explicit page cap. It does not automatically save output. Sensitive keys and values are redacted; Customer and Transaction identifiers are used only in memory for uniqueness/detail calls and are never emitted.

No production payload, Customer row, payment method, card detail, credential, or API response fixture is stored in the repository. Any manual diagnostic output must remain temporary, ignored, access-restricted, and deleted after schema review.

## 18. Product-map matching

The supplied workbook contains 16 `GR` products. The comparison utility matches API Products to workbook rows by immutable Product ID, never row order. It then compares title, internal name, and price and proposes only the reviewed `GR` grammar:

- `GR` -> Push Button Systems / Front End;
- `GR -> OB` -> Push Button Systems / Order Bump;
- `GR -> OTO<n>` -> Push Button Systems / Upsell step `<n>`;
- `DS1` / `DS2` -> proposed discount variants.

ID mismatch, descriptive mismatch, or unknown grammar produces a review-required reason. No CashMyButton mapping or funnel-version relationship is inferred. Direct workbook-to-catalog comparison remains blocked because the Products endpoint returns HTTP 500; embedded Product observations are not assumed to represent the complete catalog.

## 19. Digital-product implications

The first Business Contexts sell digital information products. No physical shipping, packaging, carrier, or tracking fields are expected for the first slice. The Transaction schema has not proven commercial shipping fields; absence must be represented as unavailable/not applicable, not silently converted into financial zero.

## 20. Known gaps and provider limitations

- Live API-key authentication is verified for Customers and Transactions on both accounts; exact provider account identity metadata remains unverified.
- API-key read-only scopes, IP allowlisting, account mapping, and sandbox behavior are undocumented.
- Direct Product and Customer detail GET endpoints are not evidenced.
- Transaction list and main-account detail are operational, but detail adds no useful fields beyond list and omits list `amount`.
- Refunds are embedded only; no live Refund row or separate read endpoint was proven.
- Dispute and Chargeback collection probes returned 404. Forward ingestion is webhook-dependent and historical recovery remains a provider-support gap.
- Stable ordering under concurrent writes and incremental timestamps are unknown.
- A 10,000 account limit is observed, but its window, reset semantics, and account-versus-endpoint scope remain unresolved.
- Direct Product-map API matching is blocked by the account-specific Products HTTP 500; transaction-embedded Product sampling cannot establish catalog completeness.
- No attribution identifiers were observed in 100 bounded main-account Transactions. Commas is a commerce/payment source, not an attribution source, unless a future supported surface proves otherwise.
- No persistent Commas connection, Sync Run, raw evidence, source mapping, normalization, or repository activation exists.

### External identifier discovery

Before normalization, the local discovery runner provides a two-page, schema-only recursive scan:

```bash
npm run discover:commas -- identifiers --account=small
npm run discover:commas -- identifiers --account=main
```

It matches attribution, checkout, session, click, UTM, affiliate, campaign, metadata, and related keys case-insensitively while ignoring separators. It traverses the top-level Transaction and every nested object/array, including `fan`, `product`, `service`, `servicePayment`, Refund entries, metadata, and custom-field structures. JSON-looking string fields are parsed only when no larger than 4 KiB; traversal is capped at 12 levels and 10,000 nodes. The live scan defaults to five pages of 20 Transactions, has a hard ten-page cap, and stops early only when both an external-attribution field and a strong dispute/chargeback/reversal field have been observed. Output contains field paths and empty/null state only. Dynamic path segments resembling email, phone, or URL values are redacted.

The bounded main-account scan of 100 Transactions observed none of the requested Everflow, affiliate, sub-ID, UTM, click, campaign, session, external-ID, metadata, custom-field, tracking, or attribution paths. The only checkout-reference paths observed were `transaction.product.payment_link` and `transaction.service.payment_link`. A missing field remains “not observed in this bounded sample,” not proof that Commas can never provide it in another provider surface.

### Dispute and chargeback discovery

No read-only Dispute or Chargeback list/detail endpoint appears in the current Commas API reference or API playground, and none of the scanned Transaction structures exposed a dispute, chargeback, or reversal surface. Phase 2 must treat Disputes as webhook/provider-support dependent rather than inventing a polling source. The documented dispute webhooks still require a separate signature, replay, retention, and reconciliation design.

The documented `dispute.created` and `dispute.updated` envelope exposes structural paths including `id`, `type`, `created_at`, `data.id`, `data.dispute_id`, `data.amount`, `data.dispute_fee`, `data.total_amount`, `data.status`, `data.reason`, `data.payment_intent_id`, `data.due_by`, `data.created_at`, `data.updated_at`, `data.organization_id`, `data.buyer`, `data.item`, `data.customFields`, and `data.event_type`. These are documentation-derived webhook paths, not observations from the Transaction polling response, and they must not be conflated with account-specific live-read findings.

### Small account versus Main account

Findings remain account-labeled and are never merged into a single implied capability surface.

| Finding | Small account | Main account |
|---|---|---|
| Authentication | Verified: Customers and Transactions HTTP 200 | Verified: Customers, Transactions, and Transaction detail operational |
| Customer count | 45 | 50,622 |
| Transaction count | 47 | 73,018 |
| Observed Products | Embedded Product/Service records available | Embedded Product/Service records available; bounded Product and Service objects were identical |
| Attribution identifiers | None established | None of the requested attribution paths observed in 100 bounded Transactions |
| Checkout reference | Product/Service `payment_link` | Product/Service `payment_link`; no other checkout-reference path observed |
| Chargeback/dispute surfaces | No Transaction surface observed | No Transaction surface observed; both collection probes returned 404 |
| Products endpoint | Account-specific HTTP 500 | Account-specific HTTP 500 |
| Pagination | Page-number pagination and distinct two-page traversal verified | Page-number pagination and distinct two-page traversal verified |
| Rate limit | 10,000 observed | 10,000 observed |
| Caveat | Small sample may not contain attribution or disputes | Absence from the bounded Transaction sample does not establish absence from webhooks, exports, or another supported provider surface |

Findings remain account-specific. Neither account is silently selected, and the runner never treats the main account as a default.

### Focused read-only dispute collection probe

The only allowlisted undocumented collection candidates are:

```text
GET /public-api/disputes?page=1&per_page=2
GET /public-api/chargebacks?page=1&per_page=2
```

Run them through the schema-only probe:

```bash
npm run discover:commas -- disputes --account=main
```

The probe cannot construct any other path or HTTP method. Both candidates returned HTTP 404. The Phase 2 recommendation is signed `dispute.created` and `dispute.updated` webhooks for forward ingestion plus **C — provider support export required** (or another supported replay/backfill mechanism) for historical recovery. Webhook-only ingestion cannot establish historical completeness.

## 21. Phase 2 recommendations

Phase 2 should:

1. Persist an Organization-bound encrypted connection only through the approved credential boundary, retaining explicit account provenance.
2. Backfill Customers and Transactions with bounded, idempotent page traversal, durable checkpoints, overlap/replay safety, and reconciliation because no incremental timestamp filter was proven.
3. Treat transaction-embedded Product/Service records as the initial observed-product source while escalating the Products 500; do not claim catalog completeness.
4. Review immutable Product-ID mappings before creating canonical Offer/Step/Variant mappings.
5. Normalize embedded Refund rows only after a real row shape is validated; never infer Chargebacks from Refunds.
6. Ingest forward Disputes through verified signed webhooks and obtain a provider-supported export/replay/backfill for history.
7. Source attribution from a dedicated attribution provider rather than Commas unless a future supported Commas surface proves otherwise.
8. Add durable Sync Runs, raw Evidence, source mappings, normalization versions, and reconciliation states.
9. Keep live repositories and Workspaces feature-disabled until authorization, reconciliation, and data-quality acceptance pass.

### Manual discovery commands

After adding local values to ignored `api/.dev.vars` and confirming account authorization:

```bash
cd api
npm run discover:commas -- products --account=small
npm run discover:commas -- customers --account=small
npm run discover:commas -- transactions --account=small
npm run discover:commas -- bounded --account=main
npm run discover:commas -- identifiers --account=main
npm run discover:commas -- disputes --account=main
```

For a failed discovery request only, enable the opt-in transport trace:

```bash
COMMAS_DISCOVERY_DEBUG=true npm run discover:commas -- products --account=small
```

The trace distinguishes an upstream HTTP response, a fetch/network failure, and a JSON parse failure. It records the GET path, safe query parameters, status, redacted response headers, provider request ID, and a redacted response preview capped at 2 KiB. It never records the API key or request authentication headers; sensitive response fields and values are removed before output. This flag is consumed only by the local discovery CLI and does not change normal client error serialization.

### Products HTTP 500 triage

Bounded Products discovery received upstream HTTP 500 for both tested accounts while the same keys successfully authenticated to Customers and Transactions. Fetch failures and JSON parse failures are classified separately, so this is not a transport or authentication inference. The verified origin, `x-api-key` header, and plural `/public-api/products` path match the provider documentation. Escalate the provider failure with safe request metadata; do not make Products availability a Phase 2 backfill prerequisite while transaction-embedded Product observations remain available.

Single-resource modes use page 1 and `per_page=2`. `bounded` performs exactly two Customer pages and two Transaction pages, reports cross-page ID uniqueness without printing IDs, inspects nested field names/types, aggregates transaction-embedded Products without Customer data, and compares Product and Service objects. It then scans Transaction pages only until a Refund is found or `COMMAS_REFUND_SCAN_PAGE_CAP` is reached (default 10, hard maximum 20). Finally, it attempts one optional detail lookup using the top-level first-listed Transaction ID. A provider 500, if encountered on another account, is retained as `transaction_detail.status = unavailable_provider_500` and does not erase or abort successful list findings. It emits no raw payloads and performs no mutation or persistence.

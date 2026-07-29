# Chargeback Ingestion Pipeline Audit

Status: design proposal only. No ingestion implementation is included here.

## Objective

TraceKit's Chargeback Analysis page now reads normalized chargeback ledger rows correctly, but production currently has no matched chargeback events for the selected window. The next step is to ingest chargebacks/disputes from connected platforms as append-only financial events, mirroring the validated WowBoost refund architecture.

The core rule is:

`platform_orders` remains the mutable latest order snapshot, while sales, refunds, chargebacks, dispute reversals, reserve activity, adjustments, and fees become append-only events in the canonical financial-event ledger.

## Accounting Principles

### Refunds and Chargebacks Are Independent

Refunds and chargebacks are separate financial events. They must never be automatically collapsed, netted, or deduplicated against each other.

The same order can legitimately have both:

- A customer refund.
- A later chargeback or dispute debit.

That creates a real double debit unless the processor later reports a reversal/recovery. TraceKit should preserve both events in totals and expose the issue diagnostically rather than hiding it in ingestion.

A diagnostic-only flag should identify possible duplicate economic loss:

`possible_refund_chargeback_double_debit`

Default diagnostic window: flag refund and chargeback principal events on the same order or processor transaction when their absolute principal amounts are materially similar and their event timestamps are within 7 calendar days. The 7-day window is the workspace default and should be configurable per workspace. It must not be hard-coded into connector ingestion logic.

### Canonical Financial Event Types

The ingestion model should support these independent append-only ledger event types:

| Event type | Normalized sign | Meaning |
| --- | --- | --- |
| `sale` | Positive | Original revenue or captured sale. |
| `refund` | Negative | Refunded principal. Partial refunds are ordinary `refund` events whose amount is less than the original sale. |
| `chargeback` | Negative | Disputed principal debit. |
| `chargeback_fee` | Negative | Dispute or chargeback fee charged by processor/gateway. |
| `chargeback_reversal` | Positive | Won dispute, reinstated funds, or principal recovery. |
| `chargeback_fee_reversal` | Positive | Reversed or reimbursed chargeback fee. |
| `processor_fee` | Negative | Ordinary payment processing fee unrelated to dispute handling. |
| `reserve_hold` | Negative cash-flow / cash-restricted | Funds held in reserve. This is a cash-flow event, not a revenue event. |
| `reserve_release` | Positive cash-flow | Release of previously held reserve funds. This is a cash-flow event, not a revenue event. |
| `adjustment` | Signed per source direction | Processor or gateway adjustment that is not better represented by another event type. |

Each connector must preserve the upstream source amount and source direction for audit. TraceKit should also expose a normalized signed amount for analysis and reporting.

### Fees and Gateway Costs

Chargeback fees are not the same as ordinary processor fees.

Reporting may roll fee categories into broader operating cost totals, but ingestion must preserve separate event classes for:

- Ordinary payment processing fees.
- Chargeback/dispute fees.
- Gateway fees.
- Reserve holds and releases.
- Processor adjustments.

This distinction lets Chargeback Analysis explain dispute principal separately from the operating cost impact of dispute fees.

Reserve holds and releases should appear in cash-flow or cash-availability reporting. They should not be treated as revenue, refunds, chargeback principal, or ordinary operating expense unless a future reporting policy explicitly asks for a cash-basis view.

### Chargeback Lifecycle

A single dispute can generate multiple append-only events:

1. `chargeback` principal debit.
2. `chargeback_fee` fee debit.
3. `chargeback_reversal` principal recovery if the merchant wins or funds are reinstated.
4. `chargeback_fee_reversal` fee recovery if the processor reverses the fee.

Original chargeback and fee events must never be overwritten by later reversal events. Chargeback reversals and chargeback fee reversals must always be appended as new ledger events. Reversals reference the original dispute, chargeback, transaction, or parent event wherever the processor provides those identifiers.

### Diagnostic Flags

The pipeline should emit bounded, queryable diagnostics for these conditions:

- `possible_refund_chargeback_double_debit`
- `chargeback_without_matching_sale`
- `chargeback_fee_without_chargeback`
- `reversal_without_original_chargeback`
- `duplicate_source_event`
- `multiple_valid_chargebacks_same_order`

These flags are evidence for operations and reconciliation. They should not mutate, collapse, or suppress the underlying ledger events.

## Current TraceKit Support

### Visible integration catalog

The current UI catalog includes:

- Shopify
- PayPal
- Manual Postback
- Konnektive CRM, backed by CheckoutChamp API routes
- WowBoost
- WowPay
- Everflow

There is also a Gateway Account Wizard for NMI Classic and PayDiverse Classic Query API accounts. Stripe, FanBasis, and Commas are referenced by identity identifiers or external docs, but they are not currently first-class catalog connectors in this branch.

### Repository-discoverable processor accounts

The repository currently exposes these non-secret account identifiers and labels:

| Connector family | Repository-visible account or connector identifier | Notes |
| --- | --- | --- |
| PayPal | `paypal` | The repo defines a single logical PayPal connector. Concrete merchant account IDs are discovered at runtime from PayPal credentials/API metadata. `stablePaypalConnectorId` can produce `paypal:{merchant_account_id}` or `paypal:client_{hash}` when runtime metadata is available. No concrete PayPal merchant account ID is present in repository configuration. |
| NMI Classic | `nmi:lifeheater14090` | Listed in `/v1/platforms`, used by legacy NMI status/import/debug routes, and used as the Gateway Wizard default. |
| NMI Classic | `nmi:tpaul9204` | Listed in `/v1/platforms`. No secrets are present in the repository. |
| NMI Classic | `nmi:*` | The Gateway Classic listing route can discover saved credentials at runtime for any `nmi:%` platform key. These cannot be enumerated from repository configuration alone. |
| PayDiverse Classic | `paydiverse` | Supported by the Gateway Classic wizard/listing pattern. |

Phase 1 chargeback ingestion should enumerate every configured PayPal account and every configured NMI account from saved runtime credentials, not only the static examples above. Each account needs an account-specific cursor and each normalized event needs a processor account identifier.

### Existing chargeback-capable code

| Connector | Current TraceKit state | Existing chargeback code path | Gap |
| --- | --- | --- | --- |
| PayPal | Transaction Search import is live. Dispute capability is checked during connection. | `buildPaypalLedgerEventsFromRecord()` classifies explicit chargeback/dispute transaction records. `buildPaypalLedgerEventsFromDispute()` can normalize explicit Customer Disputes API records. | No dedicated runtime path currently polls `/v1/customer/disputes` and inserts those explicit dispute events for every configured PayPal account. |
| Shopify | Order/refund import is live. | `buildShopifyLedgerEventsFromOrder()` can consume an `order.disputes` array and create `chargeback` events. | The current `SHOPIFY_ORDERS_QUERY` does not request disputes, so the chargeback branch is not populated by the active import. |
| CheckoutChamp/Konnektive | Order import is live. | `buildCheckoutChampLedgerEvents()` creates `chargeback` from `status === "CHARGEBACK"` and `chargeback_fee` from `chargeback_fee`. | Current source is order status/snapshot based. Transaction-level chargeback polling is not implemented. |
| WowBoost | Order snapshot import and receipt-level refund backfill are live. | Snapshot rows preserve `chargeback_fee` when present. Chargeback analysis has a legacy platform_orders fallback for `CHARGEBACK` status. | No receipt/dispute-level normalized chargeback principal ingestion exists yet. |
| WowPay | Basic route alias and order import exist. | Shares WowSuite refund extraction, snapshot status, and fee fields. | No explicit chargeback/dispute ingestion path exists. Earlier shared-progress WowPay support was intentionally removed. |
| Manual Postback | Generic append-only ledger ingest exists. | `/v1/postbacks/manual` and other `/v1/postbacks/:platform` paths detect `chargeback`, `dispute`, `chargeback_fee`, `reversal`, and `adjustment`. | No idempotency key is enforced beyond whatever `transaction_id` the sender provides. |
| NMI/PayDiverse Classic | Hidden gateway wizard and one-page import exist. | Classic query imports snapshots only. NMI docs expose chargeback/return action data. | No normalized chargeback ledger insertion is implemented for gateway action rows, and current legacy NMI routes target only `nmi:lifeheater14090`. |
| Everflow | Tracking connector. | No chargeback financial-event source. | Everflow can help attribution/payout context, but should not be treated as chargeback source of truth. |
| Stripe | Not first-class in current catalog. | Identity identifiers include `stripe_customer_id`. | A Stripe connector would be new work. |
| FanBasis/Commas | Not first-class in current catalog. | Identity identifiers include `fanbasis_customer_id`; no connector routes found. | A Commas/FanBasis webhook connector would be new work. |

## Upstream Platform Audit

### PayPal

PayPal exposes disputes through the Customer Disputes API:

- Polling: `GET /v1/customer/disputes`
- Detail: `GET /v1/customer/disputes/{dispute_id}`
- Webhooks: `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`
- Useful identifiers: `dispute_id`, `disputed_transaction_id`, `seller_transaction_id`, `invoice_id`, `custom_field`, transaction event code, PayPal account ID
- Fees: Transaction Search exposes fee amounts on balance-affecting records. Dispute objects may include fee-like fields depending on payload, but fee extraction should remain separate from principal when present.

TraceKit must enumerate every configured PayPal account, persist an account-specific cursor, and stamp every normalized PayPal dispute event with the PayPal processor account identifier. Reconciliation should be independent per account because transaction IDs and dispute IDs are only authoritative in the context of the account that reported them.

Current recommendation: implement PayPal dispute polling runtime first because credentials and capability checks already exist. Webhooks can be added later after webhook ID storage and signature verification are in place.

### NMI / PayDiverse Classic

NMI Classic Query API exposes:

- Polling: `POST /api/query.php`
- Filters: `action_type=return` for ACH returns and credit card chargebacks
- Date fields: `start_date` / `end_date` are modified-date based
- Useful identifiers: `transaction_id`, `order_id`, action type, action date, amount, response fields
- Webhooks: NMI supports chargeback webhooks when the processor supports chargeback reporting

TraceKit must enumerate every saved `nmi:%` credential and the `paydiverse` credential independently. Each account needs its own cursor, status, and diagnostics. Every event must include the platform key, processor account identifier, and source transaction/action identifiers.

Current TraceKit imports these gateway rows as mutable `platform_orders` snapshots only. It does not yet append chargeback ledger events from action rows.

Current recommendation: add a gateway financial-event extractor that scans every `<action>` entry, not just the primary sale action, and emits:

- `chargeback` for card chargeback/return principal rows.
- `chargeback_fee` for dispute fee rows when the account exposes them separately.
- `chargeback_reversal` for won/recovered return rows.
- `chargeback_fee_reversal` when fee reversal rows are explicitly reported.
- `processor_fee`, `reserve_hold`, `reserve_release`, or `adjustment` only when the source action type is specific enough to support that classification.

### Shopify

Shopify exposes Shopify Payments disputes:

- Polling: REST Admin `GET /admin/api/{version}/shopify_payments/disputes.json`
- Detail: REST Admin `GET /admin/api/{version}/shopify_payments/disputes/{dispute_id}.json`
- GraphQL: `dispute(id: ID!)` returns `ShopifyPaymentsDispute`
- Webhook: `disputes/create` is available for Shopify Payments dispute creation
- Useful identifiers: dispute ID, order ID, dispute type, status, amount, currency, reason, `initiated_at`, `finalized_on`
- Fees: Shopify help docs describe chargeback fees, but the dispute resource itself should not be assumed to carry a separate fee row. Fee ingestion needs payout/balance transaction confirmation before mapping to `chargeback_fee`.

Current recommendation: add a dedicated Shopify dispute polling task rather than trying to bolt disputes into the existing order query. This keeps chargeback event timestamps based on dispute initiation/update time instead of order date.

### CheckoutChamp / Konnektive

CheckoutChamp documents transaction-level chargeback fields:

- Polling: `POST /transactions/query/`
- Filters: `dateRangeType=chargebackDate`, `isChargedback`, date range, transaction IDs
- Update endpoint: `POST /transactions/update` supports `markChargeback`, `revertChargeback`, `chargebackAmount`, `chargebackDate`, `chargebackReasonCode`
- Useful identifiers: `transactionId`, `parentTxnId`, `merchantTxnId`, `orderId`, `clientOrderId`, `chargebackDate`, `chargebackAmount`, `chargebackReasonCode`
- Fees: Current TraceKit order import reads `chargebackFee` / `chargeback_fee` when present. The transaction query docs expose chargeback amount/date/reason; fee availability should be confirmed from real transaction/query payloads or merchant reports.

Current recommendation: prefer `transactions/query` with `dateRangeType=chargebackDate` and `isChargedback=1` for principal chargebacks. Keep current order-status mapping as compatibility only.

### WowBoost

Current TraceKit uses authenticated WowSuite/WowBoost flows:

- Export: `GET /order/export/{page}/{pageSize}` followed by CSV download
- JSON order pages: `GET /order/{page}/{pageSize}`
- Order detail: `GET /order/{orderId}`

Confirmed refund repair established that:

- The export can return account history even when date filters are supplied.
- Receipt/refund timestamps can be in range even when the order date is older.
- Receipt events must be extracted independently from mutable order snapshots.

Known chargeback fields in TraceKit:

- CSV snapshot mapping reads `Chargeback Fee`
- JSON snapshot mapping reads `chargebackFee` / `chargeback_fee`
- Status can be normalized to `CHARGEBACK`

Open upstream question:

- Whether WowBoost receipts include a chargeback/dispute status/type and chargeback principal amount, analogous to refund receipt rows.

Current recommendation: inspect JSON `receipts[]` and export receipt rows for chargeback/dispute statuses before implementation. If present, extend the receipt-event extractor from refund-only to financial-adjustment events. Continue keeping order snapshots and receipt events separate so a later non-chargeback snapshot cannot erase historical chargeback evidence.

### WowPay

WowPay currently shares WowSuite authentication and JSON order import shape:

- JSON order pages: `/order/{page}/{pageSize}`
- Snapshot mapping supports order/receipt status and `chargebackFee`
- Refund extraction is shared with WowBoost

Current recommendation: do not add WowPay to shared runtime behavior without explicit approval. If chargeback ingestion is needed, treat it as a gateway-specific WowSuite financial-event source and keep aliasing compatible with existing WowPay routes.

### Stripe

Stripe exposes chargebacks through Disputes:

- Polling: `GET /v1/disputes`
- Detail: `GET /v1/disputes/{id}`
- Webhooks: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`
- Useful identifiers: dispute ID, charge ID, payment intent via charge expansion, balance transaction IDs, metadata order IDs
- Fees: dispute balance transactions include `fee` and `fee_details`; Stripe also documents countered fees separately.

Current recommendation: Stripe is not a current first-class TraceKit connector. When added, use webhooks for freshness plus polling/backfill for repair.

### Commas / FanBasis

The public Commas docs expose dispute webhooks:

- Webhooks: `dispute.created`, `dispute.updated`
- Useful identifiers: webhook event ID, `data.dispute_id`, `data.payment_id`, amount, currency, status, created/respond-by dates
- Fees: docs state lost disputes debit the disputed amount plus any chargeback fee, but a separate fee field should be verified from live webhook payloads before mapping.

Current recommendation: no TraceKit connector exists yet. Implement as a new webhook-first connector only after source authentication/signature requirements are confirmed.

## Recommended Unified Pipeline

### 1. Normalize to financial adjustment events

Create a shared internal event shape before writing the ledger:

```ts
type NormalizedFinancialAdjustmentEvent = {
  workspace_id: string;
  platform: string;
  connector_id: string;
  processor_account_id?: string | null;
  ledger_type:
    | "sale"
    | "refund"
    | "chargeback"
    | "chargeback_fee"
    | "chargeback_reversal"
    | "chargeback_fee_reversal"
    | "processor_fee"
    | "reserve_hold"
    | "reserve_release"
    | "adjustment";
  transaction_id: string;
  parent_transaction_id?: string | null;
  order_id?: string | null;
  platform_order_id?: string | null;
  commerce_reference?: string | null;
  processor_transaction_id?: string | null;
  dispute_id?: string | null;
  source_amount: string;
  source_direction?: "credit" | "debit" | "unknown" | null;
  normalized_signed_amount: string;
  currency: string;
  occurred_at: string;
  status?: string | null;
  reason?: string | null;
  diagnostic_flags?: string[];
  raw: Record<string, unknown>;
  meta: Record<string, unknown>;
};
```

The source amount and direction are audit evidence. The normalized signed amount is the value analysis APIs should consume.

### 2. Deduplicate by stable source event identity

Preferred dedupe keys by platform:

| Platform | Preferred key | Fallback key |
| --- | --- | --- |
| PayPal | `paypal:{account_id}:{dispute_id}:chargeback` | `paypal:{account_id}:{transaction_id}:{event_code}:chargeback` |
| Shopify | `shopify:{shop_domain}:{dispute_id}:chargeback` | `shopify:{shop_domain}:{order_id}:{initiated_at}:{amount}:chargeback` |
| CheckoutChamp | `checkoutchamp:{transactionId}:chargeback:{chargebackDate}` | `checkoutchamp:{orderId}:{chargebackDate}:{chargebackAmount}:{reasonCode}` |
| WowBoost | `wowboost:{receipt_id_or_transaction_id}:chargeback` | `wowboost:{order_id}:{receipt_timestamp}:{amount}:{status_or_type}:chargeback` |
| WowPay | `wowpay:{receipt_id_or_transaction_id}:chargeback` | `wowpay:{order_id}:{receipt_timestamp}:{amount}:{status_or_type}:chargeback` |
| NMI/PayDiverse | `{platform}:{processor_account_id}:{transaction_id}:{action_date}:return` | `{platform}:{processor_account_id}:{order_id}:{action_date}:{amount}:return` |
| Stripe | `stripe:{account_id}:{dispute_id}:chargeback` | `stripe:{account_id}:{charge_id}:{created}:{amount}:chargeback` |
| Commas/FanBasis | `commas:{event_id}` or `commas:{dispute_id}` | `commas:{payment_id}:{created_at}:{amount}:chargeback` |

Refund and chargeback dedupe scopes must remain independent. The ledger type belongs in the event identity so a `refund` and a `chargeback` with the same order, transaction, timestamp, or amount cannot suppress each other.

Use a partial unique index on `(workspace_id, platform, ledger_type, transaction_id)` for normalized chargeback/dispute rows, similar to the existing WowBoost refund unique index. If one RPC handles all financial adjustments, the unique index should cover every append-only event type that uses stable normalized `transaction_id`.

### 3. Match to commerce deterministically

Matching order:

1. Direct `platform_order_id`
2. Same-platform `order_id`
3. Commerce reference / invoice ID
4. Processor transaction ID to `payment_transactions`
5. Parent transaction ID to an already matched sale/refund/payment transaction

Do not use fuzzy matching in the ingestion step. If deterministic matching fails, insert the event with the source identifiers intact and mark diagnostics as unmatched. The analysis endpoint already includes matched totals only when a platform order exists.

### 4. Preserve affiliate attribution

Chargeback ingestion should not recalculate attribution. It should:

- Use the matched `platform_orders` row for affiliate/source/sub-ID evidence.
- Preserve missing-affiliate events in overall totals.
- Exclude missing-affiliate events only from affiliate/source rankings.
- Emit diagnostics for unmatched orders and missing affiliate evidence.

### 5. Ingest each processor component separately

For every processor and gateway, audit and ingest each independently reported component:

- Principal debit.
- Fee debit.
- Principal reversal or recovery.
- Fee reversal.
- Status and reason transitions.

Only create an event when the source provides a reliable amount, timestamp, and event identity. Status-only transitions without a financial effect should remain diagnostics or metadata unless the source reports them as ledger-impacting events.

### 6. Runtime and replay model

Implement ingestion as bounded Connector Runtime jobs:

- One account/page/window per invocation.
- Cursor persisted after each successful page.
- Idempotent inserts through RPC or unique indexes.
- Queue retry and stale task recovery reused from the existing runtime.
- Cancellation-safe conditional job progress updates.
- Durable diagnostics: fetched, processed, inserted, duplicates, unmatched, fees, reversals, warnings.

PayPal and NMI/PayDiverse jobs should persist account-specific cursors because each configured account is an independent processor statement.

### 7. Dashboard support

Chargeback Analysis should remain a downstream consumer:

- Source of truth: normalized chargeback ledger rows.
- Legacy platform_orders fallback only when no normalized event exists for that order.
- Chargeback rate: distinct affected orders / eligible sale-order denominator.
- Fees remain separate from principal.
- Reversals and fee reversals remain separate recovery events. They can support recovery/net-impact views, but they must not erase or overwrite historical chargeback and fee rows.
- Double-debit warnings are diagnostic only and must not reduce event totals.

## Schema and Migration Impact

Existing `conversions` and `payment_transactions` rows use text-like event fields that can physically store new ledger type strings, but the current application model is not yet complete for the proposed canonical event set.

Known gaps before implementation:

- TypeScript ledger unions currently include `sale`, `refund`, `chargeback`, `chargeback_fee`, `processor_fee`, `reversal`, and `adjustment`, but not `chargeback_reversal`, `chargeback_fee_reversal`, `reserve_hold`, or `reserve_release`.
- Existing refund idempotency support is WowSuite refund-specific. Chargebacks need their own generalized unique index and insert RPC or an intentionally shared financial-adjustment insert path.
- `journey_events` currently has a constrained event-type set that includes `refund` and `chargeback`, but not fee/reversal/reserve event types. The detailed processor financial events should remain in the financial ledger unless the Journey model is explicitly expanded later.
- Account-specific cursors should start in existing `integration_import_jobs.progress` / task payload JSON. A dedicated cursor table is only needed if concurrent multi-account operation outgrows the current job/task storage model.

A migration is therefore expected for production-grade ingestion, at minimum for idempotent indexes/RPCs and possibly for explicit diagnostic/account metadata fields if the existing JSON fields are insufficient.

## Recommended Implementation Order

1. Add the shared financial-adjustment normalizer and idempotent insert path for `chargeback`, `chargeback_fee`, `chargeback_reversal`, `chargeback_fee_reversal`, `processor_fee`, `reserve_hold`, `reserve_release`, and `adjustment`.
2. Enumerate configured processor accounts from saved credentials. First phase must include all configured PayPal accounts and all configured NMI/PayDiverse Classic accounts. Do not assume a connector is production-ready just because documentation exists.
3. Implement PayPal Customer Disputes API polling per configured PayPal account, using account-specific cursors and existing dispute ledger builder logic as the starting point.
4. Implement NMI/PayDiverse Classic action-level extraction for every configured `nmi:%` and `paydiverse` account. Read every action row and classify principal, fee, reversal/recovery, fee reversal, status, and reason independently.
5. Implement CheckoutChamp/Konnektive `transactions/query` chargeback polling using `dateRangeType=chargebackDate`, after confirming fee/reversal fields from real payloads.
6. Extend WowBoost receipt inspection only after confirming actual chargeback/dispute receipt statuses and principal fields. Keep WowPay separate unless explicitly approved.
7. Add Shopify Payments dispute polling/webhook support after confirming store credentials and Shopify Payments availability.
8. Harden manual postback idempotency for chargeback/dispute senders.
9. Add Stripe and Commas/FanBasis only as separate connector projects after credentials, signatures, and webhook payloads are confirmed.

## Resolved Architecture Decisions

- The default refund/chargeback double-debit diagnostic window is 7 calendar days and is configurable per workspace.
- Chargeback reversals and chargeback fee reversals are always appended as new ledger events. They never overwrite historical chargeback or fee events.
- Reserve holds and reserve releases are cash-flow events, not revenue events.
- Account-specific cursors should initially live in existing job/task progress JSON.

## Remaining Connector Payload Checks

- Confirm the canonical source for chargeback fees on Shopify Payments, since dispute resources may not expose fee rows consistently.
- Confirm which WowBoost/WowPay receipt fields, if any, identify chargeback principal separately from snapshot status and `chargebackFee`.

## Reference Links

- PayPal Customer Disputes API: https://docs.paypal.ai/reference/api/rest/disputes/list-disputes
- PayPal dispute webhooks: https://developer.paypal.com/docs/multiparty/disputes-chargebacks/webhooks/
- PayPal Transaction Search API: https://docs.paypal.ai/reference/api/rest/transactions/list-transactions
- Shopify Payments disputes REST resource: https://shopify.dev/docs/api/admin-rest/latest/resources/dispute
- Shopify dispute created webhook: https://help.shopify.com/en/manual/shopify-flow/reference/triggers/dispute-created
- CheckoutChamp API docs: https://apidocs.checkoutchamp.com/
- Stripe Disputes API: https://docs.stripe.com/api/disputes
- Stripe dispute webhook event types: https://docs.stripe.com/api/events/types
- NMI Query API: https://docs.nmi.com/reference/query
- NMI webhook overview: https://docs.nmi.com/reference/overview
- Commas API docs: https://commasdocs.com/

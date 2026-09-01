# WS-008 M4 — 29Next Canonical Order Expansion

Status: REVIEW

## Scope

Expand bounded 29Next order ingestion into TraceKit canonical commerce inputs without activating subscriptions, webhooks, scheduler changes, or provider writes.

## Implemented

- Order line normalization from documented order-detail fields.
- Provider product/variant observations derived from order lines, avoiding an additional catalogue API walk during bounded historical ingestion.
- Customer identity input from the durable 29Next user id plus normalized email/phone/display name.
- Payment transaction normalization using durable transaction id, parent id, external id, network transaction id, auth code, type/status/payment method/gateway, amount/currency/time, and dispute/external/test flags.
- Refund normalization with durable refund id, explicit total refund amount/currency/time, and linked transaction ids.
- Attribution preservation limited to documented affiliate/funnel/gclid/subaffiliate1-5/UTM fields plus provider metadata.
- Sensitive payment/browser fields such as card tokens, BIN/last-four, raw IP, user-agent, and attribution agent contact data are not promoted into canonical expansion records.
- Existing persistence order remains Evidence -> source mapping -> platform order -> canonical child surfaces.

## Product strategy

29Next order detail contains product_id, variant_id, sku, product title, unit cost, quantity and line prices. M4 uses these evidence-backed fields to seed provider product observations during historical ingestion. A full catalogue sync remains a separate capability and is not required to expand each historical order.

## Persistence contract

The 29Next commerce repository contract now supports:

- upsertProducts
- upsertOrderLines
- upsertCustomerIdentity
- upsertTransactions
- upsertRefunds

The product writer is backward-compatible while downstream repository implementations converge; all other M4 child writers are required by the expanded persistence path.

## Explicitly deferred

- canonical subscription lifecycle schema
- subscription/rebill ingestion
- dispute/chargeback ingestion
- webhooks
- continuous scheduler/incremental overlap sync
- full product catalogue traversal
- production activation

## Review gate

Run from `/Users/nomadm/Projects/tracekit-29next/api` after pulling the branch:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \
  src/next29-client.test.ts \
  src/next29-historical-sync.test.ts \
  src/next29-canonical-expansion.test.ts \
  src/next29-product-observation.test.ts
```

M4 passes when all dedicated 29Next tests are green and no unrelated workstream files are changed.

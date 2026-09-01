# WS-008 — 29Next M3 Bounded Historical Ingestion

Status: REVIEW

## Scope

M3 adds a bounded, resumable order-ingestion path without enabling scheduled sync, webhooks, live repository activation, or subscription persistence.

The provider-specific flow is:

1. start a tenant-scoped historical commerce sync run;
2. list a bounded 29Next orders page;
3. retrieve full detail for each listed order;
4. reject list/detail identity disagreement;
5. persist immutable 29Next detail evidence;
6. register that evidence in canonical commerce persistence;
7. ensure the provider order source mapping;
8. upsert the canonical platform-order snapshot;
9. append a durable page checkpoint;
10. finish the bounded batch with `hasMore` and a resumable cursor, or fail the run with a bounded sanitized error.

## Bounds

Defaults:

- maximum 3 pages per invocation;
- maximum 100 orders per invocation.

Hard maximums:

- 25 pages;
- 500 orders.

The runner rejects larger values before performing a provider read.

## Canonical mapping

The normalized order uses:

- provider: `next29`;
- provider/source identity: 29Next order `number`;
- platform order identity: `next29:<order number>`;
- order timestamp: `date_placed`, then `created_at`, then `updated_at`;
- observed/update timestamp: `updated_at`, then `date_placed`, then `created_at`;
- gross amount: `total_incl_tax`;
- product subtotal: `total_excl_tax`;
- tax: `total_tax`;
- discount: `total_discount` in safe metadata;
- known attribution fields only: affiliate, funnel, gclid, subaffiliate1-5, utm_campaign/content/medium/source/term.

Arbitrary provider attribution metadata and customer address/user payloads are not copied into canonical metadata. The complete provider payload remains in immutable Evidence/raw order storage.

## Existing TraceKit infrastructure reused

M3 targets the existing provider-neutral contracts rather than introducing new tables:

- `commerce_sync_runs`;
- `commerce_sync_checkpoints`;
- `commerce_evidence_records`;
- `commerce_source_mappings`;
- `platform_orders`.

The provider-specific repository adapter requires Evidence and source mapping to exist before the platform-order write.

## Intentionally deferred

- scheduled/continuous polling;
- webhook ingestion;
- first-class subscription schema;
- transactions/refunds/disputes ingestion;
- UI connection setup;
- production activation;
- broad historical backfill.

## Review gate

Run from the isolated worktree:

```bash
cd /Users/nomadm/Projects/tracekit-29next/api
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/next29-client.test.ts src/next29-historical-sync.test.ts
```

M3 passes when all 29Next-specific tests pass. Repository-wide baseline failures documented in M2 remain out of scope unless a new failure is attributable to the 29Next files.

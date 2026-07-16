# Connector Runtime v1

Connector Runtime v1 moves large connector imports and maintenance jobs out of
HTTP request loops and into durable, bounded Cloudflare Queue tasks.

## Queue Setup

Create the queue before deploying the Worker:

```bash
npx wrangler queues create wowboost-imports
```

The Worker uses the existing `wowboost_imports` producer/consumer binding in
`api/wrangler.toml`:

```toml
[[queues.producers]]
queue = "wowboost-imports"
binding = "wowboost_imports"

[[queues.consumers]]
queue = "wowboost-imports"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 10
```

Runtime queue messages contain identifiers only, primarily `runtime_task_id`.
Task payloads and progress live in Supabase.

Runtime jobs are identified by durable metadata markers:

```json
{
  "runtime_version": 1,
  "execution_mode": "connector_runtime",
  "runtime_connector": "wowboost-commerce-reference-backfill"
}
```

Legacy synchronous import jobs that lack these markers must not be adopted by
runtime v1 dedupe or resume flows.

## Migration Order

Apply Supabase migrations in order through:

```text
supabase/migrations/013_wowboost_runtime_finalize_counts.sql
```

The runtime migrations extend `integration_import_jobs` and create or update:

- `connector_import_tasks`
- `integration_import_errors`
- `wowboost_order_reference_stage`
- `wowboost_order_reference_targets`
- `public.wowboost_runtime_finalize_counts`

No existing tables are removed or renamed.

## WowBoost Commerce Reference Backfill

`POST /v1/integrations/wowboost/backfill-commerce-references` now creates or
resumes a runtime job by default and returns HTTP `202` quickly.

Use `synchronous_debug: true` only for temporary debugging of the old bounded
synchronous path.

Runtime phases:

1. `stage_export_pages`: fetch one export page per task, preserving the
   requested date filters, then upsert `Order Number -> Order ID` mappings into
   `wowboost_order_reference_stage`.
2. `reconcile_legacy_orders`: scan blank WowBoost `platform_orders` in bounded
   batches and resolve legacy order-number suffixes from the staging table.
3. `fetch_order_details`: fetch a small sequential batch of true WowBoost Order
   IDs, preserve pacing/backoff, extract top-level `referenceId`, and update
   only `commerce_reference`.
4. `validate_and_finalize`: count remaining blanks/errors and mark the job
   `completed` or `completed_with_errors`.

The permanent regression fixture for this lifecycle lives under
`api/test-fixtures/wowboost-runtime-v1/` and is exercised by:

```bash
cd api
npm run test:wowboost-runtime-regression
```

The fixture is synthetic and intentionally small. It covers targeted export
staging, duplicate export rows, preexisting staged mappings, ambiguous and
missing legacy order-number mappings, sequential Order Details retries, 404s,
missing `referenceId`, idempotent finalization, and non-WowBoost safety.

## Production Benchmark

The completed live WowBoost commerce-reference backfill is an operational
benchmark, not a test assertion. The synthetic fixture must not depend on these
production totals.

- Job ID: `5a6294f3-3657-442d-858c-cc43da47b5bf`
- Date range: `2026-04-01` through `2026-07-13`
- Final status: `completed_with_errors`
- Export pages scanned: `234`
- Export rows seen: `116630`
- Runtime records processed: `4550`
- Remaining blank references: `39`
- Remaining blank references by platform:
  - `wowboost`: `18`
  - `wowsuite:wowboost`: `21`
- Final unresolved error count: `14`
- Runtime processing failures after fixes: none in staging, reconciliation, or
  fetch phases
- Finalize RPC: `public.wowboost_runtime_finalize_counts`

## Connector Status

WowSuite / WowBoost status: **Stable — Maintenance Only**.

Allowed future work:

- production bug fixes
- upstream API/auth changes
- schema compatibility changes
- security fixes

Not planned:

- new WowSuite-specific reporting
- additional legacy migration features
- custom WowSuite-only product features

## Operations APIs

- `GET /v1/import-jobs/{job_id}`
- `POST /v1/import-jobs/{job_id}/pause`
- `POST /v1/import-jobs/{job_id}/resume`
- `POST /v1/import-jobs/{job_id}/cancel`
- `POST /v1/import-jobs/{job_id}/retry-failed`
- `POST /v1/import-jobs/{job_id}/rerun-finalize`
- `GET /v1/operations/jobs`
- `GET /v1/operations/jobs/{job_id}`
- `GET /v1/operations/connectors/health`

Responses are compact by default and keep detailed histories in
`integration_import_errors` instead of unbounded progress JSON arrays.

## Current Live Job Migration

For job `295502cf-d247-4de1-8175-1395bfbfe899`, prefer replacement over
adoption.

Create a replacement runtime job for `2026-04-01` through `2026-07-13`. The
runtime scans only rows where `commerce_reference` is blank, so already
populated rows are skipped and completed work is not redone. This avoids trying
to reinterpret older cursor/export-page progress from the synchronous backfill.

Example:

```bash
curl -X POST "$TRACEKIT_API/v1/integrations/wowboost/backfill-commerce-references" \
  -H "content-type: application/json" \
  -d '{
    "workspace_id": "default",
    "from": "2026-04-01",
    "to": "2026-07-13",
    "force_new_job": true,
    "limit": 5,
    "pacing_ms": 650
  }'
```

Monitor with:

```bash
curl "$TRACEKIT_API/v1/import-jobs/{job_id}"
```

If the legacy task `bf6021de-3e58-4779-a722-d8ddd0f649f2` exists, cancel only
that task and leave populated `platform_orders` untouched:

```sql
update public.connector_import_tasks
set
  status = 'cancelled',
  locked_at = null,
  completed_at = now(),
  last_error = coalesce(last_error, 'Cancelled after legacy synchronous job was incorrectly adopted by Connector Runtime v1.'),
  updated_at = now()
where id = 'bf6021de-3e58-4779-a722-d8ddd0f649f2'
  and status <> 'completed';
```

If runtime columns or markers were written onto the legacy job
`295502cf-d247-4de1-8175-1395bfbfe899`, clear only those runtime markers before
starting the replacement job:

```sql
update public.integration_import_jobs
set
  metadata = coalesce(metadata, '{}'::jsonb) - 'runtime_version' - 'execution_mode' - 'runtime_connector',
  progress = jsonb_set(
    coalesce(progress, '{}'::jsonb),
    '{metadata}',
    coalesce(progress->'metadata', '{}'::jsonb) - 'runtime_version' - 'execution_mode' - 'runtime_connector',
    true
  ),
  updated_at = now()
where id = '295502cf-d247-4de1-8175-1395bfbfe899';
```

## Deployment

1. Apply Supabase migrations.
2. Create the Cloudflare Queue if it does not already exist.
3. Deploy the Worker with `npx wrangler deploy`.
4. Start the replacement WowBoost runtime job.

Do not deploy from Codex automatically without an explicit release request.

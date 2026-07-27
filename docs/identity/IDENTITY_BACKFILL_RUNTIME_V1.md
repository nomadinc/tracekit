# Identity Backfill Runtime v1

Status: initial runtime implementation.

Identity Backfill Runtime v1 backfills `platform_orders.person_id` for existing
source records through Connector Runtime v1. It does not change identity
matching rules, connector imports, PayPal reconciliation, ledger behavior,
Profit Engine formulas, or attribution.

## Scope

Initial production scope:

- `platform_orders`
- `platform` in `wowboost` or `wowsuite:wowboost`
- legacy `wowsuite` rows only when the row is confidently WowBoost-shaped
- `person_id is null`
- requested `order_ts` date range

WowPay is excluded.

Payment transaction backfill is intentionally out of scope for v1.

## Runtime Job

Connector Runtime markers:

```json
{
  "runtime_version": 1,
  "execution_mode": "connector_runtime",
  "runtime_connector": "identity-backfill-platform-orders"
}
```

Job shape:

- `connector_id`: `identity-backfill-platform-orders`
- `job_type`: `identity_backfill`
- `platform`: `identity`
- `module`: `connector_runtime`

Phases:

1. `discover_unlinked_records`
2. `resolve_identity_batch`
3. `validate_and_finalize`

The runtime processes one bounded batch per queue task. Discovery stores only
compact cursor/counter progress on the job. Resolve tasks store a bounded list
of `platform_order_id` values in the task payload and reload current rows before
attempting attachment.

## API

Start or resume:

```bash
curl -X POST "$TRACEKIT_API/v1/identity/backfill-platform-orders" \
  -H "content-type: application/json" \
  -d '{
    "workspace_id": "default",
    "from": "2026-04-01",
    "to": "2026-07-13",
    "platforms": ["wowboost", "wowsuite:wowboost"],
    "batch_size": 25,
    "dry_run": true
  }'
```

Create a replacement job even when another active matching runtime job exists:

```json
{
  "force_new_job": true
}
```

CamelCase aliases are accepted for `forceNewJob` and `batchSize`.

Monitor and operate:

- `GET /v1/import-jobs/{job_id}`
- `POST /v1/import-jobs/{job_id}/pause`
- `POST /v1/import-jobs/{job_id}/resume`
- `POST /v1/import-jobs/{job_id}/cancel`
- `POST /v1/import-jobs/{job_id}/retry-failed`
- `POST /v1/import-jobs/{job_id}/rerun-finalize`
- `GET /v1/operations/identity`

## Evidence Extraction

The connector-neutral extractor is:

`api/src/identity-backfill-runtime.ts`

Allowed person identity evidence:

- normalized email
- E.164 phone only when already safe
- source customer IDs such as WowBoost customer ID
- explicit external customer IDs

Not used as person identity evidence:

- name alone
- address alone
- commerce reference
- order number
- amount
- shipping reference
- payment transaction ID
- attribution IDs unless a future connector explicitly defines them as person
  identifiers

Phone country is never guessed silently.

## Resolution

Resolve tasks call the existing Identity Service hook:

`resolveIdentityForSourceRecord(...)`

Behavior:

- rows are reloaded before processing
- existing `person_id` is never overwritten
- updates use a conditional `person_id is null` attachment
- `created_person` and `matched_existing_person` can attach `person_id`
- `review_required` and conflicts do not attach `person_id`
- no-identifier rows are skipped without creating a person
- dry-run mode extracts and previews likely action without writing people,
  identifiers, events, or platform-order attachments

## Finalization

Migration:

`supabase/migrations/015_identity_backfill_runtime_v1.sql`

Adds:

- partial scan index on
  `platform_orders(workspace_id, platform, order_ts, platform_order_id)` where
  `person_id is null`
- RPC `public.identity_backfill_finalize_counts(...)`

Finalize returns:

- `total_in_scope`
- `linked_person_id`
- `remaining_unlinked`
- `review_required_count`
- `no_identifier_count`
- `runtime_error_count`

Jobs complete as `completed` only when there are no remaining unlinked records,
review items, no-identifier records, or runtime errors. Otherwise they complete
as `completed_with_errors`.

## Tests

Focused command:

```bash
cd api
npm run test:identity-backfill-runtime
```

The synthetic fixture summary lives at:

`api/test-fixtures/identity-backfill-runtime-v1/expected-summary.json`


# Identity Service v1

Status: incremental foundation.

Identity Service v1 answers one deterministic question:

> Which person does this external record belong to?

It creates a people spine, stores normalized identifiers with provenance, records
append-only resolution events, and gives connectors a shared way to attach source
records to a person without changing ledger, attribution, reconciliation, or
Profit Engine behavior.

## Schema

Migration:

`supabase/migrations/014_identity_service_v1.sql`

Core tables:

- `people`: workspace-scoped person records. Merged people remain present and
  point at `merged_into_person_id`.
- `person_identifiers`: workspace-scoped deterministic identifiers linked to a
  person. Active identifiers are unique by workspace, type, and normalized
  value.
- `identity_resolution_events`: append-only audit trail for every resolution
  decision.
- `person_merge_history`: append-only manual merge history.

Source linkage added in v1:

- `platform_orders.person_id`
- `payment_transactions.person_id`

Both are nullable. Existing rows remain valid and no automatic production
backfill is run by the migration.

## Identifier Types

Identity v1 supports:

- `email`
- `phone`
- `paypal_payer_id`
- `stripe_customer_id`
- `shopify_customer_id`
- `woocommerce_customer_id`
- `checkoutchamp_customer_id`
- `fanbasis_customer_id`
- `everflow_transaction_id`
- `external_customer_id`
- `order_customer_id`

Verification states:

- `observed`
- `verified`
- `disputed`
- `deprecated`

## Normalization

Implemented in:

`api/src/identity-normalization.ts`

Email:

- trim
- Unicode NFKC normalization
- lowercase
- no Gmail-specific dot removal
- plus addressing is preserved
- invalid or empty emails are rejected

Phone:

- formatting is stripped
- E.164 is accepted directly
- US/CA numbers normalize with explicit country context
- numbers without safe country context are preserved but not considered valid
- no country is guessed silently

External IDs:

- trim
- preserve platform case unless a type has a safe rule
- reject placeholders like `null`, `undefined`, `unknown`, `n/a`, `none`, and
  invalid zero values
- Everflow UUID-style transaction IDs are lowercased only when the value is
  safely UUID-shaped

Normalized values remain queryable for explainability. Hashes are also stored
where useful, but hashes do not replace normalized identifiers in v1.

## Deterministic Matching Rules

Implemented in:

`api/src/identity-service.ts`

Resolution priority:

1. Exact verified platform-specific customer ID
2. Exact verified payment-platform customer or payer ID
3. Exact normalized email
4. Exact normalized phone
5. Multiple identifiers pointing to the same active person
6. Review required when identifiers point to different active people
7. Create a new person when no exact match exists and the source record is valid

Identity v1 does not match on name alone or address alone.

## Conflict Behavior

If input identifiers resolve to more than one active person, Identity Service v1:

- returns `review_required`
- does not attach conflicting identifiers
- does not choose a winner
- does not merge people
- writes an `identity_resolution_events` row with the candidate people and
  compact input identifier evidence

The source record can remain without `person_id` until review.

## Merge Behavior

Manual merge support includes:

- merge preview
- compatible identifier movement
- duplicate identifier deprecation
- conflicting identifier dispute state
- source person marked `merged`
- `merged_into_person_id` set
- append-only `person_merge_history`
- append-only `identity_resolution_events`

No hard delete happens during merge. The merge history preserves enough context
for a future reversal workflow.

## Connector Contract

Reusable hook:

`resolveIdentityForSourceRecord(...)`

Connectors provide:

- `workspace_id`
- `connector_id`
- `connector_job_id`
- `platform`
- `record_type`
- `record_id`
- deterministic identifiers
- optional person attributes
- `observed_at`

The hook returns the same deterministic resolution result as the service. A
connector should set `person_id` only when the result contains a person and is
not review-required.

First proof path:

- Newly imported or updated WowBoost `platform_orders` rows call the hook in a
  bounded, fail-open path.
- The hook uses deterministic WowBoost identifiers such as customer email and
  confirmed order customer IDs when present.
- It writes `person_id` only for non-conflicting resolutions.
- It does not process the entire historical database.

Historical proof path:

- Identity Backfill Runtime v1 uses Connector Runtime tasks to backfill existing
  `platform_orders.person_id` values in bounded batches.
- The initial production scope is WowBoost-related platform orders only.
- The runtime reuses the same Identity Service hook and does not alter matching
  rules.
- See [Identity Backfill Runtime v1](./IDENTITY_BACKFILL_RUNTIME_V1.md).

## API Routes

Identity routes:

- `POST /v1/identity/resolve`
- `GET /v1/identity/review`
- `POST /v1/identity/backfill-platform-orders`
- `GET /v1/people/search`
- `GET /v1/people/{person_id}`
- `GET /v1/people/{person_id}/identifiers`
- `GET /v1/people/{person_id}/history`
- `POST /v1/people/{person_id}/identifiers`
- `POST /v1/people/merge-preview`
- `POST /v1/people/merge`

Operations route:

- `GET /v1/operations/identity`

Responses are compact by default. History and review responses avoid returning
raw full email or phone values.

## Privacy And PII

Identity tables must not store secrets, payment credentials, or card numbers.

V1 stores identifier values because deterministic lookup and explainability need
them. Normalized hashes are stored alongside those values for future workflows
that can avoid direct identifier display.

Every query and write is scoped by `workspace_id`. Future deletion and
suppression workflows should update person status and deprecate identifiers
while preserving necessary audit history.

## Deliberate Non-Goals

Identity v1 does not implement:

- fuzzy matching
- probabilistic matching
- machine learning identity models
- household graphs
- device fingerprinting
- shipping-address matching
- automatic merges
- automatic production backfill

## Rollout Plan

Deployment order:

1. Deploy `014_identity_service_v1.sql`.
2. Deploy API code containing the normalization and service modules.
3. Verify identity tables and indexes.
4. Exercise `/v1/identity/resolve` with fixture data.
5. Enable the bounded WowBoost proof path.
6. Review `/v1/operations/identity` and `/v1/identity/review`.

Verification SQL:

```sql
select count(*) from public.people;
select count(*) from public.person_identifiers;
select count(*) from public.identity_resolution_events;
select count(*) from public.platform_orders where person_id is not null;
```

Rollback considerations:

- Do not drop identity tables if resolution events have been written.
- Disable the connector hook first if needed.
- Leave nullable `person_id` fields in place unless a deliberate rollback plan
  migrates dependent data.

Backfill design:

- Use Connector Runtime.
- Stage source records in bounded pages.
- Resolve identity in small chunks.
- Persist cursor, counts, conflicts, and last successful source record.
- Never overwrite an existing non-conflicting `person_id`.
- Never auto-merge conflicts.

Recommended next connector:

WowBoost remains the safest first connector because it already normalizes
commerce records, customer email, and source evidence into `platform_orders`.
After that proof is stable, Shopify customer IDs and PayPal payer IDs can be
added as deterministic identifiers without changing PayPal reconciliation or
ledger logic.

## Future Roadmap

Later versions can add:

- identity timeline UI
- manual review UI
- merge reversal
- address evidence as non-automatic review context
- household graph
- device identifiers
- confidence models
- automated merge suggestions
- customer deletion and suppression workflows

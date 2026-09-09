# Everflow External Conversion Scrubber — M1

Status: ACTIVE

Priority: P0

Type: Tracking Infrastructure / Conversion Gateway / Revenue Control

## Repository checkpoint

- Repository: `nomadinc/tracekit`
- Worktree: `/Users/nomadm/Projects/tracekit-everflow-scrubber`
- Branch: `workstream/everflow-external-scrubber-v1`
- Base: `origin/main` at `fde4ab8467dc02e55556d8613286521e441cf35c`
- Production deployment and source cutover are prohibited until all release gates have evidence.

## Current architecture assessment

TraceKit already has a tenant-scoped Everflow connection, encrypted server-side credential resolution, network verification, and bounded metadata clients. Existing `everflow_affiliates` and `everflow_offers` tables retain source identity and historical rows without deleting inactive metadata. Those assets should be reused.

The conversion scrubber is a new write path. It must not reuse the historical Everflow conversion importer or click-ingestion volume as its denominator. Its sole eligible denominator is accepted gateway conversions for the same organization, connection, offer, affiliate, and active rule period.

The gateway belongs in the server runtime, never in browser code. Admin reads/writes use the existing authenticated active-organization session and same-origin mutation pattern. Gateway ingress uses an independent source token because commerce systems cannot hold an admin session.

## Everflow affiliate sync contract

Existing implementation: `ui/lib/integrations/everflow-affiliates.ts`.

- Read `GET https://api.eflow.team/v1/networks/affiliates` with `X-Eflow-Api-Key`.
- Page with a bounded page size and page count.
- Verify returned `network_id` matches the connected provider account.
- Upsert by `(connection_id, provider_account_id, network_affiliate_id)`.
- Update names, status, and source timestamps; advance `last_seen_at`.
- Never delete rows absent from a later response. Inactive/suspended rows remain resolvable for audit history.
- API credentials are decrypted only in the server control plane and are never logged or returned.

## Everflow offer sync contract

Existing implementation: `ui/lib/integrations/everflow-offers.ts`.

- Read the bounded Everflow network offers endpoint with `X-Eflow-Api-Key`.
- Verify network ownership.
- Upsert by `(connection_id, provider_account_id, network_offer_id)`.
- Retain `network_advertiser_id`, name, status, source timestamps, and available descriptive metadata.
- Never delete historical rows; inactive/paused/deleted status is metadata, not a cascade instruction.

## Incoming gateway contract

Preferred route: `POST /api/conversion` (a versioned alias may be added before certification).

Authentication: `Authorization: Bearer <source-token>`. Tokens must contain at least 256 bits of entropy. Only a SHA-256 digest is stored. A token selects exactly one active organization/connection/source scope.

Required JSON fields:

```json
{
  "transaction_id": "abc123",
  "oid": 52,
  "affid": 107
}
```

`oid` and `affid` accept a positive JSON integer or a canonical digit string. Decimal, signed, exponent, zero, negative, boolean, and whitespace-containing representations are rejected. There is no click lookup.

Optional fields are `order_id`, `amount`, `currency`, `user_ip`, `coupon_code`, `email`, `event_key`, `event_id`, `adv_event_id`, `aid`, and `adv1` through `adv10`. Unknown fields are excluded from forwarding. Plaintext email is usable only transiently for forwarding; the durable ledger stores its digest.

Responses must include a TraceKit request ID. Rejected authentication and validation attempts never fail open.

## Outgoing Everflow forwarding contract

Passed conversions use clicked-traffic attribution through the original `transaction_id`. Only supplied supported values are forwarded; `oid` and `affid` are rule-routing evidence and are not substituted for transaction attribution. The original `user_ip` is forwarded when supplied.

The exact Everflow S2S conversion URL, HTTP method, accepted optional parameter names, success response, and duplicate behavior must be certified against the connected network's current Everflow documentation/sandbox before the forwarder is enabled. This is intentionally a runtime configuration/certification item rather than a guessed hard-coded URL. The pure forwarding mapper is implemented and covered by tests.

Forward attempts are immutable child records. A PASS begins as `pending`; retryable failures remain PASS and move to `retry` with bounded exponential backoff and jitter. Permanent failures remain auditable and are never relabeled SCRUB.

## Rule resolution and periods

At decision time, in one database transaction:

1. Read active pair rule for `(offer, affiliate)`.
2. Otherwise read active offer rule.
3. Otherwise use the global setting.
4. Lock the active period for the exact pair.
5. If rule source, rule ID, target rate, or optional reporting-day identity differs, close it and create a period starting now.
6. Make and persist the decision, then increment that period's counters.

An admin rate update closes the previous history row and creates a new row at the same database timestamp. It also closes affected active periods in that transaction. The next accepted eligible request therefore cannot see the prior rate. No application cache sits on this path.

Pair periods remain independent even when they inherit the same offer/global rule. Changing a global or offer rate closes all currently affected child pair periods but never combines their counters.

## Scrub controller

The controller is a randomized proportional feedback controller:

```text
deficit = target_pass_rate × eligible_count − passed_count
pass_probability = clamp(target_pass_rate + 0.35 × deficit, 0, 1)
decision = cryptographic_random_unit < pass_probability
```

Every individual decision uses a cryptographically secure random value. When a bucket drifts high, its next pass probability falls; when it drifts low, it rises. This avoids a fixed repeating sequence while keeping long-run results close to target. Targets of 0% and 100% are exact. Tests exercise 5%, 25%, 60%, and 95% over 10,000 decisions with less than 0.2 percentage-point error.

The random value should not be stored. The derived probability, period counts before increment, rate, period ID, and reason code provide sufficient decision audit without exposing sequence material.

## Idempotency

Logical identity is scoped to organization, connection, and source:

```text
source + order_id (fallback transaction_id) + adv_event_id/event_id/event_key
```

The canonical tuple is hashed before persistence as `idempotency_key`. This permits multiple distinct events on one click/order. A unique database constraint arbitrates concurrent duplicates. Every request receives an ingress-attempt row; a conflict records `DUPLICATE_SUPPRESSED` linked to the original conversion and never forwards again.

Source integrations should supply `order_id` plus a stable event identifier. The transaction/event fallback is safe for retries but may suppress two same-type conversions intentionally attached to one click; such integrations must define a source-specific key before certification.

## Security design

- Gateway source tokens are high-entropy bearer secrets stored only as SHA-256 digests.
- Token comparison uses digest equality; responses do not reveal whether an organization, connection, offer, or affiliate exists.
- Admin mutations require an authenticated active-organization session, organization scope, permission check, and same-origin verification.
- Existing encrypted Everflow credentials remain server-side.
- All scrubber tables have RLS enabled, revoke `anon` and `authenticated`, and grant only the server `service_role`.
- Payload allow-listing prevents relay of arbitrary Everflow parameters.
- Ledger payloads redact authorization, source tokens, plaintext email, and other unnecessary PII. IP retention follows the product retention policy.
- Logs use request/conversion IDs and reason/error codes, not secrets or full payloads.

## Failure modes

| Failure | Behavior |
|---|---|
| Missing/invalid source token | Reject; `REJECT_UNAUTHORIZED_REQUEST`; never forward |
| Invalid required/routing field | Reject; `REJECT_INVALID_REQUEST`; never forward |
| Duplicate request | Record attempt; `DUPLICATE_SUPPRESSED`; never forward twice |
| Scrubbing disabled | Persist PASS; `PASS_GLOBAL_BYPASS`; forward |
| Non-eligible event | Persist PASS; `PASS_NON_ELIGIBLE_EVENT`; forward; exclude from controller counts |
| Rule/controller/database failure after valid authentication/normalization | If configured fail-open, forward directly and emit `PASS_FAIL_OPEN`; enqueue a redacted recovery audit signal |
| Everflow transient failure | Keep PASS; persist retry state; bounded retry with jitter |
| Everflow permanent failure | Keep PASS; persist permanent failure and alert |

Fail-open during a total database outage cannot guarantee the primary ledger write. The forwarder must emit a durable external log/queue signal sufficient to backfill the missing `PASS_FAIL_OPEN` audit row. Certification must prove that durability mechanism; ordinary console logging is insufficient.

## Reporting

Daily reports derive the local calendar date using the explicit IANA `reporting_timezone`. Raw means valid eligible conversions only. Invalid, duplicate, and non-eligible attempts are separate categories. For every pair/day, `raw = passed + scrubbed`. Revenue and AOV are computed separately for raw and passed populations.

## Test plan and release evidence

- Unit: strict normalization, forwarding allow-list, reason selection, precedence, idempotency identity, controller drift correction/statistics.
- Database: constraints/RLS/grants, concurrent duplicate race, pair isolation, atomic decision/counter reconciliation, history immutability, immediate pair/offer/global updates, reporting timezone boundary.
- Integration: metadata pagination/upsert/status retention; source authentication; 100% pass; 0% pass; non-eligible bypass; fail-open injection; retry without duplicate forward.
- Everflow certification: controlled offer and affiliate at 100% pass; verify transaction, amount, order ID, event identity, and original IP; then controlled non-100% traffic.
- UI: authenticated offer list/matrix, filters, inline edit, immediate next-conversion evidence, and displayed pass/scrub complements.

No production-ready claim is permitted until every release gate has an attached test result or Everflow evidence reference.

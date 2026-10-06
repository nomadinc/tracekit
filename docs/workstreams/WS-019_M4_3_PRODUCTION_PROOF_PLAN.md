# WS-019 M4.3 Production Acceptance Evidence

M4.3 is **CLOSED / PASS**. `lifecycle_history_visibility` is **PRODUCTION PROVEN** for the frozen Production V1 contract. This evidence does not promote any unrelated release requirement or declare Production V1 ready.

## Production identity

- Authoritative main: `270ef18d1509438fbe4a3122bbea6d41d1f3a788`
- Deployment: `dpl_UAp9P9Xmp5rKjNF7eM1ieMamG929`
- Organization: Stem Labs (`8f6bb14b-2126-49b8-bfdb-c60edbc3549b`)
- Certified intent: `1c07429f-ccce-4b9f-9fa3-88b912fac422`

## Completed production proof

1. Authenticated Stem Labs Admin Client View and effective `audit_logs.view`: PASS. The positive GET crossed the deployed permission boundary and returned HTTP 200. Both requests correlated to actor Anthony McCabe and the Stem Labs membership.
2. Transactional BEFORE snapshot: captured at `2026-10-05T05:38:35.164933Z`, with provider telemetry anchored at `2026-10-05T05:39:14.850723Z`.
3. Positive GET: HTTP 200 during `2026-10-06T05:55:33.390Z–05:55:34.266Z`.
4. Exact M3 reconstruction: PASS. Intent, confirmation, authorization, consumption, execution persistence row, public execution, recovery, external mutation audit, envelope, idempotency, target and plan identity joined deterministically. Exactly one execution was represented.
5. Historical truthfulness: PASS. Readiness remained `partial` and unlinked. Independent provider read-back and observed post-expiry replay remained `certification_artifact_only`; neither was presented as a native runtime row.
6. Synthetic negative: intent `11111111-1111-4111-8111-111111111111` returned the non-disclosing HTTP 404 contract during `2026-10-06T05:56:03.802Z–05:56:04.519Z`. No lifecycle row or provider path was reached.
7. Redaction: PASS. The allowlisted response exposed no credentials, credential envelopes, secrets, tokens, raw provider responses, or unrestricted plan/result metadata.
8. AFTER snapshot: captured at `2026-10-06T05:57:14.635807Z`. Counts, full-row hashes and mutation watermarks were identical across action intents, confirmations, authorizations, execution results, Shopify recovery, external mutation audit, Work Items, Work Item activity and Notification state.
9. Provider isolation: PASS. Exact-window production telemetry showed only the two history GETs plus an unrelated scheduler tick with zero due targets and zero attempts. There was no credential resolution/decryption, provider readiness/list call, or Shopify/Everflow/Commas request. External-action and external-mutation audit state was unchanged.
10. Operator UI: PASS. In authenticated Stem Labs Admin Client View, `/activity` rendered the exact governed lifecycle, actor, target, plan identity, `rollback_verified` result and net-zero state. It visibly distinguished `partial`, `available`, and `certification_artifact_only`, showed durable result reuse, and retained an execution count of one.

## Durable zero-delta evidence

The BEFORE and AFTER hashes matched for every acceptance surface. Normal `membership.resolved` session events were the only expected audit additions and are excluded from the business-state assertion.

The retained M3 lifecycle was not replayed or modified, no provider was called, and no production business state was written by either GET.

Authoritative machine-readable evidence: `docs/workstreams/evidence/WS-019_M4_3_PRODUCTION_ACCEPTANCE.json`.

# 29Next M14 — Webhook Runtime Foundation

## M13 checkpoint

M13 Live Webhook Canary is PASS. Live `order.created` deliveries proved raw-byte HMAC verification, immutable webhook and order Evidence, exact order refresh, failed-receipt reclaim, completed-receipt deduplication, canonical persistence, completed sync runs, completed receipts, and source/canonical/platform identity reconciliation.

## M14.1A scope

M14.1A introduces the permanent route contract at `/api/next29/webhook/[connectionId]` while keeping production activation OFF.

The permanent route is bounded to `order.created`, 256 KB raw request bodies, `x-29next-signature`, request IDs, no-store responses, and bounded non-PII operational logging. The exact permanent webhook path bypasses WorkOS because provider webhooks authenticate by HMAC rather than an interactive session.

The route currently reuses the M13-proven order processor so the already-validated idempotency and persistence behavior is not duplicated. The M13 canary remains intact as diagnostic evidence.

## Activation state

Production activation is OFF. M14.1A deliberately refuses production execution. No Vercel environment variable is set by this milestone, no 29Next webhook target is changed, no schedules are enabled, and no provider subscription is modified.

## Secret storage

M14.1A introduces a server-only signing-secret resolver boundary. For staging compatibility it may read the existing `TRACEKIT_NEXT29_WEBHOOK_SIGNING_SECRET` environment variable. This is temporary compatibility behavior only.

M14.1B must replace the environment fallback with connection-scoped encrypted webhook signing-secret storage before production activation. The existing single-active-commerce-credential contract is not changed in M14.1A.

## Event eligibility

Only `order.created` is eligible. `order.updated`, transaction, subscription, dispute, and refund webhook events remain inactive until their contracts are separately validated.

## Next milestone

M14.1B: connection-scoped encrypted signing-secret storage and extraction of the remaining canary environment dependency from the shared order processor, followed by controlled staging activation through the permanent route.

# Commas `refund.created` provider contract

Status: provider-confirmed current-state contract. This document does not authorize subscription activation.

## Discovery and identity

`refund.created` is the canonical forward-looking stream for refunds added to transactions after original ingestion. `original_payment_id` is the preferred cross-surface parent identity and normally equals the transaction `public_transaction_id` (`ORD-*`). Legacy values may be hashids and must remain unresolved without authoritative mapping.

Webhook `refund_id` is a stable immutable hashid. `transactions[].refunds[].id` is the numeric ID for the same provider record; they are not string-equal and TraceKit must not directly equate them. `refund_transaction_id` is the parent transaction numeric ID encoded as a hashid, not the raw numeric transaction ID.

## Seller economics

Commas is USD-only by provider contract.

- `amount`: gross buyer refund.
- `refund_cost`: total seller economic cost. This is the canonical seller loss.
- `refund_cost_creator_amount`: seller earnings removed from wallet.
- `processor.processor_refund_cost_fee`: processor fee component; equivalent to `transactions[].refunds[].fee`.
- `refund_cost_affiliate_commission`: affiliate clawback; excluded from seller economics.

Where the processor fee is exposed, `refund_cost = refund_cost_creator_amount + processor.processor_refund_cost_fee`. TraceKit must post `-refund_cost` exactly once for a final successful webhook-native refund. It must not add the components on top.

## Status

`success` is final on receipt for normal/card refunds and may realize seller economics.

`pending` is provisional (observed on Adyen). Cost fields are placeholders and must not post economics. Commas emits no settlement follow-up webhook. Until a supported exact settlement read is confirmed, TraceKit must persist pending state and fail closed with `unsupported_pending_settlement_read`.

`failed` posts no seller refund economics.

## Historical compatibility

Legacy TraceKit transaction-page refund rows used buyer `amount` plus `fee`. The frozen historical cohort was corrected separately under `commas-refund-seller-cost-correction-v1`. New `refund.created` handling must not rewrite or re-correct that cohort.

## Activation gate

Before adding `refund.created` to the provider subscription, TraceKit must prove: exact ORD order linkage; webhook replay idempotency; no cross-surface duplicate financial effect; pending refunds cannot post; and durable secure storage for the replacement subscription secret. Subscription mutation remains a separate milestone.

# Commas dispute contract and financial firewall

## Provider confirmed

| Capability | Live dispute webhook | Historical seller export |
| --- | --- | --- |
| Numeric Commas transaction identity | Not exposed yet | Available; authoritative join |
| Public ORD identity | Not exposed yet | Available from 2026-06-04 onward; supporting identity |
| Currency | USD-only platform contract; no payload currency field | USD-only platform contract |
| Dispute amount and fee | `data.amount`, `data.dispute_fee`; descriptive | Dispute data available |
| `data.total_amount` | `amount + dispute_fee`, descriptive; **not a wallet debit** | Not a wallet movement identity |
| Actual wallet debit | Not exposed; may include principal and fee, principal only, or no debit | Debit amounts and timestamps available |
| Won recovery credit | Not exposed by webhook, endpoint, or API; seller wallet only | Recovery amounts and timestamps available |
| Stable economic entry ID | Not exposed | Not available today |
| Lifecycle | Full-state `dispute.updated` snapshots | Status and lifecycle timestamps available |

Numeric transaction ID is authoritative for dispute-to-commerce identity. `data.payment_intent_id` is legacy/supporting and must not establish an order link. Commas says a future webhook identity field will follow the convention of `refund.created.original_payment_id`; its field name and availability are **not** specified. January through early June historical rows may have numeric transaction ID without ORD; numeric ID is sufficient for exact order identity.

Commas may record multiple wallet debits or multiple recovery credits for one dispute. A provider webhook event ID is a stable redelivery dedupe key, not an economic movement ID. Neither `dispute_id + movement_type` nor an amount/timestamp alone is sufficient financial idempotency. Historical export artifact and row provenance could identify an import observation, but would not become a stable provider ledger entry ID. Financial posting from either live events or historical export remains blocked pending a separately reviewed movement-identity and correction contract. Never compute recovery from amount, total, fee, or seller commission. A lost status does not itself create another debit.

The requested historical export range is 2026-01-01 through at least 2026-08-23. It can establish authoritative transaction identity and supply wallet movement amounts/timestamps; it does not yet authorize financial posting.

## TraceKit design decision

The latest-state projection uses provider status progression for the observed `needs_response`/`warning_needs_response` (open), `under_review`/`warning_under_review`, and terminal `won` or `lost` stages. The warning-variant progression is present in retained lifecycle history. An unknown status transition is held as ambiguous. A higher stage may advance despite an equal or older `data.updated_at`; a lower stage cannot regress it. At the same stage, `data.updated_at` orders snapshots; equal timestamps with different normalized state remain ambiguous. `won` and `lost` are siblings: a conflict never chooses a winner by timestamp, top-level `created_at`, receive time, or event ID. `created_at` is emission time; delivery order is not provider-state order. No provider sequence/version exists.

Every provider event and restricted Evidence object remains retained independently of latest-state projection. Webhook processing creates lifecycle history but does not create dispute wallet debits or recovery credits. USD is taken from the explicit Commas platform contract, never a generic missing-currency fallback. The chargeback UI must describe dispute amounts as dispute values, not realized seller-wallet movements.

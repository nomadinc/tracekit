# Commas dispute order resolver preparation

Status: PREPARED FOR REVIEW, NOT ENABLED. WS-022 retains release authority. Commas' new numeric transaction/public ORD fields are reported as in review, not live. Field names and semantics have not been verified.

The pure resolver accepts generic normalized numericTransactionId/publicOrderId inputs, not guessed payload paths. No router, normalizer, repository, database function, customer read model or scheduled job imports it. It performs no I/O or financial posting. Existing production behavior is unchanged.

## Resolver boundaries

- Verified retained provider evidence and a complete lookup are required.
- Organization, connection and provider account must match for every supplied lookup row.
- Numeric identifiers reject unsafe JS integers, malformed strings, zero and payment-intent IDs. Preserve numeric identifiers as strings before precision can be lost.
- Only active authoritative exact source mappings qualify. Customer, email, amount, timestamp and payment-intent similarity do not qualify.
- When both IDs are supplied, each must resolve uniquely and they must agree. One unresolved identifier holds the event even if the other resolves.
- Either ID alone can establish a relationship when the other is absent.
- Multiple mappings to different orders are a conflict. Repeated identical mappings do not invent ambiguity.
- Existing links to another order are held, including suggested links, rather than silently overwritten.

The identity-only update planner recomputes resolution from the current input and supplied mappings; it does not accept detached precomputed decisions. It returns only matched_canonical_order_id and reconciliation_state. It never emits status, amount, fee, currency or wallet-loss changes. A replay after the same exact link is established returns noop. The current projection's tenant and provider dispute identity must also agree.

## Activation prerequisites

1. Commas confirms deployment and exact numeric/ORD field paths for both dispute.created and dispute.updated.
2. Retain and hash-verify scoped real payload evidence; confirm the numeric/public identities map to the intended existing order.
3. Build the adapter using complete scoped existing source mappings. The supplied mapping authoritative flag is a trusted adapter contract, not proof by itself.
4. Under a shared lock or compare-and-swap, recheck evidence, both mappings and current relationship. Persist an append-only identity audit and update only identity/reconciliation fields. This pure module does not supply database concurrency guarantees.
5. Route identity-only enrichment separately from lifecycle advancement. An old/equal-timestamp snapshot may add a verified relationship without replacing newer status or other state.
6. Verify existing order-to-person/TKID relationships and the authorized customer journey read path. Do not invent a TKID if the linked order has none.
7. Ask whether existing disputes receive identifiers through future updates or supported replay. Retained legacy events without authoritative IDs stay unresolved.
8. Obtain release approval, then deploy and verify end-to-end. Do not enable wallet posting.

Currency API preparation remains in PR #569; source/affiliate monetary aggregation remains uncertified. Accufy's offers remain fixed. TKID setup for future clients is separately documented in the onboarding recipe.

## Validation

Node 24 command: node --test api/src/commas-dispute-order-resolver.test.ts

14 passed, 0 failed, 0 skipped. Covers dual/single identifiers, missing or malformed IDs, tenant isolation, ambiguity, incomplete and heuristic lookup denial, unsafe integers, status-preserving identity-only plans, replay, conflicting existing links and mismatched dispute projections. Additional cases verify stale evidence denial, every projection scope dimension, and older/equal evidence planning without terminal lifecycle or financial mutations. These are pure planner tests, not runtime lifecycle integration tests.

Database atomicity, live payload binding, customer journey end-to-end acceptance and historical replay have not been tested or certified.

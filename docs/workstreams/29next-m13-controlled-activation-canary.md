# WS-008 M13 — 29Next Controlled Activation, Webhook Characterization & Canary

Status: ACTIVE

## Mission

Move the 29Next connector from bounded manual validation into a controlled, observable activation path without skipping the remaining safety proof.

M13 is the first milestone allowed to prepare ongoing execution, but activation remains fail-closed until webhook signing semantics and readiness are proven.

## M12 lock

M12 is locked as PASS for bounded live ingestion and order canonical persistence.

Validated baseline:

- working Stem Labs connection: `3c9a11bf-d4bc-4328-b627-0808d0db5670`
- Supabase project: `joahiwgidfbzwzyslrbq`
- API version: `2024-04-01`
- live bounded orders: 10
- order Evidence rows for successful run: 10
- platform orders: 10
- order mappings: 10
- order lines: 18
- observed products: 4
- integrity defects: 0
- schedules: disabled
- webhook delivery: disabled

Rare-sample warnings carried forward:

- no live subscription sample was available in the bounded M12 read;
- no live dispute sample was available in the bounded M12 read.

These warnings remain visible but do not justify synthetic data.

## M13 activation sequence

M13 must proceed in this order.

### Gate 1 — Webhook delivery characterization

Create a non-production webhook capture/diagnostic path that:

- receives one real 29Next test delivery,
- preserves the exact received bytes for signature characterization,
- captures headers required for verification,
- does not route the event into canonical processing yet,
- does not acknowledge a signature mode as proven unless the captured signature validates,
- determines whether 29Next signs exact raw bytes or documented JSON reserialization,
- records only safe characterization metadata in operator output.

If the signing mode is `unknown`, activation remains blocked.

### Gate 2 — Readiness evaluation

Run the existing fail-closed activation-readiness evaluator with real evidence for:

- required migrations present/applied,
- API version pinned,
- orders/subscriptions/disputes read capability verified,
- bounded live reads completed,
- immutable Evidence persistence proven,
- canonical order persistence proven,
- webhook signature verification proven,
- webhook serialization mode known,
- no production execution already enabled prematurely.

The zero-sample subscription/dispute conditions must be represented as warnings, not fabricated proof.

### Gate 3 — Controlled schedule canary

Only after Gate 1 and Gate 2 pass:

- enable exactly one 29Next schedule target first;
- use the existing provider-neutral schedule/lease model;
- keep the initial window small and observable;
- require owner-checked lease/heartbeat behavior;
- prove checkpoint advancement only after successful persistence;
- prove incomplete/failure paths do not advance successful-through state;
- keep other 29Next resources disabled until the first resource canary is clean.

Initial recommendation: canary `orders` first because M12 already proved its live canonical path.

### Gate 4 — Webhook processing canary

After signature mode is proven and the existing webhook handler is configured with the verified mode:

- enable one non-production/live-test webhook path;
- preserve immutable receipt/evidence before routing;
- prove duplicate provider event IDs are acknowledged without duplicate canonical work;
- prove event/object mismatch fails closed;
- verify transaction/subscription/dispute routing remains isolated;
- keep provider mutation disabled.

### Gate 5 — Observe and reconcile

For the canary window, reconcile:

- provider reads vs sync run counts;
- Evidence vs canonical rows;
- duplicate/orphan counts;
- checkpoint state;
- schedule lease state;
- webhook receipt dedupe state;
- errors/retries;
- subscription/dispute warnings if samples are still absent.

No broad production rollout until this observation window is clean.

## Activation invariants

M13 must not:

- expose or log the 29Next API token or webhook signing secret;
- enable all schedules at once;
- activate webhook canonical routing before signature characterization succeeds;
- mutate provider orders, subscriptions, disputes, or payments;
- infer subscription/dispute success from zero-record samples;
- change Shopify, Everflow, or Commas runtime behavior;
- bypass tenancy, provider-account scope, leases, or Evidence-first persistence.

## First build task

Implement the **non-production webhook capture + signature-characterization operator surface**.

Acceptance criteria:

1. exact request bytes are available to the characterizer;
2. signature header is captured without exposing the signing secret;
3. raw-byte and documented JSON-reserialization modes are tested against the real delivery;
4. `unknown` remains fail-closed;
5. captured events are diagnostic-only and cannot enter canonical processing;
6. a concise operator result reports mode, verification result, provider event identity if safely available, and timestamp;
7. regression tests prove malformed/missing signatures fail closed and diagnostic capture cannot activate normal webhook routing.

## M13 completion criteria

M13 is complete only when:

- real webhook signing semantics are characterized;
- readiness gate passes with real evidence and explicit rare-sample warnings;
- one schedule canary completes cleanly;
- one webhook processing canary completes cleanly;
- reconciliation shows no unexplained duplicates/orphans/checkpoint advancement;
- ongoing execution remains scoped and reversible.

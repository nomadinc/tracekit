# WS-001 bounded refund recovery

Status: implementation of read-only eligibility planner; execution blocked on authoritative cross-surface refund identity mappings.

The October 13 UTC production assessment found nine distinct successful webhook refund observations (eight full, one partial), with exact ORD order relationships, valid retained evidence references/hashes and matching seller-cost component arithmetic. No embedded refund or refund ledger row existed on those nine orders when inspected. This is an as-of observation, not proof against future page deliveries.

The existing provider-confirmed contract documents USD and seller loss as `refund_cost`, excluding affiliate clawback. Existing transaction-page ingestion remains the economic owner because this account has no forward ownership epoch. A retroactive epoch would affect every refund after its timestamp, not only these nine. Do not create one to bypass this recovery gate.

`ui/lib/commerce/commas-refund-recovery-plan.ts` evaluates an explicit bounded identity list. It rejects cross-scope input, duplicate observations/refunds, ambiguous numeric bridges, invalid ledger inspections, nonfinal outcomes, unverified evidence, unknown currency contracts, inconsistent monetary components and existing economics. Monetary comparisons use exact integer cents.

No production execution route or database mutation is added. An eligible plan alone is not execution authorization or database proof.

## Required provider evidence

For each exact retained webhook refund hashid, obtain its corresponding numeric `transactions[].refunds[].id`, with the original ORD parent relationship and authoritative evidence. Similar timestamps and equal amounts cannot establish this bridge. Never decode provider hashids heuristically.

## Execution contract after identity proof

1. Register an immutable, scoped recovery manifest with the authoritative bridge and retained evidence references.
2. Claim economic ownership per exact refund identity atomically. Transaction-page ingestion must consult that claim before both refund and fee posting while continuing to retain raw/source evidence.
3. Coordinate page ingestion and recovery using the same lock boundary; recheck existing economics and evidence under lock. Do not alter historical processing counters or unrelated refunds.
4. Post `-refund_cost` once, preserving the successful webhook identity. Do not add creator earnings, processor fee or affiliate clawback again.
5. Append the audit and update the observation atomically; test concurrent delivery and replay, rollback, exact scope denial and existing transaction-page effects.
6. Verify qualified customer reporting independently of ledger insertion.

## Attribution finding

Observation `edac7ca5-9bc5-4700-a4c9-51d0b40f4e84` has consistent checkout TID aliases and an exact Commas order relationship. The scoped retained Everflow click and five conversion records disagree with checkout `sub4`; affiliate IDs agree. Keep both source versions and the conflict. This assessment does not justify overwriting attribution or reclassifying it as an exact match.

## Validation

Run `node --test ui/tests/ws001-commas-refund-recovery-plan.test.ts` on Node 24. Five focused tests cover the eligibility and isolation boundaries. Live posting, database concurrency and customer financial acceptance remain unpassed because no executor has been enabled.

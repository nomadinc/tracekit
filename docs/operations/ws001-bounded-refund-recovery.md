# WS-001 bounded refund recovery

Status: the nine October 12 candidates are excluded as provider-reported test data. Recovery execution remains disabled.

## Test-data disposition, 2026-10-13

The user reported that the Commas team confirmed the nine refund candidates were test data and had deleted them from the provider system. This is recorded as `user_report_of_provider_confirmation`; the original provider confirmation has not been supplied. Provider deletion was not independently verified by TraceKit.

Exact retained refund hashids: `1w2qq`, `9rlBz`, `ADwrj`, `pYEVm`, `QWQm5`, `W6Zvo`, `YE2xY`, `Z63yg`, `zpRA2`. Scope: Accufy organization `c98d44be-5f7f-41a2-a9d3-ae67a811a872`, Commas connection `8030cf89-88f3-433f-99ec-c2083c4e5698`, provider account `dd3506d5-3417-4086-8623-9f8ec6b81694`.

Production exclusion records were added to `commerce_refund_created_exclusions` after locking and verifying exactly nine observations and checking that none had financial entries associated with their webhook evidence or refund.created posting key. These records reference the retained observation IDs. Original webhook status, amounts, evidence, and payload hashes are preserved. Normal observation replay cannot remove the separate exclusion.

Migration `20261013175844_commas_refund_created_test_data_exclusions.sql` adds a restricted exclusion audit table and an early exclusion check to `post_commas_refund_created_seller_cost_v1`, before epoch selection and ledger insertion. The server role can read and append exclusions but cannot update or delete them. No ownership epoch was activated and no financial entries were created.

Production validation on 2026-10-13 around 17:59 UTC: nine exclusions, nine intact scoped evidence references/hashes, nine posting calls refused, zero associated refund ledger rows. RLS enabled; anon/authenticated denied table reads; service-role update/delete denied. The advisor's INFO notice about RLS without policies is expected for this server-only table with no browser-role grants.

The nine no longer require numeric refund identity bridges for recovery. Candidate numeric IDs from the external MCP report remain unverified and are not registered as source mappings. The read-only inspector buttons retain their diagnostic purpose; they do not override exclusions. Future recovery candidate selection must anti-join exclusions before invoking the pure planner.

## Prior assessment and future recovery boundaries

Before the provider report, the nine observations appeared successful (eight full, one partial) and had exact ORD order relationships, valid retained evidence and consistent seller-cost arithmetic. Those checks did not establish genuine production economics.

The provider-confirmed contract documents USD and seller loss as `refund_cost`, excluding affiliate clawback. Transaction-page ingestion remains the economic owner because this account has no forward ownership epoch. Do not create a retroactive epoch to bypass recovery gates.

`ui/lib/commerce/commas-refund-recovery-plan.ts` is a pure, read-only bounded eligibility planner. It rejects cross-scope inputs, duplicates, ambiguous numeric bridges, invalid inspections, nonfinal outcomes, unverified evidence, unknown currency contracts, inconsistent monetary components and existing economics. Exact integer cents are used. No recovery executor is enabled.

For any future genuine recovery cohort, require authoritative webhook refund hashid ↔ numeric refund identity evidence, an immutable scoped manifest, shared locking and per-refund ownership with transaction-page ingestion, atomic posting/audit, concurrency/replay/rollback tests, and independent customer reporting acceptance. Amounts, timestamps and one-refund-per-order cardinality cannot prove identity.

## Remaining customer financial work

The scoped production dispute refresh on 2026-10-13 found 530 disputes, zero linked orders, 530 legacy payment-intent references and zero numeric/public order identifiers. This supersedes the earlier count of 527. The existing provider contract says the historical seller export can supply authoritative numeric transaction identity, supporting ORD identity and actual wallet movement amounts/timestamps. Obtain that export and inspect it using the existing preview/import boundary. A payment-intent reference must not establish an order link.

Dispute financial posting remains blocked: wallet debit/recovery movement identities and a correction contract are still required. Dispute face value, fee and won/lost status cannot substitute for actual wallet movements. See `docs/commas-dispute-provider-contract.md`.

Customer financial completeness is not certified by closing this test-data cohort. The Everflow unmatched candidate cohort, attribution conflict and missing/invalid source contacts remain separate findings.

## Attribution finding

Observation `edac7ca5-9bc5-4700-a4c9-51d0b40f4e84` has consistent checkout TID aliases and an exact Commas order relationship. The scoped retained Everflow click and five conversion records disagree with checkout `sub4`; affiliate IDs agree. Keep both sources and the conflict.

## Validation

The existing pure planner has five focused tests. Live recovery execution, database concurrency and customer financial acceptance remain unpassed because no executor has been enabled. The exclusion guard has been checked directly against the nine production observations without posting economics.

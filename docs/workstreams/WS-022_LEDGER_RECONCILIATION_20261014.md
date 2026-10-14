# WS-022 exact remaining-failure reconciliation

Status: REVIEW / Production V1 HOLD. No remote mutation, push, merge, deployment, database operation, invitation, or provider action.

## Completed

Recovered the authoritative historical 163-row ledger from the independently accepted PR570 M10 evidence archive. Preserved its statuses: 130 resolved / 33 unresolved. The supplemental accepted chargeback race finding remains separately resolved.

Fresh Git fetch confirms main 57eaec27, PR569 9fe121aa, PR570 550c030b and PR571 18198adc. No new heads integrated. Current code candidate before this correction was 3283b01f; documentation commit was 31351821.

API clean install passed. A full API run exposed one previously missed tooling assertion: the shared interval picker test expected Tailwind 3 dark:[color-scheme:dark] after the source was migrated to Tailwind 4 dark:scheme-dark. Corrected only that source assertion at 6092237b; all labels, dark colors, selected state, focus ring and From/To handlers remain asserted. Verified actual generated CSS contains .dark\:scheme-dark:is(.dark *){color-scheme:dark}. No runtime edit or weaker behavior requirement.

Targeted picker check passes. Final complete API suite on 6092237b: 1,099 passed / nine failed / four skipped. The four schema-dependent local skips do not revoke earlier accepted WS024 disposable-database evidence and are not represented as freshly executed here. UI suite remains the prior exact runtime-tree result: 1,399 passed / 24 failed / zero skipped; this API-test-only correction does not require another UI/build run.

The union of current 24 UI and nine API failing test names equals the ledger's 33 unresolved entries exactly. Zero new/unmatched failures and zero unresolved ledger names absent from the run. File-load failures remain explicit rows; they are not equivalent to running their child tests.

## Owner boundaries

| Existing owner boundary | Unresolved rows | Required next action |
|---|---:|---|
| WS-001 | 28 (19 UI, nine API) | Review Core/runtime, commerce mapping, scheduler bounds, Everflow identity/retry, Shopify and Meta route contracts; submit exact-commit closure evidence. |
| WS-004 / Core Edge/privacy | Four UI | Confirm service credential/tenant-binding model; behaviorally verify denial/redaction; correct canonical payload fixture handling without weakening raw-IP rejection. |
| Core/UI infrastructure | One UI file-load failure | Name the Meta implementation owner and resolve missing panel/page prerequisites while keeping the integration inactive. |

Existing release-owner boundaries are carried forward; these are not new personal assignments or claims of owner acceptance. Prepared separate review packets with exact names, source locations and acceptance criteria. Packets are drafts and were not sent.

## Material findings requiring owner review

The Edge delivery source uses a global service credential plus separately resolved tenant binding, whereas its old test expects tenant/org directly on the credential. This is a trust-model decision, not a cosmetic test rewrite. Nested raw-IP test currently attempts to add a property to string 1.0, suggesting fixture-container shape mismatch; retain privacy negatives when corrected.

Scheduled queue bounds include a missing-expected-exception failure. Do not classify it as stale without runtime boundary review. Migration assertions include absent historical paths and missing expected numeric versions; authoritative replay evidence does not automatically correct or waive those tests. Meta files and routes remain missing/inactive. Chargeback affiliate/source reporting stays held for financial authority, and PR569 remains a separate dependency.

## Release disposition

No historical ledger item was closed by this reconciliation. Supplemental tooling-picker assertion is resolved at 6092237b. Five high UI dev-tooling audit records (one braces advisory) and ESLint peer compatibility remain open, as documented in the security disposition. Production and merge gates remain HOLD.

Evidence and exact row positions are in validation/ws022-ledger-reconciliation-20261014. Row positions are one-based positions in the recovered historical ledger, not newly invented external issue IDs.

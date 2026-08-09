# Accufy Evidence-Window Denominator Audit — Version 3

## Result

Investigation Version 2 compared 40,228 attributed Orders with 74,493 all-time Commas Orders. That 54.00% figure is mixed-evidence coverage, not a valid primary attribution-quality denominator. Everflow does not cover the full Commas history.

Version 3 changes no reconciliation or Journey-propagation rule. It corrects the attribution eligibility cohort and preserves Version 2 unchanged.

## Persisted Evidence windows

The Commas Order evidence contains 74,493 Orders from `2025-09-20T21:00:34Z` through `2026-08-08T04:47:51Z`.

The imported Everflow report contains 69,569 events. Its conversion timestamps range from `2026-04-01T07:06:16Z` through `2026-08-08T00:20:53Z` as parsed from the timezone-naive report. Click timestamps range from `2025-09-13T17:37:21Z` through `2026-08-07T23:40:12Z`; earlier clicks can precede report-period conversions and therefore do not define Order attribution eligibility.

The approved `everflow-commerce-v2` rule subtracts 180 minutes from conversion timestamps, allows a two-minute direct Order-match tolerance, and permits uniquely claimed downstream Journey propagation for ten minutes. The inclusive Order eligibility interval is consequently:

- start: `2026-04-01T04:04:16Z`;
- end: `2026-08-07T21:30:53Z`.

These are partial UTC boundary days. The exact instants—not whole calendar days—control eligibility. This interval includes all 40,228 existing V2 Order links, including five valid links that fall just outside the unexpanded normalized conversion extrema.

## Corrected Order attribution

| Classification | Orders |
| --- | ---: |
| All-time Commas Orders | 74,493 |
| Attribution-eligible Orders | 50,103 |
| Outside attribution Evidence window | 24,390 |
| Order-linked eligible (`inferred` V2 provenance) | 36,076 |
| Propagated within Journey eligible | 4,152 |
| Total attributed eligible | 40,228 |
| Unattributed eligible | 9,875 |

Eligible Order attribution is **80.29%**. The previous 54.00% remains an explicitly labeled all-time/mixed-evidence diagnostic only. The previous statement that 46% of Commerce Orders were unattributed was analytically misleading: 24,390 Orders had no historical Everflow coverage opportunity.

Needs-review is retained at Everflow Journey/event level. The persisted V2 model does not assign ambiguous Journey claims to canonical Orders, so there is no separate defensible needs-review Order count; those eligible Orders remain without attribution rather than receiving a guessed attachment.

## OTO2 audit

| Classification | OTO2 Orders |
| --- | ---: |
| All-time | 2,968 |
| Attribution eligible | 1,727 |
| Outside attribution Evidence window | 1,241 |
| Order-linked eligible | 3 |
| Propagated within Journey eligible | 210 |
| Total attributed eligible | 213 |
| Unattributed eligible | 1,514 |

Eligible OTO2 attribution is **12.33%**. The numerator was already inside the valid window, but `213 / 2,968` mixed eligible and ineligible history. The corrected denominator does not remove the analytical warning: OTO2 affiliate coverage remains insufficient for affiliate-controlled conclusions.

## Metric audit

- **Dispute reconciliation coverage — VALID AS-IS.** It compares the historical dispute export with Commerce candidates and does not use Everflow availability as its denominator.
- **Everflow Journey reconciliation coverage — VALID AS-IS.** Both numerator and denominator are Everflow Journeys from the same import.
- **Order attribution coverage — DENOMINATOR CORRECTED.** Primary coverage is now 40,228 / 50,103 eligible Orders (80.29%).
- **OTO2 affiliate attribution — DENOMINATOR CORRECTED.** It is now 213 / 1,727 eligible OTO2 Orders (12.33%); 1,241 are outside the source window.
- **Product affiliate attribution — DENOMINATOR CORRECTED where presented as coverage.** Product coverage must use Product Orders inside the same eligibility interval.
- **Pear Media, Nandi, and other-Pear incidence — VALID AS-IS.** Their denominators are already Journey-attributed Orders from the comparable Everflow period.
- **Affiliate dispute rates and rankings — VALID AS-IS.** They operate on attributed Orders rather than all-time Commerce Orders.
- **Multi-charge Journey comparison — VALID AS-IS.** The published rates are derived from linked historical Journey cohorts and are not divided by all-time Orders.
- **OTO2 Commerce dispute rate and Product concentration — VALID AS-IS.** These are all-time Commerce-only observations. They remain separate from affiliate coverage.
- **Executive finding — VALID AS-IS with corrected supporting coverage language.** The Nandi control result and OTO2 Commerce risk signal do not change.
- **Evidence Quality and warnings — DENOMINATOR CORRECTED.** They now distinguish eligible attribution, eligible-but-unattributed Orders, and Orders outside source coverage.

## Finding impact

- Nandi not uniquely elevated versus other Pear: **UNCHANGED**.
- Pear Media dispute incidence: **UNCHANGED**.
- OTO2 as the strongest unresolved Commerce signal: **UNCHANGED**.
- OTO2 affiliate attribution insufficient for causation: **STRENGTHENED analytically** because the denominator is now valid, while 12.33% eligible coverage remains clearly insufficient.
- Multi-charge Journey correlation: **UNCHANGED**.

## Main Product + OTO2 linked-Journey check

As a bounded follow-up, the audit examined only persisted `everflow-commerce-v2` acquisition Journeys containing both `Push Button System` and `OTO2-platinum`. This is an attribution-covered subset of 210 Journeys and must not be generalized to all 2,968 all-time OTO2 Orders. The cohort contains 423 distinct charges and no Order claimed across multiple Journeys.

| Charge dispute outcome | Journeys | Share |
| --- | ---: | ---: |
| OTO2 disputed; main charge undisputed | 12 | 5.71% |
| Main charge disputed; OTO2 undisputed | 2 | 0.95% |
| Both charges disputed | 40 | 19.05% |
| Neither charge disputed | 156 | 74.29% |

Among the 52 Journeys with an OTO2 dispute, 12 (23.08%) leave the main charge undisputed and 40 (76.92%) dispute both. This is an observation, not evidence that either charge caused the other dispute.

Average total charged value was $414.58 for OTO2-only disputed Journeys, $476.50 for main-only, $452.50 for both disputed, and $452.51 for neither. The near-identical both/neither averages weaken total charged amount as a stand-alone explanation in this bounded cohort.

OTO2-only disputes contain $3,588.00 disputed evidence and $491.56 in dispute fees. Their median lag is 15.59 days and average lag is 20.57 days. Both-disputed Journeys contain $18,940.00 disputed evidence and $3,277.60 in fees; OTO2 dispute rows have median/average lags of 16.81/22.68 days and main-charge dispute rows 17.73/25.36 days. The two main-only Journeys contain $355.00 disputed evidence, $74.20 in fees, and a 26.39-day lag.

No OTO2 refund was observed in any disputed category. One OTO2-only-disputed Journey had a $106 main-charge refund. In the neither-disputed group, six OTO2 charges were refunded for $1,794 and six main charges for $883. Refund counts are small and do not support a causal claim.

Reason evidence differs descriptively. OTO2-only disputes split between `general` (5), fraud/unauthorized-family (5), `duplicate` (1), and unrecognized/cardholder-dispute family (1). In both-disputed Journeys, `general` dominates both OTO2 (32/41 dispute rows) and main charges (29/43); fraud/unauthorized-family accounts for 5 OTO2 and 9 main rows. The main-only result has only two rows (`credit_not_processed` and product-quality), too few for inference.

Version 3 is required because the immutable Version 2 presentation persisted a materially invalid primary denominator and warning. Version 2 remains preserved for auditability.

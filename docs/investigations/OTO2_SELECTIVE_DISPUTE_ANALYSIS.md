# OTO2 Selective Dispute Analysis

## Question and scope

Why do some defensibly linked `Push Button System` + `OTO2-platinum` acquisition Journeys dispute only OTO2 while comparable Journeys dispute neither charge?

This is a narrow child analysis of Accufy Investigation Version 3. It changes no reconciliation, attribution, propagation, or dispute rule. It uses persisted `everflow-commerce-v2` Journey links and `historical-v1` high/medium dispute matches. It is not generalized to all 2,968 all-time OTO2 Orders.

## Cohort integrity

The cohort remains 210 Journeys. Every Journey is single-Organization, single-Connection, single-Person, Evidence-linked, and inside the Version 3 attribution eligibility interval. No cohort Order is claimed by another Journey. The full linked Journey representation contains 625 Order links; the main/OTO2 subset contains the previously validated 423 distinct charges. Provenance remains 213 Order-linked (`inferred`) and 412 `propagated_within_journey` links.

- affected — OTO2 disputed, main undisputed: 12;
- primary control — neither disputed: 156;
- both disputed, descriptive: 40;
- main-only disputed, descriptive: 2.

The main-only sample is not used for inference.

## Charge timing

| Main → OTO2 | Affected (n=12) | Control (n=156) |
| --- | ---: | ---: |
| Mean | 5.72m | 6.95m |
| P25 | 4.00m | 5.32m |
| Median | 6.02m | 6.53m |
| P75 | 7.23m | 7.93m |
| P90 | 7.36m | 9.18m |

Affected Journeys are not unusually rapid. Four affected Journeys (33.3%) versus 31 controls (19.9%) fall in the 2–5 minute bucket; eight affected (66.7%) versus 124 controls (79.5%) fall in 5–10 minutes. Fisher's exact test for 2–5 minutes versus other timing is approximately 0.28. The overlap and small affected sample make this a **negative finding**, not a speed signal.

## Charge count and Product sequence

Affected Journeys average 2.92 linked charges; controls average 3.01. Eleven affected (91.7%) and 151 controls (96.8%) contain three charges. The two-charge stratum contains one affected and three controls and is too small to interpret. No affected Journey has a later charge after OTO2; a few controls do, but the records are isolated.

The leading sequence is the same:

- `Push Button System → OTO1-gold → OTO2-platinum`: affected 11/12 (91.7%); control 138/156 (88.5%);
- `Push Button System → OTO2-platinum`: affected 1/12 (8.3%); control 3/156 (1.9%).

The apparent second-sequence delta depends on one affected Journey and is fragile. Downsell variants occur only in controls, but no individual sequence has enough affected observations to support a differentiating claim. Charge-count stratification does not reveal an OTO2-only pattern independent of the dominant three-charge sequence.

## Amounts

| Total linked Journey amount | Affected | Control |
| --- | ---: | ---: |
| Mean | $686.83 | $734.17 |
| P25 | $663.00 | $687.00 |
| Median | $702.00 | $726.00 |
| P75 | $726.00 | $821.00 |
| P90 | $776.40 | $821.00 |

Cumulative amount through OTO2 has a median of $702 affected versus $726 control. Distributions overlap substantially. Affected Journeys are modestly lower-value, not higher-value. **Total amount is a negative finding** for explaining selective OTO2 disputes.

## Acquisition and traffic evidence

Affiliate coverage is 12/12 affected and 156/156 control. Campaign and creative fields contain only `N/A`; source ID is absent. Sub-ID coverage is 10/12 and 126/156 but fragments the affected sample.

Idea Clan represents 6/12 affected versus 55/156 controls (50.0% versus 35.3%, +14.7 percentage points). The two-sided exact result is approximately 0.36 and the remaining affected Journeys fragment across four affiliates. This is descriptive only. Source-controlled conclusions are not supported.

Traffic comparisons likewise do not establish a differentiator:

- mobile: 91.7% affected versus 87.8% control;
- iOS: 50.0% versus 56.4%; Android: 41.7% versus 33.3%;
- Chrome: 33.3% versus 24.4%; Facebook for iOS: 25.0% versus 32.1%;
- United States: 12/12 versus 154/156;
- Comcast: 4/12 versus 26/156; exact result approximately 0.23;
- Gmail domain: 8/12 versus 92/156;
- no session-IP reuse in either cohort;
- all 12 affected user-agent strings and cities are unique; control maximum reuse is 6 user-agent rows and 4 city rows.

Large-looking percentage deltas depend on 1–4 affected observations. Device, browser, network, geography, IP reuse, and time-of-day evidence do not provide a defensible distinguishing signal.

## Click and funnel timing

| Timing | Affected | Control |
| --- | ---: | ---: |
| Click → first purchase median | 44.84m | 32.69m |
| P25 / P75 | 32.75m / 48.21m | 16.58m / 46.41m |
| P90 | 57.38m | 57.93m |
| Click → OTO2 median | 50.13m | 39.13m |
| P25 / P75 | 37.10m / 54.63m | 23.02m / 53.53m |
| P90 | 64.28m | 66.20m |

Three control click timestamps produce greater-than-24-hour historical outliers, including one extreme record, so the unbounded control mean is not interpretable. Restricting the descriptive mean to under 24 hours gives 38.73 versus 35.79 minutes for click → first purchase and 44.45 versus 42.72 for click → OTO2. Affected Journeys do not move materially faster; if anything their median is slower, with strongly overlapping upper distributions.

## Refunds and main-charge retention

One affected Journey has a full $106 main-charge refund. It occurs 93.33 days after the main charge and after the OTO2 dispute. No affected OTO2 charge is refunded.

Six control Journeys have full OTO2 refunds totaling $1,794, and six have full main refunds totaling $883. Their median time-to-refund is 51.67 days. Additional control OTO1 refunds are present. Any-refund incidence is 1/12 affected versus 6/156 control; the exact result is approximately 0.41 and is too sparse to interpret.

All 12 affected main charges are undisputed by cohort definition. Eleven are also unrefunded and have no reversal ledger event through the available cutoff; report these as **main charge retained through available Evidence**. The twelfth was fully refunded after the OTO2 dispute. This is financial retention, not evidence of satisfaction or Product use.

## Dispute reasons and lag

Affected OTO2-only reasons validate as:

- `general`: 5;
- fraud/unauthorized family: 5;
- `duplicate`: 1;
- unrecognized/cardholder-dispute family: 1.

For both-disputed OTO2 rows, `general` is 32/41 and fraud/unauthorized is 5/41. The affected fraud/unauthorized share is 41.7% versus 12.2%; a two-sided exact comparison is approximately 0.036. Against all other defensibly matched OTO2 disputes it is 5/12 versus 141/722, approximately 0.069. An exploratory broader recognition-related grouping that combines fraud/unauthorized, duplicate, and unrecognized labels is 7/12, but this grouping is post hoc and must not erase the raw reasons.

This reason mix is the strongest observed cohort difference, but it remains a **correlation/hypothesis signal** because n=12, multiple dimensions were examined, `general` remains common, and no billing-descriptor or upsell-consent Evidence exists.

Affected OTO2 dispute lag is median 15.59 days and mean 20.57. Both-disputed OTO2 rows are median 16.81 and mean 22.68; all OTO2 disputes are median 19.86 and mean 28.17. Selective disputes arrive somewhat earlier than the all-OTO2 population but are very similar to both-disputed OTO2 charges. Lag therefore does not distinguish selective from broader linked OTO2 disputes strongly.

## Commerce history

Commerce history is all-time and remains separate from the Everflow attribution window.

- prior Orders: 2/12 affected versus 23/156 controls;
- median prior Orders: zero in both cohorts;
- prior refunds: zero in both cohorts;
- prior disputes: zero in both cohorts;
- prior OTO2 purchases: 0/12 versus 9/156, all nine historically undisputed;
- later repeat Orders: 2/12 versus 16/156.

The cohort contains 209 distinct People across 210 Journeys. The sparse, zero-heavy history does not distinguish the cohorts defensibly.

## Findings

### Observation

Twelve defensibly linked Journeys selectively dispute OTO2 while leaving the main charge undisputed; eleven main charges remain unrefunded and unreversed through available Evidence.

### Correlation

Selective OTO2 disputes contain a larger fraud/unauthorized reason share than both-disputed OTO2 charges. The small sample makes this provisional.

### Negative findings

- main → OTO2 timing does not materially differ;
- the dominant Product sequence is the same;
- charge count is almost identical;
- total Journey amount overlaps and is lower in the affected cohort;
- click-to-purchase is not faster;
- no defensible affiliate, device, browser, ISP, geography, or repeated-IP concentration differentiates the cohorts;
- refund and prior-customer-history evidence is too sparse to distinguish them;
- dispute lag is similar to both-disputed OTO2 charges.

### Strongest hypothesis

**Charge recognition or the historical OTO2 upsell experience may contribute to selective OTO2 disputes.** Supporting Evidence is selective retention of 11/12 main charges and the affected reason mix. Evidence against or limiting the hypothesis includes similar charge timing, sequence, charge count, lag, and traffic distributions; five affected reasons remain `general`; and no descriptor, disclosure, impression, acceptance, or confirmation Evidence exists. This is not a causal conclusion.

## Evidence gaps and prospective TKID requirements

The historical sources do not contain OTO2 impression identity, offer/copy version, price and terms displayed, CTA impression/accept/decline timestamps, explicit parent-child charge relationship, billing descriptor shown to the customer, confirmation-page event, funnel-step identity, cross-domain browser Journey continuity, support interactions, or Product consumption.

Prospective Journey Evidence should add/refine:

- immutable upsell impression ID and offer-version ID;
- Product/price/terms/recurring-status snapshot shown;
- CTA accept and decline timestamps;
- parent Order and parent payment reference;
- child charge/payment reference returned server-side;
- billing and merchant descriptor displayed before acceptance;
- confirmation-page and receipt-delivery events;
- funnel step and cross-domain Journey IDs;
- consent/disclosure version and Evidence hash;
- privacy-safe support-contact and Product-access milestones.

Migration 049 now provides the narrow parent/child contract. This reviewed result is materialized as the independent `OTO2 Selective Dispute Analysis` child, permanently branched from Accufy Version 3. The child has its own completed-with-warnings run, immutable Version 1, cohort-specific Evidence Quality, findings, and historical Evidence ceiling. It does not mutate or inherit Accufy findings, and replay reuses the same materialization identity.

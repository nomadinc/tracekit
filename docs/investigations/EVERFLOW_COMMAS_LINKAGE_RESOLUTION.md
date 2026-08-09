# Everflow ↔ Commas Linkage Resolution

Version: 2.0
Status: Shadow Evidence Review
Classification: **B — Journey Bridge Found**

## Executive finding

No shared deterministic Order identifier exists in the available historical Everflow and Commas evidence. A single equality between Everflow `adv4` and a Commas Refund ID was observed across 35,153 versus 2,576 distinct values. One isolated equality is not a bridge and is treated as a chance collision.

A materially stronger evidence bridge does exist. All 69,569 Everflow conversion and click timestamps are timezone-naive. Among 26,304 previously defensible contact/date/amount pairs, the Commas Order occurs at a median offset of approximately -180 minutes from the timestamp produced by the original local parser. The calibration is stable from April through July 2026: 25,565 pairs (97.19%) fall within two minutes of -180 minutes. The v2 historical rule is therefore explicitly limited to this report period:

> exact normalized contact + Everflow report timestamp minus 180 minutes + one unique Commas Order within 120 seconds

This is an evidence-calibrated historical rule, not a general Everflow timezone claim. It creates `inferred` provenance, never `direct` attribution.

V2 maps 65,308 events to one Order: 64,031 high-confidence and 1,277 medium-confidence. Another 1,623 events remain ambiguous and 2,638 unmatched. It links 35,809 of 37,829 Everflow transaction groups. Direct event-time evidence reaches 36,076 canonical Orders. A separately labeled, same-Person, uniquely claimed ten-minute Journey rule adds 4,152 `propagated_within_journey` links, bringing historical Journey coverage to 40,228 Orders. Forty-seven candidate Orders had competing Journeys and were not propagated.

## Evidence and safety boundary

The profiler reads the already protected source report and emits aggregate shape only. Opaque candidate values are hashed in memory. No identifier value, email, IP, URL, customer row, raw report row, or API credential is printed or stored in this document. The report remains outside Git. All reconciliation is Organization/Connection scoped and server-only. Repository activation remains empty.

## Identifier audit

The audit compared every identifier-capable Everflow field against Commas Transaction IDs, `servicePayment` references, Customer IDs, Product IDs, Refund IDs, and Refund payment IDs. It also inspected bounded URL/query/structured values.

- `transaction_id`: complete and stable inside the Everflow group, but zero Commas identifier equalities.
- `conversion_id`: unique per event and changes within multi-event groups; zero Commas equalities.
- `order_id`: 241 populated, all distinct; zero Commas equalities.
- `previous_transaction_id`: 107 populated / 101 distinct; zero Commas equalities.
- `adv1`–`adv5`, `sub1`–`sub5`, and `source_id`: no material Commas equality surface.
- `adv4`↔Commas Refund ID: one isolated equality; rejected as non-deterministic.
- `referer`, `offer_url`, and `origin`: no query parameters were present in the bounded parser output.
- No `c1`–`c5`, checkout/session ID, shared Order ID, Everflow transaction ID, or Commas payment reference was recovered from URLs or structured values.

## Everflow transaction-group semantics

The 69,569 events form 37,829 transaction groups. Of these, 30,198 have multiple event rows and the maximum is 23 events. `transaction_id`, click time, affiliate, offer, sub IDs, session IP, device, and campaign fields are stable within a group. `conversion_id` changes in all 30,198 multi-event groups. Event name is stable within every group; the observed event names are `Sale` (61,840 rows), `PUSH BUTTON SYSTEM` (6,824), and `Base` (905).

Only 267 groups have direct evidence for more than one Commas Order; the maximum is four. Therefore, multiple Everflow rows usually represent multiple conversion/event records for one acquisition group—not automatically separate Commerce charges. The evidence does establish that a minority of acquisition groups correspond to multiple Commas Orders, so the permanent model is Journey → one or more Orders rather than Everflow Transaction → exactly one Order.

## Monetary semantics

`revenue`, `payout`, and `sale_amount` are fully populated numeric fields. `sale_amount` has six observed values between 0 and 177 and varies inside 28,364 transaction groups. `revenue` has four values between 0 and 67 and is stable in 37,828 of 37,829 groups.

Among 65,308 uniquely time-linked events, `sale_amount` equals the Commas gross Order amount for 15,462 (23.67%). `revenue` equals it for 37,088 (56.79%). Every `sale_amount` equality is also a `revenue` equality; 28,220 linked events match neither field. The evidence rejects `sale_amount` as a reliable individual-charge identity key. `revenue` is more compatible but remains insufficient for identity. Whether either field is advertiser revenue, an event value, or another Everflow commercial measure remains unresolved; TraceKit preserves the source labels.

## Nandi forensics

V1 failed all 968 nandi transaction groups. Every group had contact evidence; 220 lacked an exact same-calendar-day Commerce candidate after the original timezone interpretation. The remaining 748 had no compatible `sale_amount`; there were zero exact `sale_amount` matches. A separate diagnostic found 487 `revenue` compatibilities, confirming that the earlier amount choice—not Customer identity—was the limiting factor. No shared identifier existed for any nandi group.

With the calibrated timestamp rule, 960 nandi Journeys link and eight remain review-required. The eight unresolved groups all have multiple contemporaneous candidates: five have two candidates, one has three, one has a two-candidate event plus an unmatched event, and one has two separate two-candidate events. They remain unattached.

The 960 linked Journeys connect to 968 direct Orders; eight Journeys have two direct Orders. The uniquely claimed ten-minute Journey rule adds 276 downstream Orders, producing 1,244 nandi Journey Orders. Of those, 103 have defensibly reconciled historical disputes (8.28%), representing 105 dispute rows, $17,372 disputed evidence, and $3,842.20 in dispute fees. Other Pear traffic has 2,382 Journey Orders and 231 disputed Orders (9.70%). This strengthens the negative finding that nandi is not uniquely elevated within Pear.

## Reconciliation hierarchy v2

1. Shared deterministic identifier: none found.
2. Exact contact + report-period calibrated timestamp + exactly one Order within 120 seconds: `inferred` Order link.
3. Same Person and Connection, after a uniquely anchored acquisition Order, within ten minutes, and claimed by exactly one Journey: `propagated_within_journey` link.
4. More than one contemporaneous Order or more than one claiming Journey: review-required.
5. No defensible candidate: unmatched.

Affiliate attribution is never copied across a Journey without the explicit propagation record, rule version, evidence factors, and competing-Journey count. Seven of 18 Orders linked to multiple direct Journeys carry conflicting affiliate evidence; consensus analytics exclude them.

## Investigation v1 versus v2

Order-level coverage grows from 12,917 Orders in v1 to 36,076 direct v2 Orders. Journey propagation increases the reviewable surface to 40,228 of 74,493 shadow Orders (54.00%). Everflow transaction-group coverage grows from 12,957 of 37,829 (34.25%) to 35,809 (94.66%).

The affiliate rankings change materially because v1 denominators were small. In v2, among affiliates with at least ten attributed Orders, the highest observed rates are Accio Ads LLC 34.04% (16/47), Offer Blueprint 27.43% (124/452), GuruMedia Int. Ltd 26.09% (12/46), Abracadabra (Cyprus) Ltd 19.44% (14/72), and Vertex Offers 16.92% (965/5,703). Small cohorts remain prominently labeled.

Highest dispute volumes are Idea Clan, Inc. (1,390 disputed Orders; $190,086), Vertex Offers (965; $98,662), Lagasca Ads Corp (731; $98,269), Pear Media LLC (334; $48,060), and josh goins (298; $40,724). This replaces the v1 volume order of Vertex, Idea Clan, and Lagasca.

Traffic fingerprint and click-to-purchase findings are unchanged because they derive from Everflow cohort distributions rather than Commerce attachment. The multi-charge correlation remains unchanged because it derives from Commerce Journeys. OTO2-platinum remains insufficiently attributable: only 213 of 2,968 Orders receive direct or propagated affiliate evidence, so affiliate-controlled causal claims remain blocked. Its raw historical dispute-rate observation is unchanged.

## Remaining evidence ceiling

The result is a strong Journey bridge, not a deterministic shared identifier. Material limits remain:

- 1,623 event rows have multiple contemporaneous Order candidates.
- 2,638 event rows are unmatched, including contact-null rows.
- 797 transaction groups need review and 1,223 are unmatched.
- `sale_amount` semantics remain unresolved.
- Timestamps are source-naive; the rule is calibrated only for the supplied April–August 2026 report.
- OTO2 and many later upsells remain unattributed because a ten-minute, same-Person propagation window cannot recover browser checkout intent.
- Historical evidence cannot prove which upstream click caused a downstream charge when multiple Journeys compete.

## Future TKID implications

Prospective first-party Journey evidence must carry an opaque Organization-bound Journey ID across landing, checkout, payment, and upsell domains; a one-time checkout handoff token; Everflow transaction/click references when permitted; provider Order and payment references returned server-side; event and session IDs; timezone-aware client and server timestamps; funnel/step/Product IDs; upsell impression/accept/reject events; and explicit parent/child Order relationships. Attribution provenance must remain `direct`, `propagated_within_journey`, `inferred`, or `unattributed`. These fields remove reliance on contact evidence and report-period timezone calibration.

## Complete 103-field profile

Null rate is rounded to two decimal places. Cardinality counts are aggregate-only; stability is measured across transaction groups where the field is populated. Categories are naming/evidence classifications, not provider-semantic claims.

| Field | Category | Observed types | Non-null | Null rate | Distinct | Cardinality | Stable groups | Varying groups |
|---|---|---:|---:|---:|---:|---|---:|---:|
| `conversion_status` | conversion/event | string | 69569 | 0% | 3 | low | 7686 | 30143 |
| `date` | timestamp | timestamp | 69569 | 0% | 67678 | near_unique | 8937 | 28892 |
| `click_date` | timestamp | timestamp | 69569 | 0% | 37719 | high | 37829 | 0 |
| `delta_hours` | timestamp | number, string | 69569 | 0% | 2170 | medium | 31442 | 6387 |
| `network_offer_id` | identity | number | 69569 | 0% | 30 | medium | 37829 | 0 |
| `network_offer_name` | unknown | string | 69569 | 0% | 30 | medium | 37829 | 0 |
| `network_affiliate_id` | affiliate | number | 69569 | 0% | 51 | medium | 37829 | 0 |
| `network_affiliate_name` | affiliate | string, url | 69569 | 0% | 51 | medium | 37829 | 0 |
| `revenue` | amount | number | 69569 | 0% | 4 | low | 37828 | 1 |
| `payout` | amount | number | 69569 | 0% | 9 | low | 37813 | 16 |
| `conversion_user_ip` | network | string | 69569 | 0% | 27742 | high | 9442 | 28387 |
| `session_user_ip` | network | string | 69569 | 0% | 35820 | high | 37829 | 0 |
| `transaction_id` | transaction | string | 69569 | 0% | 37829 | high | 37829 | 0 |
| `adv1` | metadata | number, string | 68777 | 1.14% | 8392 | medium | 36380 | 1103 |
| `adv2` | metadata | boolean, string, timestamp | 68815 | 1.08% | 19499 | high | 36336 | 1151 |
| `adv3` | metadata | number, string | 39209 | 43.64% | 34991 | high | 36941 | 76 |
| `adv4` | metadata | number, string | 39467 | 43.27% | 35153 | high | 37233 | 38 |
| `adv5` | metadata | string | 60 | 99.91% | 19 | high | 34 | 0 |
| `brand` | metadata | string | 69569 | 0% | 84 | medium | 37829 | 0 |
| `browser` | device | string | 69032 | 0.77% | 53 | medium | 37546 | 0 |
| `carrier` | network | string | 13588 | 80.47% | 17 | low | 7372 | 0 |
| `country` | geography | string | 69569 | 0% | 38 | medium | 37829 | 0 |
| `device_type` | device | string | 69569 | 0% | 3 | low | 37829 | 0 |
| `error_code` | metadata | number | 69569 | 0% | 4 | low | 7632 | 30197 |
| `error_message` | metadata | string | 69569 | 0% | 4 | low | 7632 | 30197 |
| `event_name` | conversion/event | string | 69569 | 0% | 3 | low | 37829 | 0 |
| `email` | customer/contact | string | 69061 | 0.73% | 37026 | high | 36133 | 1597 |
| `notes` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `platform` | device | string | 69569 | 0% | 7 | low | 37829 | 0 |
| `sub1` | sub-ID | number, string, timestamp | 58625 | 15.73% | 7277 | medium | 32099 | 0 |
| `sub2` | sub-ID | number, string | 55642 | 20.02% | 28614 | high | 30057 | 0 |
| `sub3` | sub-ID | number, string | 4653 | 93.31% | 661 | medium | 2531 | 0 |
| `sub5` | sub-ID | number, string | 11731 | 83.14% | 6433 | high | 6555 | 0 |
| `order_id` | checkout | number | 241 | 99.65% | 241 | near_unique | 241 | 0 |
| `order_number` | checkout |  | 0 | 100% | 0 | none | 0 | 0 |
| `isp` | network | string, timestamp | 69569 | 0% | 1170 | medium | 37829 | 0 |
| `referer` | URL | string | 49172 | 29.32% | 338 | medium | 26479 | 0 |
| `app_id` | identity |  | 0 | 100% | 0 | none | 0 | 0 |
| `dma` | geography | number | 69569 | 0% | 15 | low | 37829 | 0 |
| `network_offer_url_id` | URL | number | 69569 | 0% | 7 | low | 37829 | 0 |
| `offer_url` | URL | string | 69569 | 0% | 5 | low | 37829 | 0 |
| `attribution_method` | click | string | 69569 | 0% | 3 | low | 9454 | 28375 |
| `adv6` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `adv7` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `adv8` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `adv9` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `adv10` | metadata |  | 0 | 100% | 0 | none | 0 | 0 |
| `sub6` | sub-ID |  | 0 | 100% | 0 | none | 0 | 0 |
| `sub7` | sub-ID |  | 0 | 100% | 0 | none | 0 | 0 |
| `sub8` | sub-ID |  | 0 | 100% | 0 | none | 0 | 0 |
| `sub9` | sub-ID |  | 0 | 100% | 0 | none | 0 | 0 |
| `sub10` | sub-ID |  | 0 | 100% | 0 | none | 0 | 0 |
| `account_manager_id` | affiliate | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `account_manager_name` | affiliate | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `android_id` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `android_id_md5` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `android_id_sha1` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `network_advertiser_id` | identity | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `network_advertiser_name` | unknown | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `category_id` | identity | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `category_name` | metadata | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `city` | geography | string | 69569 | 0% | 5978 | medium | 37829 | 0 |
| `conversion_id` | conversion/event | string | 69569 | 0% | 69569 | near_unique | 7631 | 30198 |
| `is_cookie_based` | click | number | 69569 | 0% | 2 | low | 9454 | 28375 |
| `country_code` | geography | string | 69569 | 0% | 38 | medium | 37829 | 0 |
| `coupon_code` | checkout |  | 0 | 100% | 0 | none | 0 | 0 |
| `network_offer_creative_id` | campaign | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `creative` | campaign | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `currency_id` | identity | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `google_ad_id` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `google_ad_id_md5` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `google_ad_id_sha1` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `http_user_agent` | device | string, timestamp | 69569 | 0% | 16701 | high | 37829 | 0 |
| `idfa_md5` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `idfa_sha1` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `idfa` | device |  | 0 | 100% | 0 | none | 0 | 0 |
| `is_event_protected` | conversion/event | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `is_scrub` | conversion/event | number | 69569 | 0% | 2 | low | 31549 | 6280 |
| `language` | device | string | 69566 | 0% | 18 | low | 37827 | 0 |
| `network_id` | identity | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `network_offer_group_id` | identity | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `network_offer_group_name` | unknown | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `order_line_items` | checkout |  | 0 | 100% | 0 | none | 0 | 0 |
| `origin` | URL | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `os_version` | device | number | 59666 | 14.23% | 86 | medium | 32369 | 0 |
| `affiliate_manager_id` | affiliate | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `affiliate_manager_name` | affiliate | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `payout_type` | amount | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `is_fired_pixel` | click | number | 69569 | 0% | 2 | low | 37827 | 2 |
| `previous_network_offer_id` | identity | number | 69569 | 0% | 7 | low | 37829 | 0 |
| `previous_network_offer_name` | metadata | string | 69569 | 0% | 7 | low | 37829 | 0 |
| `previous_transaction_id` | transaction | string | 107 | 99.85% | 101 | high | 101 | 0 |
| `project_id` | identity |  | 0 | 100% | 0 | none | 0 | 0 |
| `region` | geography | string | 69543 | 0.04% | 137 | medium | 37813 | 0 |
| `network_offer_payout_revenue_id` | amount | number | 69569 | 0% | 1 | constant | 37829 | 0 |
| `revenue_type` | amount | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `sale_amount` | amount | number | 69569 | 0% | 6 | low | 9465 | 28364 |
| `network_campaign_id` | campaign | number | 69569 | 0% | 3 | low | 37829 | 0 |
| `network_campaign_name` | campaign | string | 69569 | 0% | 3 | low | 37829 | 0 |
| `source_id` | identity | number, string | 81 | 99.88% | 5 | low | 69 | 0 |
| `sub4` | sub-ID | string | 12071 | 82.65% | 5994 | high | 6737 | 0 |
| `type` | conversion/event | string | 69569 | 0% | 1 | constant | 37829 | 0 |
| `is_view_through` | click | number | 69569 | 0% | 1 | constant | 37829 | 0 |

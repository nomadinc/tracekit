# Accufy Chargeback Investigation

Version: 1.0
Status: Shadow Evidence Review
Analysis version: `chargeback-investigation-v1`

## Executive summary

TraceKit found a large historical chargeback burden, but did not find evidence that the Pear Media LLC / `sub1=nandi` cohort explains the account-wide outcome. The earlier manual source counts were reproduced exactly: 1,389 Everflow events, 968 unique transaction IDs, and 969 unique email values. The prior approximate 16.8% incidence depended on broad contact matching. Under the stricter contact plus bounded transaction-date rule, 32 nandi transactions have one unique dispute candidate, 39 are ambiguous, and 897 have none. This strict unique-candidate incidence is 3.31%, versus 6.19% for other Pear traffic; it is not a canonical Order dispute rate because the Everflow-to-Commerce bridge remains incomplete.

The strongest account-wide correlation is journey shape. Ten-minute purchase sessions containing one charge had an 11.29% disputed-session rate; two-charge sessions 17.43%; three-charge sessions 21.38%. This does not establish that multiple charges cause disputes. OTO2-platinum remains elevated across one-, two-, and three-charge paths, so charge count alone does not explain its historical rate.

No new recent spike is established. Disputes received peaked in May 2026 (2,699), then declined in June (2,118) and July (1,737); August is partial. Among purchase cohorts matured at least 28 days, June was elevated at 18.71% versus April 13.37% and May 15.28%. “Recent disputes received” and “rate of recent acquisition cohorts” remain separate metrics.

## Source evidence and exact schema

The protected source is the Everflow report covering April 1 through August 7, 2026. It contains 69,569 conversion/event rows, 37,829 unique transaction IDs, 35,544 unique normalized email values, and zero parser rejects. It is stored as eight private immutable Evidence chunks; the CSV is not in Git.

Exact columns, in source order:

`conversion_status`, `date`, `click_date`, `delta_hours`, `network_offer_id`, `network_offer_name`, `network_affiliate_id`, `network_affiliate_name`, `revenue`, `payout`, `conversion_user_ip`, `session_user_ip`, `transaction_id`, `adv1`, `adv2`, `adv3`, `adv4`, `adv5`, `brand`, `browser`, `carrier`, `country`, `device_type`, `error_code`, `error_message`, `event_name`, `email`, `notes`, `platform`, `sub1`, `sub2`, `sub3`, `sub5`, `order_id`, `order_number`, `isp`, `referer`, `app_id`, `dma`, `network_offer_url_id`, `offer_url`, `attribution_method`, `adv6`, `adv7`, `adv8`, `adv9`, `adv10`, `sub6`, `sub7`, `sub8`, `sub9`, `sub10`, `account_manager_id`, `account_manager_name`, `android_id`, `android_id_md5`, `android_id_sha1`, `network_advertiser_id`, `network_advertiser_name`, `category_id`, `category_name`, `city`, `conversion_id`, `is_cookie_based`, `country_code`, `coupon_code`, `network_offer_creative_id`, `creative`, `currency_id`, `google_ad_id`, `google_ad_id_md5`, `google_ad_id_sha1`, `http_user_agent`, `idfa_md5`, `idfa_sha1`, `idfa`, `is_event_protected`, `is_scrub`, `language`, `network_id`, `network_offer_group_id`, `network_offer_group_name`, `order_line_items`, `origin`, `os_version`, `affiliate_manager_id`, `affiliate_manager_name`, `payout_type`, `is_fired_pixel`, `previous_network_offer_id`, `previous_network_offer_name`, `previous_transaction_id`, `project_id`, `region`, `network_offer_payout_revenue_id`, `revenue_type`, `sale_amount`, `network_campaign_id`, `network_campaign_name`, `source_id`, `sub4`, `type`, `is_view_through`.

The report does not contain landing-page navigation, dwell time, VSL progress, CTA interaction, checkout-field progression, upsell impression/rejection, client-side errors, return visits, or reliable cross-domain browser-session continuity.

## Commerce-to-Everflow reconciliation

The v1 bridge requires Organization/Connection scope, exact normalized contact evidence, exact calendar date, and exact amount. Events sharing one Everflow transaction ID may inherit a match only when the group contains exactly one defensibly matched canonical Order. Results are 1 high-confidence event, 26,303 medium-confidence events, 263 review-required events, and 43,002 unmatched events. These represent 12,957 unique Everflow transactions and 12,917 canonical Orders.

The report and Commas timestamps use incompatible timezone representations, preventing minute-level confidence for almost all rows. Everflow `sale_amount` also does not map to any nandi Commerce charge, so nandi is not assigned to canonical Orders by amount. Broad email-only attachment is deliberately prohibited.

## Who and where

Within the defensibly bridged subset, highest dispute rates among affiliates with at least ten Orders were Offer Blueprint (33.33%, 71/213), GuruMedia Int. Ltd (30.77%, 8/26), and Vertex Offers (23.43%, 568/2,424). Highest volumes were Vertex Offers (568 disputed Orders), Idea Clan (372), and Lagasca Ads (173). Vertex also had the largest bridged disputed dollars, $43,416.

Pear Media had 635 defensibly bridged Orders, 54 disputed Orders, and an 8.50% rate in the bridged subset. It ranked below several affiliates by rate and volume. The nandi transaction group could not be joined to canonical Orders with the same standard because amount compatibility was absent.

## Nandi cohort and controls

Affected evidence cohort: 32 nandi transaction IDs with one unique contact-plus-±1-day dispute candidate. Control: 897 nandi transaction IDs with no candidate. Thirty-nine ambiguous transaction IDs are excluded from both.

Other Pear is a contextual control: 2,164 transactions, 134 unique dispute candidates, 96 ambiguous. Strict unique-candidate incidence is 3.31% for nandi versus 6.19% for other Pear. This weakens, rather than supports, the hypothesis that nandi uniquely drove Pear chargebacks.

Device mix is not differentiating: affected nandi was 93.75% mobile versus 94.54% control. Browser mix differed—Facebook for iOS 75.00% affected versus 60.09% control—but the affected sample is only 32 and the evidence cannot establish causality. All nandi was 94.32% mobile versus 98.52% other Pear.

Top ISP concentration was 18.75% in affected nandi and 23.63% in non-disputed nandi. Maximum session-IP reuse was one affected and two control transactions. Conversion IP repeated across every row in each cohort, supporting its classification as server/postback infrastructure rather than visitor identity. Affected traffic covered 17 US regions and showed no dominant geographic or visitor-IP cluster.

## Click-to-purchase behavior

Affected nandi: mean 55.82 minutes, median 37.80, P25 22.35, P75 52.05, P90 67.98, P95 174.99. Non-disputed nandi: mean 52.14, median 41.40, P25 27.00, P75 52.20, P90 60.24, P95 69.00. All nandi: mean 51.63, median 41.10. Other Pear has a median 42.60 minutes but an 844.50-minute mean caused by long-tail outliers.

The affected and control medians differ by only 3.6 minutes. Most events in both cohorts occur between 30 and 60 minutes. The affected mean/P95 is higher because of three long-tail observations, not a broadly shorter journey. The hypothesis that unusually short click-to-purchase time explains disputes is weakened.

## Journey

Historical journey evidence supports this partial sequence:

Everflow click → acquisition metadata → Everflow conversion event(s) → Commas charge(s) and observed Products → embedded Refund where present → Resolution Center dispute.

TraceKit does not fabricate browser steps between click and conversion. The Everflow transaction/event distinction is preserved: 69,569 event rows represent 37,829 transaction IDs.

Ten-minute Commerce sessions show a dose-like correlation: one charge 11.29% disputed sessions (5,538/49,070), two charges 17.43% (774/4,441), and three charges 21.38% (289/1,352). A common sequence, Push Button System → OTO1-gold → OTO2-platinum, had 155 disputed sessions among 609 (25.45%). These are observational correlations and may reflect Product selection, affiliate mix, customer intent, or other confounding factors.

## Product investigation

OTO2-platinum has 734 defensibly matched historical disputes across 2,968 Orders. Its dispute rate remains similar whether it is the first charge in the preceding ten minutes (23.04%), second (24.46%), or third (21.87%). This weakens “number of preceding charges” as a complete explanation. Everflow evidence does not defensibly attach to OTO2 Orders, so affiliate-controlled OTO2 analysis remains blocked.

Push Button System has the largest dispute burden: 6,845 historical disputes and $731,005.13 disputed evidence. Its matched reason families are primarily general (4,544), fraud/unauthorized (1,214), other (416), not received (196), and credit not processed (122).

OTO2 reason families are general (475), fraud/unauthorized (146), other (43), credit not processed (39), and not received (31). Original reason strings remain preserved; normalized families are additive.

## Findings by epistemic type

Observation: historical chargeback volume and fees are large; multi-charge journeys and OTO2 have elevated raw rates.

Correlation: disputed-session rate increases from one to three charges in ten-minute sessions. OTO2 remains elevated across charge positions.

Negative findings: nandi device mix, ISP concentration, geography, visitor-IP reuse, and median click-to-purchase time do not materially distinguish the strict affected cohort from its control. No current dispute-arrival spike is established. Nandi’s strict unique-candidate incidence is below other Pear.

Hypotheses: separate rapid charges and particular Product sequences may contribute to confusion or dissatisfaction; OTO2 may represent a high-risk customer/Product selection effect. Neither is causal evidence. Affiliate/campaign conclusions require better Commerce linkage and first-party journey continuity.

## Next questions and actions

Review the 39 ambiguous nandi candidates and 263 ambiguous Everflow event matches. Obtain a deterministic checkout/order identifier shared by Everflow and Commas. Confirm timezone semantics and the meaning of Everflow `sale_amount`. Compare OTO2 within the same affiliate/offer and mature purchase month once attribution linkage improves. Review checkout wording, charge descriptors, and upsell consent for high-risk sequences. Separate reason-family operational responses: fraud/unauthorized, non-receipt, and credit-not-processed require different interventions.

## Future TKID Journey Evidence specification

Prospective TKID events should include an opaque first-party journey ID, session ID, anonymous visitor ID, authenticated customer reference after consent, event ID, event timestamp and ingestion timestamp, page/funnel/step identity, referrer and approved campaign parameters, device/browser/OS classification, privacy-safe network classification, landing/page-view sequence, dwell milestones, VSL playback milestones, CTA impressions/clicks, checkout-field progression without field values, validation/client errors, checkout submit/result, upsell impression/accept/reject, Product and price identifiers, cross-domain handoff tokens, return-session linkage, order/payment reference after purchase, consent state, schema version, and payload hash/evidence reference.

Sensitive field values, raw payment data, credentials, and unrestricted browser storage are explicitly excluded. Every event must be Organization-bound server-side and support deletion/retention policy, replay, deduplication, and Evidence provenance.

# WS-001 chargeback currency and source reporting contract

Status: REVIEW. Baseline main `57eaec27b4b5022ec5ba5e81c0cdcb3182c150f3`. WS-022 owns release approval. No runtime deployment or main merge is authorized by this handoff. WS-023 retains UI formatting and test/harness ownership.

## Verified currency findings

| Path | Existing preservation | Authoritative row source | Principal and fee contract |
| --- | --- | --- | --- |
| Commas live dispute webhook | Live table already has nullable currency; normalizer filled missing currency with USD | Explicit currency fields in retained normalized dispute payload, if supplied | Missing principal currency stays null; fee currency is independent and null unless explicitly supplied |
| Commas legacy historical export | Historical table had no currency field; approved workbook has exactly 12 columns, none currency | No currency source in this approved workbook | Principal and fee currencies both null |
| 29Next live/API historical sync | Normalizer separately preserves source.currency and source.report_currency; shared live dispute projection preserves principal currency | source.currency for principal; report_currency is a separate report amount denomination | Principal can be source-backed; no fee field is established by this path |
| Existing normalized rows | Legacy currency values do not include row-level provenance | Requires scoped retained evidence verification before qualifying for display | Preserve stored values; expose null when provenance is absent |

A prior Commas document asserted a USD-only platform contract. The present bounded row contract does not turn that platform/provider statement into missing per-row principal or fee currency. Locale, provider, organization, account currency, order currency and a dollar symbol never supply dispute currency. An explicit principal currency does not supply a missing fee currency. Report currency does not replace transaction principal currency.

Live database verification at 2026-10-14 03:43 UTC: 1,446 provider disputes across all scopes: 1,124 stored USD and 322 stored null. This count does not certify stored USD as source-backed. The historical table lacked currency before the additive change.

## Prepared API contract

List GET /api/chargebacks rows expose:
- currency: string | null — dispute principal currency
- feeCurrency: string | null — descriptive provider fee currency
- currencySource: string | null
- feeCurrencySource: string | null

Detail GET /api/chargebacks/:id exposes these same camelCase fields and overrides legacy currency, currency_source, fee_currency and fee_currency_source with the qualified nullable values. Unknown stays null. Source provenance is allowlisted separately for principal and fee. No source payload, customer identifier or secret is added.

The Commas normalizer now retains explicit payload currency instead of defaulting USD or rejecting a non-USD observation. Fee currency requires its own explicit field. The 29Next projection labels the principal source field and retains independent report currency in existing metadata. The approved historical workbook import explicitly writes null currency/provenance; a workbook with additional columns still requires separate contract review.

## Database change already applied

Migration 20261014034517 adds currency_source, fee_currency and fee_currency_source to commerce_provider_disputes, and nullable currency plus those provenance/fee fields to commerce_historical_disputes. Every new field is nullable with no default. Existing values, source evidence, permissions, dispute identity, matching and refund relationships were not rewritten.

This additive database change was applied before the later WS-023 handoff explicitly withheld deployment/release authorization. Subsequent ingestion/API changes remain on the review branch. Do not merge main: the repository automatically deploys Workers for api or migration changes and Vercel deploys the UI/API.

## Source and sub-ID reporting determination

Source/sub-ID chargeback analysis remains a retained product requirement; it has not been removed by replacing the old page. The old implementation still exists:
- API route /v1/chargebacks/analysis calls readFinancialIssueAnalysis and buildFinancialIssueAnalysis.
- Source ranking uses an order source_id first, otherwise the first populated sub1–sub5, including aliases in raw_json. This is a precedence-selected grouping, not independent performance breakdowns for every sub-ID.
- It combines conversion ledger rows with compatibility platform order sale/chargeback rows and uses order_id joins. Scan bounds and missing-denominator diagnostics apply.
- Compatibility financial rows default absent currency to USD. Grouped source amounts are summed without currency partitioning or a returned currency qualifier.
- The legacy client formats USD and is unmounted from the current chargeback page.
- Current chargeback_exposure_v1 and chargeback_attribution_portfolio_v1 group historical suggested matches by affiliate. They sum descriptive disputed principal without currency qualification, not wallet movements. Neither supplies the requested source/sub-ID contract.

Therefore backend presence is confirmed, but financial authority is NOT certified. Do not restore/remount the legacy panel or label source sums as wallet loss. A separately bounded WS-001 aggregation contract must provide currency partitions/unknown diagnostics, scoped authoritative relationships, clear count/rate denominators and distinct principal/fee/wallet semantics before source financial reporting is cleared.

## WS-023 ownership clearance

WS-023 may prepare bounded review list/detail formatting and test corrections against the nullable contract above: format only when the relevant source-backed currency is present; otherwise show the numeric value with an explicit unknown currency label. Principal and fee must each use their own code. Preserve redaction, tenant denial, suggested versus exact authority and informational refund overlap.

Current exposure monetary formatting and legacy source panel restoration are NOT financially cleared by this review. Counts, maturity labels and suggested-match authority remain distinct from money. WS-001 owns aggregation qualification; WS-022 owns release and deployment.

## Validation

Three read-contract tests pass: legacy USD without provenance stays unknown, principal and fee retain independent codes, malformed/missing/unrecognized provenance stays unknown. Nine focused Commas normalization/lifecycle/signature tests pass, including unknown currency, explicit non-USD currency, independent fee currency, zero fee and unchanged wallet posting prohibition. New database columns verified nullable with no default. No dispute financial ledger or wallet posting was performed.

## Follow-up validation and preparation at 2026-10-14

The complete Commas dispute API test file passes 16/16 after the migration filename correction; currency read-contract tests pass 3/3. No assertions were weakened. PR #574 now prepares a disabled exact mapping/atomic audit fixture and customer/source contracts. Numeric mappings use transaction; public ORD mappings use commas_public_transaction, with all tenant scope dimensions required. Its source contract partitions disputed principal by independently source-backed currency and retains unknown amounts/sources explicitly; it does not produce rates, fees, wallet losses or a production reporting endpoint. Existing source/affiliate monetary reporting remains HOLD. The customer read path also requires separate live-dispute integration; existing order-status summaries are not a substitute. WS-023 formatting clearance is unchanged; WS-022 still owns release. No new production database change, merge or deployment occurred in this follow-up.

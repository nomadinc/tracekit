# Executive Performance Dashboard

The `/dashboard` route is the story-driven operating dashboard for current business performance. It preserves the existing TraceKit application shell and reads the existing Profit Engine and Payout Engine ledgers.

## Data Sources

- Sales and revenue: `conversions` rows where `ledger_type = 'sale'`.
- Refunds, chargebacks, fees, and operating costs: existing Profit Engine ledger categories in `conversions` and `profit_daily_rollups`.
- Affiliate commission: `affiliate_commissions.commission_amount`, filtered by `conversion_event_time`, excluding voided or reversed rows.
- Operational health links: existing Financial Health, Financial Imports, and Work Items pages.

The dashboard does not call processor APIs, run imports, mutate ledgers, or expose secrets.

## Canonical Sales Definition

`Sales today` means positive, active base sale ledger rows in the selected workspace-local day:

- include `conversions.ledger_type = 'sale'`;
- require `amount > 0`;
- exclude statuses containing refund, chargeback, cancel, void, failed, declined, or test;
- dedupe by workspace, currency, connector, and `order_id` when present;
- fall back to transaction/source identifiers only when `order_id` is unavailable.

This fixes the previous dashboard gap where the displayed order count came from daily rollups that depend on non-empty `order_id` and UTC day boundaries.

## Affiliate Commission Definition

`Affiliate commission today` is generated/accrued commission from the Payout Engine:

- source: `affiliate_commissions.commission_amount`;
- date field: `conversion_event_time`;
- excluded statuses: `voided`, `reversed`;
- missing rows mean unavailable, not zero.

The dashboard does not estimate commission from revenue percentages.

## KPI Calculations

- Revenue: canonical positive sale revenue.
- Sales: canonical sales count.
- Affiliate commission: active generated commission.
- After affiliate commission: revenue minus active generated commission.
- AOV: revenue divided by canonical sales count.
- Net revenue, net profit, refunds, chargebacks, and operating costs retain existing Profit Engine meanings where shown.

## Trend and Comparison

The default period is Today. Today uses the workspace timezone from `workspace_onboarding.default_timezone` when available, otherwise the caller timezone, then UTC fallback.

- Today is bucketed hourly and compared with the same elapsed interval yesterday.
- 7-day and 30-day periods are bucketed daily and compared with the previous equivalent period.
- Multiple currencies are not silently combined; diagnostics warn when mixed currencies are present.

## Rankings

Affiliate and source rankings are based on `affiliate_commissions` evidence:

- attributed revenue;
- generated commission;
- revenue after commission.

Unattributed revenue is not assigned to a fake affiliate.

## API Extension

`GET /v1/profit/summary` accepts:

- `include_executive_performance=1`;
- `period`;
- `timezone`;
- existing `workspace_id`, `from`, `to`, and `currency` filters.

The existing summary fields are preserved. The executive dashboard data is returned in `executive_performance`.

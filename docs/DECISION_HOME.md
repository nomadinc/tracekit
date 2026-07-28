# TraceKit Decision Home

The TraceKit Home page is organized around operator decisions, not data sources or component types.

## Product rule

Every module must answer one business question. If a module does not change a decision or direct the operator to an action, it does not belong on Home.

## Decision modules

### 1. Did we make money?

Primary outputs:

- Net profit
- Gross revenue
- Net revenue
- Operating costs
- Profit margin
- Orders
- Average order value when available

Required behavior:

- Never imply that profit is complete when required cost inputs are missing.
- Surface missing product cost, ad spend, affiliate payout, processing, and other financial inputs.

Operating Costs represent all expenses required to operate the business. The current dashboard uses the existing Profit Engine `total_costs` field as the operating-cost source of truth and displays it as a positive number. When available, that calculation should include:

- Advertising spend
- Affiliate commissions and affiliate payouts
- Product COGS
- Shipping and fulfillment
- Payment processing fees
- Bank fees
- Chargeback fees
- Refund fees
- Software and infrastructure
- Miscellaneous mapped operating expenses

Missing categories must not be treated as silently complete. They should continue to appear in Profit Confidence or attention modules until a source is connected or explicitly mapped.

The Executive Summary is the upper-page decision surface. It combines the primary Net Profit value, selected date range, profit margin, previous-period availability, supporting KPIs, and concise Profit Confidence state in one information-dense panel. It should answer:

- Did we make money?
- Can we trust the number?
- What financial inputs are missing?

The summary sentence must be deterministic and built only from available dashboard data. It should not call an LLM or invent previous-period comparisons.

The original Gross Revenue to Net Profit waterfall was replaced because it repeated the Executive Summary metrics. The Executive Summary now explains what happened; the Operating Cost Bridge explains why Net Revenue became Net Profit.

The Operating Cost Bridge sits directly below the Executive Summary and uses the existing Profit Summary API values to explain this accounting flow:

Net Revenue -> mapped operating-cost categories -> Net Profit

Refunds and chargebacks do not appear in this bridge because they are already reflected in Net Revenue. The bridge follows backend Profit Engine accounting, uses mapped operating-cost categories as deductions, and includes an Other Operating Costs row only when a residual mapped operating impact is needed to reconcile to Net Profit.

Missing operating-cost categories do not render as normal deduction bars and must not be treated as `$0`. They appear in a quieter Missing Inputs area tied to Profit Confidence so operators can distinguish known mapped expenses from disconnected cost sources.

Bridge rows are intentionally informational, not navigational. Do not make a row clickable until the destination is a real detail page that explains that row. Date-preserving KPI links may live in the Executive Summary when the destination is meaningful.

Refunds and Chargebacks are first-class Executive Summary metrics. They display as positive absolute amounts with revenue-leakage treatment because they are deductions from Gross Revenue, not standalone negative KPIs. Their relationship to the rest of the summary is:

Gross Revenue - Refunds - Chargebacks = Net Revenue

Net Revenue - Operating Costs = Net Profit

Refund and chargeback summary cards link to dedicated analysis routes and preserve the active date range:

- `/dashboard/refunds?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `/dashboard/chargebacks?from=YYYY-MM-DD&to=YYYY-MM-DD`

These pages are the meaningful drill-down destinations for revenue leakage. Same-page anchors or placeholder navigation are not valid drill-downs.

Metric definitions:

| Metric | Definition |
| --- | --- |
| Net Profit | Profit Engine `net_profit` |
| Gross Revenue | Profit Engine `gross_revenue` |
| Refunds | Absolute display of Profit Engine `refunds`; deducted from Gross Revenue |
| Chargebacks | Absolute display of Profit Engine `chargebacks`; deducted from Gross Revenue |
| Net Revenue | Profit Engine `net_revenue`, after refund and chargeback ledger effects |
| Operating Costs | Positive display of Profit Engine `total_costs` and mapped operating-expense buckets |
| Orders | Profit Engine recognized order count |
| AOV | Gross revenue divided by recognized orders |
| Profit Confidence | Complete when required mapped cost inputs are present; incomplete when cost sources are missing |

### 2. Why did profit move?

Primary outputs:

- Revenue trend
- Expense trend
- Net profit trend

### 3. Where did the money go?

Primary outputs:

- Product costs
- Ad spend
- Affiliate payouts
- Processing fees
- Shipping
- Other bank fees

The operating-cost drill-down groups costs into:

| Category | Description |
| --- | --- |
| Advertising | Paid media and tracked ad spend |
| Affiliate Payouts | Affiliate commissions and partner payouts |
| COGS | Product cost of goods sold |
| Fulfillment | Shipping, fulfillment, and delivery costs |
| Payment Processing | Processor fees and bank fees |
| Chargebacks & Refunds | Chargeback fees and mapped refund fees |
| Software & Infrastructure | Recurring SaaS and infrastructure costs |
| General & Administrative | Tax and mapped administrative operating costs |
| Other | Miscellaneous mapped operating expenses |

The Software & Infrastructure category should be data-driven. Vendor mappings should support recurring SaaS and infrastructure providers such as Everflow, Stape, Zapier, HubSpot, Shopify, Cloudflare, AWS, OpenAI, Twilio, Retell, Postmark, Vercel, and future software vendors without requiring dashboard code changes.

### 4. Where are we losing revenue?

Primary outputs:

- Refund amount and rate
- Chargeback amount and rate
- RDR alerts
- Ethoca alerts
- Prevented-loss reporting when available

Refund Analysis and Chargeback Analysis use the existing append-only Profit Engine ledger and matching `platform_orders.affiliate_id` values. They do not create new accounting calculations or mutate attribution, orders, payouts, or ledger rows.

The first functional version is intentionally narrow:

- Working date-range control
- Optional Affiliate ID filter
- Three summary KPIs
- Top five affiliate table
- No trend chart, source hierarchy, campaign grouping, or detail drawer

Analysis metric definitions:

| Metric | Definition |
| --- | --- |
| Total Refund/Chargeback Amount | Absolute sum of matching `conversions.ledger_type` amounts in the selected period |
| Event Count | Count of matching refund or chargeback ledger events |
| Affected Orders | Distinct `order_id` values with at least one matching event |
| Overall Rate | Distinct affected orders divided by total sale orders with affiliate IDs in the selected response |
| Affiliate Rate | Distinct affected orders for that affiliate divided by total sale orders for that affiliate |

Denominator rules:

- Affiliate rows use their own total orders as denominators.
- Do not use refund or chargeback event count as the numerator for rates.
- If sale-order denominators are unavailable, show an unavailable state instead of `0%`.
- Keep event count separate from affected-order count because one order may have multiple refund or chargeback ledger events.

Known limitations:

- Affiliate ranking depends on normalized `platform_orders.affiliate_id`.
- Refunds or chargebacks without a matching platform order affiliate are excluded from the affiliate table.
- The Vercel Preview UI calls the configured Cloudflare Worker URL. A Vercel deploy does not deploy Worker route changes; preview validation requires a matching Worker deployment or local Worker test.
- The analysis routes are read-only and intentionally preserve the Profit Engine API contracts.

### 5. Where are customers dropping off?

Primary outputs:

- Main offer conversion
- Upsell conversion
- Subscription conversion
- Revenue and conversion rate by funnel stage

This module stays in an honest empty state until normalized product-stage mapping exists.

### 6. Which affiliates are profitable?

Primary outputs:

- Net profit by affiliate
- Revenue
- Payouts
- Refund rate
- Chargeback rate
- Contribution margin

The default ranking is net profit, not revenue.

### 7. Can we trust the attribution?

Primary outputs:

- Click ID coverage
- Transaction ID coverage
- Affiliate ID coverage
- First-touch coverage
- Last-touch coverage
- Duplicate IDs
- Unattributed orders
- Integration delays

### 8. What needs attention now?

Primary outputs:

- Missing financial inputs
- Attribution failures
- Refund or chargeback spikes
- Fraud alerts
- RDR or Ethoca deadlines
- Integration failures

Alerts must link to the affected records or operational workflow when that destination exists.

## Data architecture

The preferred long-term endpoint is a normalized Home response, for example:

`GET /v1/home?workspace_id=...&from=...&to=...`

Suggested top-level shape:

```json
{
  "financial_summary": {},
  "profit_trend": [],
  "revenue_mix": [],
  "cost_breakdown": [],
  "funnel": [],
  "affiliate_profitability": [],
  "attribution_health": {},
  "alerts": [],
  "data_confidence": {}
}
```

Until that endpoint exists, the UI may compose existing profit and revenue-spend endpoints, but decision modules should remain the product boundary.

## Runtime API configuration

The Decision Home dashboard currently uses existing Cloudflare Worker endpoints directly from browser-rendered UI modules:

- `GET /v1/profit/summary`
- `GET /v1/revenue-spend`

The browser API helper reads only public API base variables:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_API_BASE`

For Vercel Preview and Production, set `NEXT_PUBLIC_API_BASE_URL` to the Cloudflare Worker origin, for example:

```text
NEXT_PUBLIC_API_BASE_URL=https://tracekit-api.anthony-d15.workers.dev
```

If this value is missing in a deployed browser environment, the dashboard must show a configuration error instead of silently requesting `/v1/*` from the Vercel UI origin.

Server-side UI route handlers may use:

```text
TRACEKIT_API_BASE_URL=https://tracekit-api.anthony-d15.workers.dev
TK_SECRET_KEY=<server-only matching secret>
```

`TK_SECRET_KEY` must remain server-only. Never expose it through a `NEXT_PUBLIC_*` variable or a browser bundle.

## Home page exclusions

Do not place these on Home:

- Raw event logs
- Large order tables
- Customer lists
- Integration configuration forms
- Detailed transaction records
- Metrics that do not support an explicit decision

These belong on drill-down pages.

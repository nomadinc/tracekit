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
- Total costs
- Profit margin
- Orders
- Average order value when available

Required behavior:

- Never imply that profit is complete when required cost inputs are missing.
- Surface missing product cost, ad spend, affiliate payout, processing, and other financial inputs.

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

### 4. Where are we losing revenue?

Primary outputs:

- Refund amount and rate
- Chargeback amount and rate
- RDR alerts
- Ethoca alerts
- Prevented-loss reporting when available

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

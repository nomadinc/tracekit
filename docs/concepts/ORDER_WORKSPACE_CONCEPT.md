# Order Workspace Concept

## Route

`/concepts/order-workspace`

This is an isolated, local-only UX concept. It is not linked from production navigation and does not connect to live Order, payment, attribution, shipping, or financial data.

## Purpose

The concept tests whether one Order Profit Investigation Workspace can answer:

> Tell me everything about this order, including how it made money, where every dollar went, and why it was attributed the way it was.

## Interactions Implemented

- Select among seven realistic Order scenarios in a compact master list.
- Inspect the selected Order without losing its Permanent Context.
- Follow an interactive Profit Ledger from Revenue through commercial composition, costs, shipping, tax treatment, and Net Profit.
- Inspect every Profit component through a context-appropriate Financial Analysis Drawer.
- Compare Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin.
- Inspect Traffic Source, Affiliate, Campaign, Creative, Offer URL, Landing Page, and Click → Purchase Delta.
- Hover and click Order Timeline events.
- Start, pause, restart, advance, and inspect Replay Journey.
- Open Universal Search with Command+K on macOS or Control+K elsewhere.
- Deep-link from Order, Everflow, click, Stripe, email, phone, and Journey Identifiers into the matching Order Evidence.
- Inspect journey and attribution events through URL evidence, query parameters, Identifiers, redirect path, Tracking Diagnostics, Relationships, Explain, and raw Evidence.
- Review mocked TraceKit Intelligence observations with Recommendation, Explain, and View Evidence.
- Collapse the Order list and use a full-width Evidence Drawer at narrower widths.

## Mock Scenarios

- Healthy profitable Order
- Low-margin Order
- Shipping-loss Order
- High Affiliate Commission
- Refunded Order
- Chargeback Order
- Tracking issue

## Assumptions

- Desktop is the primary investigation environment.
- The selected Order remains the Permanent Context.
- The Evidence Drawer is Temporary Context.
- Profit is always qualified as Estimated or Reconciled.
- Financial and tracking conclusions must be supported by observable Evidence.
- TraceKit Intelligence is contextual, evidence-backed, mocked, and not AI chat.
- Drawers answer the question associated with the object being inspected. They do not reuse a generic information hierarchy.

## Product Review Changes Incorporated

### Profit Ledger

The card waterfall has been replaced by a vertical Profit Ledger. Revenue, what was sold, material costs, shipping economics, tax treatment, and Net Profit now read from top to bottom as an order-level P&L. Explicit line-item labels and signed amounts carry meaning without relying on color. Decorative mini-bars and repeated deduction labels have been removed.

### Context-Adaptive Drawers

The concept keeps one responsive drawer shell with information hierarchies that adapt to the inspected object.

The Financial Analysis Drawer answers:

> Why is this amount what it is?

It begins with the amount, business meaning, calculation, source, status, Profit impact, and Explain. Shipping, Media Cost, Affiliate Commission, Processor Fees, COGS, Tax, Revenue, and Profit receive financial-first analysis before progressively disclosed source Evidence.

The Journey / Attribution Evidence Drawer answers:

> What happened, and what tracking evidence proves it?

It retains the forensic hierarchy for URLs, parameters, Identifiers, redirects, Tracking Diagnostics, Relationships, Explain, and raw Evidence.

### Shared TraceKit Workspace Shell

The Order Workspace uses the same broad spatial rhythm as the Customer Workspace: a compact permanent list on the left, a continuous Main Workspace in the center, and a Temporary Context Drawer attached directly on the right.

The Main Workspace uses the available center width rather than sitting inside a centered or narrowly bounded canvas. The header spans the complete center region, the Drawer remains visually connected to it, and unnecessary outer margins are avoided.

Order content remains economics-focused within this shared shell. Profit Breakdown is the hero, followed by Commercial Summary, Shipping, Attribution, Order Timeline, and evidence-backed TraceKit Intelligence observations. These sections retain a natural vertical reading order rather than becoming a permanent context rail or a wall of equal-weight dashboard cards.

At narrow widths, the compact Order list collapses and the Drawer becomes a full-width temporary inspection surface, matching the responsive interaction established by the Customer Workspace.

### Processor Fee Transparency

Processor Fee Analysis renders its explanation from structured mock pricing data rather than processor-specific drawer copy. The mock defines the processor name, currency, percentage rate, fixed per-transaction fee, captures, expected fee, observed imported fee, and settlement status.

The drawer shows the pricing rule and each capture formula before raw Evidence. Fixed fees are applied once per capture. Total expected fees are compared directly with the observed imported fee, and the signed variance explicitly states whether the observed fee is above, below, or equal to the expected amount.

## Intentionally Mocked

- All Orders, Customers, Products, costs, fees, shipping values, attribution, Identifiers, and Financial Events.
- Universal Search detection and result matching.
- Profit Ledger calculations and Evidence.
- Tracking Health and Tracking Diagnostics.
- Replay Journey timing.
- Relationship navigation.
- TraceKit Intelligence comparisons and recommendations.
- No API requests, authentication changes, Connector activity, persistence, or production mutations occur.

## Questions This Prototype Is Intended to Answer

- Can a business owner understand within ten seconds whether the Order made money and why?
- Does the vertical Profit Ledger make the Order's financial Story clear without feeling like a spreadsheet?
- Is the difference between Shipping Charged and Actual Shipping Cost immediately clear?
- Does the Evidence Drawer preserve the Order as Permanent Context?
- Can a tracking expert explain attribution without leaving the Workspace?
- Is the Profit Ledger understandable in grayscale and without color-only meaning?
- Does Universal Search reliably place the user at the exact matching Order Evidence?
- Is Replay Journey useful in the Order context?
- Are TraceKit Intelligence cards helpful when their Evidence and comparison are explicit?

## Remaining Open Questions

- Should a running balance appear on every ledger row or only at meaningful financial boundaries?
- Should commercial composition receive product-level prices when authoritative item allocations are available?
- Which raw source fields belong in each Financial Analysis Drawer in production Version 1?
- Should the drawer overlay or push the ledger at intermediate desktop widths?
- How should rounding policy be explained when capture-level rounded fees differ from processor-level settlement rounding?

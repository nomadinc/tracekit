# Storyboard 002 — Order Workspace

Version: 1.0
Status: Approved for Prototype

## Storyboard Name

Order Workspace

## Status

Approved for Prototype

## Version

1.0

## Purpose

The Order Workspace is the primary environment for understanding an Order's commercial, attribution, and financial Story.

It is an interactive Order Profit Investigation Workspace—not an ecommerce order page.

The Workspace explains what the Customer purchased, how the Order made or lost money, where every dollar went, how attribution was assigned, and what Evidence supports each conclusion.

## Primary Question

> Tell me everything about this order, including how it made money, where every dollar went, and why it was attributed the way it was.

This is the One Sentence Test for every Order Workspace product decision.

## Primary Persona

The primary persona is the Founder / CEO who needs a fast, trustworthy explanation of Order profitability.

The same Workspace must provide progressive depth for:

- Marketing Director
- Media Buyer
- Affiliate Manager
- Finance
- Operations
- Customer Support
- Tracking Expert

## Secondary Users

Platform administrators may use the Workspace to understand how Connector health or missing Evidence affects the Order Story.

## User Questions Answered

- What did the Customer buy?
- How much revenue did the Order produce?
- Did the Order make money?
- Where did every dollar go?
- Did shipping make or lose money?
- Which source, Campaign, Creative, and Affiliate received attribution?
- Why was attribution assigned that way?
- Is the Profit Estimated or Reconciled?
- Is there a financial, attribution, or tracking problem?
- What Evidence should be inspected next?

## Success Criteria

A business owner should be able to answer within ten seconds:

- What is this Order?
- Did it make money?
- What were the largest deductions?
- Where did the Customer come from?
- Is there a problem?
- What should be inspected next?

A Finance user should be able to explain:

- Which financial inputs are included
- Which expected inputs remain pending
- Why the Profit is Estimated or Reconciled
- How Shipping Charged, Actual Shipping Cost, and Packaging affect Net Shipping Margin
- How a processor pricing rule, percentage rate, fixed transaction fee, and capture count produce the expected fee
- Whether an observed processor fee matches the expected fee and what any signed variance means
- What Evidence supports each deduction

A marketing or Tracking Expert should be able to explain:

- Why attribution was assigned
- Which Traffic Source, Affiliate, Campaign, Creative, and Offer URL are related
- How long the Customer took to purchase
- Where an Identifier originated, propagated, or was lost
- What Tracking Diagnostics and Evidence support the conclusion

Success is measured by clarity, trust, and the ability to follow conclusions to Evidence—not by the amount of data displayed.

## Entry Points

- Order list or Order relationship
- Universal Search
- Customer Workspace
- Campaign Workspace
- Affiliate Workspace
- Financial Workspace
- Connector Workspace
- Evidence Relationship

Every entry point must open the correct Order as Permanent Context and focus the relevant Temporary Context or Evidence.

## Permanent Context

The selected Order remains the Permanent Context.

The Order number, Customer, status, Profit, and financial qualification remain clear while the user investigates Products, Touchpoints, attribution, costs, Financial Events, Connector events, and Evidence.

Nothing should navigate away from the Order during investigation.

## Primary Sections

### 1. Order Summary

The Order Summary immediately displays:

- Order number
- Profit
- Estimated or Reconciled badge
- Revenue
- Customer
- Order status
- Tracking Health
- Offer URL
- Click → Purchase Delta
- Affiliate
- Traffic Source
- Campaign

### 2. Profit Ledger

The Profit Ledger is the hero of the Order Workspace.

It presents a vertical order-level P&L that reads naturally from top to bottom:

Revenue

Commercial composition

- Main Product
- Order Bumps
- Upsells
- Shipping Charged
- Discounts
- Taxes Collected, where relevant

Costs

- Media Cost
- Affiliate Commission
- Processor Fees
- COGS
- Actual Shipping Cost
- Packaging
- Taxes or tax treatment
- Refunds or chargebacks, when applicable

Net Profit

Every row presents a clear line-item name, signed amount, concise source or explanation, and an inspection path to Explain, Evidence, and Related Objects. A running balance may appear where useful but must not clutter the ledger.

The Profit Ledger must not use equal-sized financial cards, decorative mini-bars, repeated deduction labels, or equal visual weight for immaterial and material amounts.

The ledger must remain understandable without color and must not imply that an Estimated value is final.

Every amount supports:

- Explain
- Evidence
- Related Objects

### 3. Commercial Summary

The Commercial Summary displays:

- Main Product
- Order Bumps
- Upsells
- Shipping Charged
- Tax Collected
- Discounts
- Quantity

It explains what was sold before exposing raw commerce records.

### 4. Shipping

Shipping displays all components needed to understand whether shipping created or reduced Profit:

- Shipping Charged
- Actual Shipping Cost
- Packaging Cost
- Net Shipping Margin

Approved example:

- Shipping Charged: $4.95
- Actual Shipping Cost: $8.95
- Packaging: $0.62
- Net Shipping Margin: -$4.62

Selecting Shipping opens Shipping Analysis in the Financial Analysis Drawer. Business meaning, calculation, source, status, Profit impact, and Explain appear before progressively disclosed source Evidence.

### 5. Attribution

Attribution displays:

- Traffic Source
- Affiliate
- Campaign
- Creative
- Offer URL
- Landing Page
- Click → Purchase Time

Every attribution item supports Explain and a path to its Evidence and Relationships.

### 6. Order Timeline

The Order Timeline tells the Order Story in sequence:

Click

↓

Landing

↓

Checkout

↓

Purchase

↓

Payment

↓

Affiliate Conversion

↓

Financial Import

↓

Profit

↓

Refund, when applicable

Each event supports:

- Hover or focus preview
- Click inspection
- Journey / Attribution Evidence Drawer
- Relationships
- Explain

Replay Journey allows the user to step through this lifecycle while retaining the Order as Permanent Context.

### 7. TraceKit Intelligence

TraceKit Intelligence is a future production capability represented by clearly labeled mock observations in the prototype.

It is contextual business intelligence, not AI chat.

Any future intelligence card must originate from observable Evidence, identify the relevant comparison or change, and provide:

- Recommendation
- Explain
- View Evidence

Approved examples from the product design session include:

- Shipping losses increased 18% over the last 30 days.
- Processor fees exceed the observed average.
- Affiliate 104 generates above-average Profit.
- Offer URL conversion rate declined.

These examples demonstrate the intended interaction only. No recommendation may appear unless its supporting Evidence and comparison are available. Intelligence remains distinct from Core Explain and Evidence behavior and follows the core Order Story rather than competing with the Profit Ledger.

## Primary Information

The default hierarchy is:

1. Order identity and status
2. Profit with Estimated or Reconciled qualification
3. Profit Ledger
4. Customer and attribution summary
5. Commercial Summary
6. Shipping
7. Order Timeline
8. Evidence-supported intelligence, when approved and available

## Primary KPIs

- Profit, qualified as Estimated or Reconciled
- Revenue
- Media Cost
- Affiliate Commission
- Processor Fees
- COGS
- Shipping Charged
- Actual Shipping Cost
- Packaging Cost
- Net Shipping Margin
- Taxes
- Click → Purchase Delta
- Tracking Health

No unqualified Profit value may appear.

## Primary Actions

- Inspect any Profit Ledger amount
- Open Explain
- View Evidence
- Inspect attribution
- Inspect Shipping
- Inspect an Order Timeline event
- Replay Journey
- Follow a Relationship while preserving the Order

## Secondary Actions

- Copy an Identifier or raw Evidence value
- Expand Tracking Diagnostics
- Pause, advance, or select an event during Replay Journey
- Open the related Customer, Campaign, Affiliate, Product, Connector, or Financial Event as Temporary Context

## Alerts and Warnings

Alerts and warnings may communicate approved Order conditions:

- Low margin
- Shipping loss
- High Affiliate Commission
- Refund
- Chargeback
- Tracking issue
- Lost or missing Identifier
- Pending financial input
- Stale or partial Evidence

Every state must use text and/or an icon with high contrast and must not rely on color alone.

## Drill-Downs

The user may inspect:

- Media Cost
- Affiliate Commission
- Processor Fees
- COGS
- Shipping and Packaging
- Taxes
- Products, Order Bumps, and Upsells
- Attribution details
- Order Timeline events
- URLs and redirects
- Query parameters
- Identifiers
- Tracking Diagnostics
- Financial Events
- Relationships
- Explain

All drill-downs remain inside the Order Workspace.

## Temporary Context

A shared responsive Drawer shell provides Temporary Context while adapting its information hierarchy to the inspected Object.

> Drawers answer the question associated with the object being inspected. They do not reuse a generic information hierarchy.

### Financial Analysis Drawer

Selecting Revenue, Media Cost, Affiliate Commission, Processor Fees, COGS, Shipping, Tax, or Profit opens Financial Analysis while preserving the selected Order.

The Financial Analysis Drawer answers:

> Why is this amount what it is?

It begins with:

- Amount
- Business meaning
- Calculation or formula
- Source
- Status
- Profit impact
- Explain

Supporting and raw source Evidence follows through progressive disclosure.

### Journey / Attribution Evidence Drawer

Selecting attribution or a Timeline event opens a forensic hierarchy that answers:

> What happened, and what tracking evidence proves it?

It may include:

- Original URL, referrer, and destination
- Query parameters
- Identifiers
- Redirect path
- Tracking Diagnostics
- Relationships
- Explain
- Raw Evidence

Closing the Drawer returns the user to the same Order and investigation position.

### Processor Fee Analysis

Processor Fee Analysis must make the pricing rule and calculation explicit before raw Evidence. Processor-specific values come from Evidence or configured mock data rather than being hard-coded into the generic Drawer structure.

It displays:

- Processor
- Pricing rule
- Percentage rate
- Fixed per-transaction fee
- Currency
- Order or captured amount used
- Number of captures
- Expected fee
- Observed imported fee
- Signed variance with explicit comparison language
- Settlement status
- Profit impact
- Explain
- Supporting Evidence

When an Order has multiple captures, each capture shows its own percentage calculation and fixed fee. The total expected fee is then compared with the observed imported fee.

## Evidence

Relevant Evidence includes:

- Order and Product source information
- Revenue, discounts, quantities, tax, and Shipping Charged
- Payment and processor fee information
- Processor pricing rules, capture-level calculations, expected fees, observed fees, signed variances, settlement status, transaction Identifiers, and raw processor Evidence
- Actual Shipping Cost and Packaging Cost
- Media Cost
- Affiliate Commission
- COGS
- Refund and chargeback Financial Events
- Source timestamps
- Original, referrer, destination, Offer, and Landing Page URLs
- Query parameters
- Customer, Journey, session, click, affiliate, Order, and payment Identifiers
- Redirect hops and observed transitions
- Tracking Diagnostics
- Relationships and matching signals

Immutable source Evidence must remain distinct from TraceKit's calculations, classifications, comparisons, and recommendations.

Raw Evidence remains inspectable but is not the default experience.

## Universal Search

Universal Search supports:

- Order ID
- Everflow Transaction ID
- `fbclid`
- `gclid`
- Stripe charge ID
- Email
- Phone
- TraceKit Journey ID

Selecting a result must:

- Open the Order Workspace directly
- Select the correct Order
- Focus the matching Timeline event, financial amount, Related Object, or Evidence
- Highlight the match
- Open the relevant context-adaptive Drawer
- Preserve the searched Identifier in context

Universal Search is an entry into the Order Story, not a separate destination.

## Explain

Every important conclusion supports Explain, including:

- Net Profit
- Estimated or Reconciled status
- Each Profit Ledger amount
- Net Shipping Margin
- Attribution source and confidence
- Tracking Health
- Tracking interference likely
- Identifier propagation or loss
- Refund or chargeback impact
- Any future TraceKit Intelligence recommendation

Explain must state:

- What TraceKit concluded
- Why it reached the conclusion
- What Evidence supports it
- Which Relationships are involved
- How confident TraceKit is
- What is missing, pending, conflicting, or uncertain
- What the user can inspect or do next

## Data Sources

The Order Story may use approved commerce, Product, tracking, affiliate, payment, cost, shipping, financial, and Connector Evidence.

This storyboard does not define source mappings or imply that any Connector or Evidence source is already complete.

## Data Freshness Requirements

The Workspace must communicate the freshness and completeness of material Evidence.

Stale, pending, partial, or unavailable information must be disclosed wherever it affects Profit, a deduction, attribution, Tracking Health, Shipping, or a recommendation.

No fixed freshness interval is established by this storyboard.

## Profit/Attribution Implications

Profit is the customer-facing label.

Its status badge is Estimated or Reconciled.

Estimated means the value is based on all currently available information and may change as additional information arrives.

When known, the Workspace identifies expected financial inputs that are still pending.

Reconciled means the value has been verified against all expected inputs and is considered final for the applicable reporting period.

The Order Workspace must preserve first-touch attribution while showing the Touchpoints, Identifiers, Affiliate, Campaign, Creative, Offer URL, Landing Page, and matching Evidence that support the Order's attribution Story.

## Desktop Layout

Desktop is the primary investigation experience.

Use the shared TraceKit master-detail shell established by the Customer Workspace:

- Compact permanent Order list on the left
- Broad continuous Order Workspace in the center
- Attached Temporary Context Drawer on the right

The Main Workspace uses the available center width without a centered bounded canvas or permanent internal context rail. The header spans the center Workspace. The Profit Ledger is the visual and narrative hero; Commercial Summary, Shipping, Attribution, Order Timeline, and mock TraceKit Intelligence observations follow in a natural vertical hierarchy.

## Tablet Layout

The Order list may collapse. The Workspace remains primary, and the Evidence Drawer may overlay more of the available width.

The Profit Ledger preserves the sequence and label of every financial amount.

## Mobile Layout

The Order list may become a temporary selection surface. The Evidence Drawer may become full-width.

The hierarchy must preserve Order identity, Profit qualification, the Profit Ledger, Customer, Tracking Health, and next inspection. Wide financial and Timeline sequences may scroll without relying on color.

## Loading State

Preserve the Workspace hierarchy while Order information loads.

Do not display unsupported Profit, attribution, or Tracking Health conclusions during loading.

## Empty State

Explain which approved area has no observed information, such as missing attribution, no upsell, or no Financial Event.

Do not treat unavailable Evidence as proof that an event did not occur.

## Partial Data State

Identify which financial, commerce, attribution, or tracking Evidence is available, what is missing, and how the limitation affects Profit or another conclusion.

Partial data must not appear Reconciled or complete.

## Stale Data State

Show the affected Evidence, its last known freshness, the impact on the Order Story, and any available next action.

Stale Evidence must not silently retain a trusted appearance.

## Error State

Explain what could not be shown, what part of the Order Story remains available, and what the user can retry or inspect next.

An error in the Evidence Drawer must not discard the Permanent Context.

## Permissions

Permission rules must preserve the same Order Story hierarchy while restricting sensitive Evidence and actions appropriately.

Specific production roles and permission boundaries remain to be defined before production approval.

## Accessibility

- No important state relies on color alone.
- Every status includes text and/or an icon.
- Estimated and Reconciled badges use a label, icon, shape, and high contrast.
- Tracking Health uses a label, icon, shape, and high contrast.
- Evidence Drawer status is explicit.
- Timeline states use labels and shapes in addition to color.
- The Profit Ledger remains understandable in grayscale through labels, signed values, hierarchy, and explicit status.
- Charts use labels, line styles, marker shapes, or patterns in addition to color.
- The Color Vision Optimized appearance palette remains part of the product direction.
- Keyboard and assistive-technology users receive equivalent access to the Order Story, Evidence, Relationships, Explain, and actions.

## Analytics / Product Events

Product measurement requirements will be defined before production implementation.

The concept does not prescribe analytics events or introduce separate product behavior.

## Out of Scope

- Live data integration for the prototype
- Production Connector behavior
- Production permissions
- Final responsive specifications
- Final visual styling
- Source-specific financial or attribution mappings
- TraceKit Intelligence in Version 1
- AI chat

## Demo Script

1. Open Universal Search with Command+K or Control+K.
2. Paste an Everflow Transaction ID or Order ID.
3. TraceKit detects the Identifier and opens the matching Order Workspace.
4. Confirm the Order, Customer, Profit, Estimated or Reconciled status, and Tracking Health.
5. Use the Profit Ledger to explain Revenue, commercial composition, every cost, shipping economics, tax treatment, and Net Profit.
6. Open Shipping to compare Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin.
7. Open Processor Fees to compare the pricing rule, capture-level calculations, expected fee, observed fee, and signed variance.
8. Open attribution and use Explain to show why the source, Affiliate, and Campaign were assigned.
9. Inspect URLs, parameters, Identifiers, redirects, and Tracking Diagnostics in the Journey / Attribution Evidence Drawer.
10. Replay the Order Timeline from click through Profit and any refund, then finish with the complete Order Story and supporting Evidence.

This sequence should be presentable in approximately 90 seconds.

## Future Enhancements

TraceKit Intelligence is the only future capability identified for this storyboard.

It may surface contextual, evidence-backed business observations and recommendations with Explain and View Evidence. It is not AI chat and must not make unsupported claims.

No other functionality is committed beyond Version 1. Later storyboard versions may refine approved interaction patterns based on Product Review.

## Open Questions

- Final Order-list density and selection behavior
- Whether the Evidence Drawer overlays or pushes content
- Whether the Profit Ledger should show a running balance on every row or only at meaningful financial boundaries
- Whether commercial composition should receive product-level prices when authoritative item allocations are available
- Which raw source fields belong in each Financial Analysis Drawer in production Version 1
- How rounding policy should be explained when capture-level rounded fees differ from processor-level settlement rounding
- Whether the Order Timeline uses a horizontal, vertical, or hybrid layout
- Whether Replay Journey adds enough practical value in the Order context
- Final Universal Search result ranking when one Identifier matches multiple Orders or Objects
- Which Relationships become directly navigable in production Version 1
- When TraceKit Intelligence becomes eligible for a separately approved storyboard version

## Decisions Made

- The Order is the Permanent Context.
- The Workspace is an Order Profit Investigation Workspace, not an ecommerce order page.
- The vertical Profit Ledger is the hero and replaces the equal-card waterfall presentation.
- Profit uses Estimated or Reconciled qualification.
- Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin remain distinct.
- Every important financial and attribution conclusion supports Explain.
- A shared Drawer shell provides Temporary Context with Financial Analysis and Journey / Attribution Evidence hierarchies.
- Financial Analysis answers why an amount is what it is before exposing raw Evidence.
- Processor Fee Analysis shows its pricing rule, capture-level formula, expected fee, observed fee, and signed variance.
- The Order Workspace uses the shared TraceKit list–workspace–drawer shell established by the Customer Workspace.
- Universal Search deep-links into the matching Order and Evidence.
- Replay Journey remains part of the product vision.
- Important states and financial sequences do not rely on color alone.
- TraceKit Intelligence is future, contextual, evidence-backed, and not AI chat.

See the [Product Decision Log](../PRODUCT_DECISIONS.md).

## Acceptance Criteria

- [ ] The selected Order remains the Permanent Context throughout investigation.
- [ ] The One Sentence Test can be answered from the Workspace.
- [ ] The vertical Profit Ledger is the hero and explains Revenue, commercial composition, costs, shipping, tax treatment, and Net Profit.
- [ ] The Profit Ledger does not use equal-sized financial cards, decorative mini-bars, or repeated deduction labels.
- [ ] Every deduction supports Explain, Evidence, and Related Objects.
- [ ] Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin are distinct and inspectable.
- [ ] Profit uses Estimated or Reconciled qualification.
- [ ] Attribution shows Traffic Source, Affiliate, Campaign, Creative, Offer URL, Landing Page, and Click → Purchase Delta.
- [ ] Every important conclusion supports Explain.
- [ ] Universal Search opens the correct Order and focuses matching Evidence.
- [ ] The shared Drawer shell preserves the Order context and adapts its hierarchy to the inspected Object.
- [ ] Financial Analysis begins with amount, business meaning, calculation, source, status, Profit impact, and Explain.
- [ ] Journey / Attribution Evidence begins with what happened before exposing tracking Evidence.
- [ ] Processor Fee Analysis shows the configured pricing rule, every capture calculation, expected fee, observed fee, signed variance, settlement status, Profit impact, Explain, and supporting Evidence.
- [ ] Raw Evidence remains inspectable without becoming the default experience.
- [ ] Tracking Diagnostics distinguish observed Evidence from inference.
- [ ] No unsupported claim identifies a specific browser extension or blocker.
- [ ] Status, Tracking Health, Timeline states, and the Profit Ledger remain understandable without color.
- [ ] The prototype includes healthy profitable, low-margin, shipping-loss, high-affiliate-commission, refunded, chargeback, and tracking-issue scenarios.
- [ ] TraceKit Intelligence remains clearly separated from Version 1 implementation.
- [ ] The prototype passes [PRODUCT_REVIEW_CHECKLIST.md](../PRODUCT_REVIEW_CHECKLIST.md) before production approval.

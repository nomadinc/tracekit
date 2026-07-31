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

### 2. Profit Breakdown

Profit Breakdown is the hero of the Order Workspace.

It tells the financial Story as a clear waterfall-like explanation:

Revenue

↓

Media Cost

↓

Affiliate Commission

↓

Processor Fees

↓

COGS

↓

Shipping Charged

↓

Actual Shipping Cost

↓

Packaging

↓

Taxes

↓

Net Profit

Every amount and deduction supports:

- Explain
- Evidence
- Related Objects

The waterfall must remain understandable without color and must not imply that an Estimated value is final.

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

Selecting Shipping opens the Evidence Drawer with the related Financial Events, calculation, source information, and Explain.

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
- Evidence Drawer
- Relationships
- Explain

Replay Journey allows the user to step through this lifecycle while retaining the Order as Permanent Context.

### 7. TraceKit Intelligence

TraceKit Intelligence is a future capability and is not required in Version 1 of the prototype.

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

These examples demonstrate the intended interaction only. No recommendation may appear unless its supporting Evidence and comparison are available.

## Primary Information

The default hierarchy is:

1. Order identity and status
2. Profit with Estimated or Reconciled qualification
3. Profit Breakdown
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

- Inspect any Profit Breakdown amount
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

The Evidence Drawer is the primary Temporary Context.

Selecting Processor Fees, Affiliate Commission, Shipping, Media Cost, COGS, attribution, or a Timeline event opens the relevant Drawer while preserving the selected Order.

The Drawer uses the approved Customer Workspace interaction model and includes:

- Summary
- Raw URL, when relevant
- Query parameters
- Identifiers
- Redirect path
- Tracking Diagnostics
- Relationships
- Explain
- Evidence

Closing the Drawer returns the user to the same Order and investigation position.

## Evidence

Relevant Evidence includes:

- Order and Product source information
- Revenue, discounts, quantities, tax, and Shipping Charged
- Payment and processor fee information
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
- Open the relevant Evidence Drawer
- Preserve the searched Identifier in context

Universal Search is an entry into the Order Story, not a separate destination.

## Explain

Every important conclusion supports Explain, including:

- Net Profit
- Estimated or Reconciled status
- Each Profit Breakdown amount
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

Use a master-detail structure:

- Compact Order list or selection context
- Order Workspace
- Evidence Drawer when Temporary Context is open

Profit Breakdown is the visual and narrative hero. Commercial Summary, Shipping, Attribution, and Order Timeline follow in a clear Story hierarchy.

## Tablet Layout

The Order list may collapse. The Workspace remains primary, and the Evidence Drawer may overlay more of the available width.

Profit Breakdown may stack while preserving the sequence and label of every financial amount.

## Mobile Layout

The Order list may become a temporary selection surface. The Evidence Drawer may become full-width.

The hierarchy must preserve Order identity, Profit qualification, Profit Breakdown, Customer, Tracking Health, and next inspection. Wide financial and Timeline sequences may scroll without relying on color.

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
- Profit Breakdown remains understandable in grayscale.
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
5. Use Profit Breakdown to explain Revenue and every deduction through Net Profit.
6. Open Shipping to compare Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin.
7. Open attribution and use Explain to show why the source, Affiliate, and Campaign were assigned.
8. Inspect URLs, parameters, Identifiers, redirects, and Tracking Diagnostics in the Evidence Drawer.
9. Replay the Order Timeline from click through Profit and any refund.
10. Finish with the complete Order Story and the Evidence supporting its financial and attribution conclusions.

This sequence should be presentable in approximately 90 seconds.

## Future Enhancements

TraceKit Intelligence is the only future capability identified for this storyboard.

It may surface contextual, evidence-backed business observations and recommendations with Explain and View Evidence. It is not AI chat and must not make unsupported claims.

No other functionality is committed beyond Version 1. Later storyboard versions may refine approved interaction patterns based on Product Review.

## Open Questions

- Final Order-list density and selection behavior
- Whether the Evidence Drawer overlays or pushes content
- Final waterfall presentation at narrower widths
- Whether Profit Breakdown deductions should group into financial phases
- Whether the Order Timeline uses a horizontal, vertical, or hybrid layout
- Whether Replay Journey adds enough practical value in the Order context
- Final Universal Search result ranking when one Identifier matches multiple Orders or Objects
- Which Relationships become directly navigable in production Version 1
- When TraceKit Intelligence becomes eligible for a separately approved storyboard version

## Decisions Made

- The Order is the Permanent Context.
- The Workspace is an Order Profit Investigation Workspace, not an ecommerce order page.
- Profit Breakdown is the hero.
- Profit uses Estimated or Reconciled qualification.
- Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin remain distinct.
- Every important financial and attribution conclusion supports Explain.
- The Evidence Drawer provides Temporary Context.
- Universal Search deep-links into the matching Order and Evidence.
- Replay Journey remains part of the product vision.
- Important states and financial sequences do not rely on color alone.
- TraceKit Intelligence is future, contextual, evidence-backed, and not AI chat.

See the [Product Decision Log](../PRODUCT_DECISIONS.md).

## Acceptance Criteria

- [ ] The selected Order remains the Permanent Context throughout investigation.
- [ ] The One Sentence Test can be answered from the Workspace.
- [ ] Profit Breakdown is the hero and explains Revenue through Net Profit.
- [ ] Every deduction supports Explain, Evidence, and Related Objects.
- [ ] Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin are distinct and inspectable.
- [ ] Profit uses Estimated or Reconciled qualification.
- [ ] Attribution shows Traffic Source, Affiliate, Campaign, Creative, Offer URL, Landing Page, and Click → Purchase Delta.
- [ ] Every important conclusion supports Explain.
- [ ] Universal Search opens the correct Order and focuses matching Evidence.
- [ ] The Evidence Drawer preserves the Order context.
- [ ] Raw Evidence remains inspectable without becoming the default experience.
- [ ] Tracking Diagnostics distinguish observed Evidence from inference.
- [ ] No unsupported claim identifies a specific browser extension or blocker.
- [ ] Status, Tracking Health, Timeline states, and Profit Breakdown remain understandable without color.
- [ ] The prototype includes healthy profitable, low-margin, shipping-loss, high-affiliate-commission, refunded, chargeback, and tracking-issue scenarios.
- [ ] TraceKit Intelligence remains clearly separated from Version 1 implementation.
- [ ] The prototype passes [PRODUCT_REVIEW_CHECKLIST.md](../PRODUCT_REVIEW_CHECKLIST.md) before production approval.

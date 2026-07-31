# Storyboard 001 — Customer Workspace

Version: 1.0
Status: Approved for Prototype

## Storyboard Name

Customer Workspace

## Status

Approved for Prototype

## Version

1.0

## Purpose

The Customer Workspace is the primary environment for understanding and investigating a customer's complete business story.

It makes the Customer the permanent context while allowing business owners and specialists to follow Journeys, Orders, Touchpoints, Identifiers, Financial Events, Connector events, and Evidence without losing place.

## Primary Question

> Tell me everything about this customer.

## Primary Persona

The Customer Workspace serves these primary personas at different levels of depth:

- Founder / CEO
- Marketing Director
- Media Buyer
- Affiliate Manager
- Finance
- Operations
- Customer Support
- Tracking Expert

The default Story must remain understandable to a business owner. Progressive disclosure must provide the forensic depth required by a Tracking Expert.

## Secondary Users

Platform administrators may use the Workspace to understand how Connector health or configuration affects the Customer Story.

## User Questions Answered

- Who is this Customer?
- Did the business make money?
- Where did the Customer come from?
- What happened throughout the Journey?
- Is there a problem?
- Why was attribution assigned?
- What Evidence supports the conclusion?
- What should the user inspect or do next?

## Success Criteria

A business owner should be able to answer within ten seconds:

- Who is this customer?
- Did we make money?
- Where did the customer come from?
- Is there a problem?
- What should I inspect next?

A Tracking Expert should be able to answer:

- Why was attribution assigned?
- Where did an Identifier originate?
- Where did it propagate?
- Where was it lost?
- What Evidence supports the conclusion?
- Was tracking interference likely?
- Which systems and events are related?

Success is measured by the clarity and trust of these answers, not by technical completion or the amount of information displayed.

## Entry Points

- Customer list
- Universal Search
- Order
- Campaign
- Affiliate
- Financial Event
- Connector
- Evidence Relationship

Every entry point must restore the correct Customer as Permanent Context and focus the relevant Temporary Context or Evidence.

## Permanent Context

The selected Customer remains the Permanent Context.

Orders, Touchpoints, Identifiers, Financial Events, and Connector events are Temporary Contexts. Inspecting them must not replace the Customer or fragment the Customer Story.

## Primary Sections

### 1. Customer Summary

The Customer Summary must include:

- Customer name
- Status
- Profit
- Estimated or Reconciled badge
- Customer since
- First touch
- Last activity
- Tracking Health
- Replay Journey

Do not lead with CRM contact fields.

### 2. Customer Story / Journey

The Customer Story presents the complete sequence of meaningful Touchpoints and outcomes.

Interactive events may include:

- Ad click
- Tracking redirect
- Landing page
- Checkout
- Purchase
- Upsell
- Payment
- Affiliate conversion
- Financial import
- Profit update
- Refund or chargeback when applicable

Every Journey event must support:

- Hover preview
- Click inspection
- Evidence Drawer
- URL details
- Query parameters
- Identifiers
- Redirect path
- Tracking Diagnostics
- Relationships
- Explain

### 3. Orders

Orders show:

- Order number
- Date
- Revenue
- Profit
- Estimated or Reconciled badge
- Status
- Attribution source

Selecting an Order opens Temporary Context while preserving the Customer.

### 4. Tracking Health

Tracking Health represents the completeness and reliability of observed tracking Evidence.

The state must be supported by Tracking Diagnostics and must distinguish observation from inference. It must not claim knowledge of a specific browser extension or blocker.

### 5. Recommendations or Next Actions

Recommendations or next actions appear only when Evidence supports them.

Each important conclusion or recommended action must support Explain and disclose limitations or uncertainty.

## Primary Information

The default hierarchy is:

1. Customer identity and status
2. Profit with Estimated or Reconciled qualification
3. First touch and last activity
4. Tracking Health
5. Customer Story / Journey
6. Orders
7. Evidence-supported next actions

## Primary KPIs

- Profit, qualified as Estimated or Reconciled
- Lifetime revenue
- Customer since
- First touch
- Last activity
- Tracking Health

No unqualified profit value may appear.

## Primary Actions

- Inspect a Journey event
- Open Explain
- Inspect an Order
- Replay Journey
- Follow a Relationship
- Open Evidence through Universal Search

## Secondary Actions

- Search or filter the Customer list
- Copy an Identifier or raw Evidence value
- Expand diagnostics or related Objects
- Pause, advance, or select an event during Replay Journey

## Alerts and Warnings

Alerts and warnings may communicate:

- Degraded or Poor Tracking Health
- Lost or missing Identifiers
- Tracking interference likely
- Refund or chargeback
- Stale or partial Evidence
- Pending financial inputs

Every state must include text and/or an icon and must not rely on color alone.

## Drill-Downs

Users may inspect:

- Journey events
- Orders
- URL and redirect details
- Query parameters
- Identifiers
- Tracking Diagnostics
- Financial inputs
- Relationships
- Explain

Drill-downs remain inside the Customer Workspace through progressive disclosure and Temporary Context.

## Temporary Context

Orders, Touchpoints, Identifiers, Financial Events, and Connector events open through a Drawer while the Customer remains selected.

The Evidence Drawer is the primary temporary inspection surface for Journey events and related forensic information.

Panels or Modals may present subordinate information or focused actions, but they must not replace the Customer or become a separate object-inspection destination.

Closing Temporary Context returns the user to the same Customer and Story position.

## Evidence

Relevant Evidence includes:

- Source timestamps
- Original, referrer, and destination URLs
- Query parameters
- Customer, Journey, session, click, affiliate, Order, and payment Identifiers
- Redirect hops and observed transitions
- Order and payment information
- Financial inputs and status
- Tracking Diagnostics
- Relationships and matching signals

Raw Evidence remains inspectable but is not the default experience. Immutable source information must remain distinct from TraceKit's interpretation.

## Universal Search

Universal Search supports deep-linking from:

- Email
- Phone
- Order ID
- Everflow Transaction ID
- `fbclid`
- `gclid`
- Session ID
- Payment ID
- TraceKit Journey ID

Selecting a search result must:

- Open the correct Customer
- Focus the matching Journey event or Related Object
- Highlight the match
- Open the relevant Drawer
- Preserve the searched Identifier in context

Universal Search is an entry into the Customer Story, not a separate destination.

## Explain

Every important conclusion supports Explain, including:

- First-touch attribution
- Attribution confidence
- Tracking Health
- Tracking interference likely
- Identifier propagation or loss
- Profit status
- Evidence-supported next actions

Explain must state the conclusion, reason, supporting Evidence, confidence, limitations, and next inspection or action.

## Data Sources

The Customer Story may use approved commerce, tracking, affiliate, payment, financial, and Connector Evidence.

This storyboard does not define source mappings or imply that any Connector or Evidence source is already complete.

## Data Freshness Requirements

The Workspace must communicate the freshness and completeness of material Evidence.

Stale, pending, partial, or unavailable information must be disclosed wherever it affects Tracking Health, attribution, Profit, or a recommended action.

No fixed freshness interval is established by this storyboard.

## Profit/Attribution Implications

Profit is the customer-facing label.

Its status badge is Estimated or Reconciled.

Estimated explanation:

> This profit is based on all available sales, fees, commissions, and costs received so far.
>
> Some financial data is still pending, so this amount may change slightly.

When known, Estimated Profit includes a “Waiting on” list, such as:

- PayPal settlement
- Monthly processor statement

Reconciled explanation:

> All expected financial data has been received and verified.
>
> This amount is considered final for the selected reporting period.

First-touch attribution remains permanently preserved. Subsequent Touchpoints extend the Story without replacing the original source.

## Desktop Layout

Desktop is the primary investigation experience.

Use a master-detail structure:

- Compact Customer list
- Customer Workspace
- Evidence Drawer when Temporary Context is open

The Customer Story may scroll within the Workspace while the selected Customer remains clear.

## Tablet Layout

The Customer list may collapse. The Customer Workspace remains primary, and the Evidence Drawer may overlay more of the available width.

The Journey may scroll while retaining event labels and state signals.

## Mobile Layout

The Customer list may become a temporary selection surface. The Evidence Drawer may become full-width.

The hierarchy must preserve Customer identity, Profit status, Tracking Health, Story, and next actions. Forensic depth remains available through progressive disclosure.

## Loading State

Preserve the Workspace hierarchy while information loads.

Communicate which Customer or Story is loading without presenting unsupported conclusions or financial values.

## Empty State

Explain whether the Customer has no observed Journey, Orders, or relevant Evidence.

Provide the next meaningful action without implying that missing information is known to be absent from every source.

## Partial Data State

Identify which Evidence is available, what is missing or pending, and how the limitation affects attribution, Tracking Health, Profit, or Explain.

Partial data must not appear complete.

## Stale Data State

Show the affected Evidence, its last known freshness, the impact on conclusions, and any available next action.

Stale data must not silently retain a trusted appearance.

## Error State

Explain what could not be shown, whether the Customer Story remains partially available, and what the user can retry or inspect next.

An error in Temporary Context must not discard the Permanent Context.

## Permissions

Permission rules must preserve the same Customer Story hierarchy while restricting sensitive Evidence and actions appropriately.

Specific production roles and permission boundaries remain to be defined before production approval.

## Accessibility

- No important state relies on color alone.
- Status includes text and/or an icon.
- Text, controls, focus, and state use high contrast.
- The Workspace remains understandable in grayscale.
- A Color Vision Optimized appearance palette is part of the product direction.
- Charts and Journey states use labels, icons, shapes, patterns, or line styles in addition to color.
- Keyboard and assistive-technology users receive equivalent access to Story, Evidence, Relationships, Explain, and actions.

## Analytics / Product Events

Product measurement requirements will be defined before production implementation.

The concept does not prescribe analytics events or introduce a separate product behavior.

## Out of Scope

- Live data integration for the prototype
- Production Connector behavior
- Production permissions
- Final responsive specifications
- Final visual styling
- Source-specific financial or attribution mappings

## Demo Script

1. Open Universal Search with Command+K or Control+K.
2. Paste an Everflow Transaction ID.
3. TraceKit detects the Identifier.
4. Select the matching result.
5. Open the Customer Workspace at the matching Journey event.
6. Inspect the URL, parameters, Identifiers, redirects, and diagnostics.
7. Use Explain to show why attribution was assigned.
8. Use Replay Journey to show the lifecycle.
9. Open the Estimated Profit badge and show pending financial inputs.
10. Finish with the complete Customer Story and related Evidence.

This sequence should be presentable in approximately 90 seconds.

## Future Enhancements

No additional functionality is committed beyond Version 1.

Later storyboard versions may refine approved interaction patterns based on Product Review. Refinements must remain within the Product Blueprint, Object Model, Workspace Design System, and recorded Product Decisions unless separately approved.

## Open Questions

- Horizontal, vertical, or hybrid Journey layout
- Whether the Evidence Drawer overlays or pushes content
- Whether Journey nodes should be grouped into phases
- Whether Replay Journey adds enough practical value
- Final Customer-list density
- Final Universal Search result ranking
- Which Relationships become directly navigable in production Version 1

## Decisions Made

- The Customer is the Permanent Context.
- Orders and events use Temporary Context.
- Universal Search accepts any supported Identifier and deep-links into the Customer Workspace.
- Universal Forensic Analysis remains inside the Workspace.
- Every important conclusion supports Explain.
- Profit uses Estimated or Reconciled qualification.
- Replay Journey remains part of the product vision.
- Important states do not rely on color alone.

See the [Product Decision Log](../PRODUCT_DECISIONS.md).

## Acceptance Criteria

- [ ] Permanent Customer context is never lost.
- [ ] The business Story is understandable before opening raw Evidence.
- [ ] Every important conclusion supports Explain.
- [ ] Universal Search deep-links correctly.
- [ ] Raw Evidence remains inspectable.
- [ ] Profit uses Estimated or Reconciled.
- [ ] Status is understandable without color.
- [ ] Tracking Diagnostics distinguish observed Evidence from inference.
- [ ] No unsupported claim identifies a specific browser extension or blocker.
- [ ] The prototype passes [PRODUCT_REVIEW_CHECKLIST.md](../PRODUCT_REVIEW_CHECKLIST.md) before production approval.

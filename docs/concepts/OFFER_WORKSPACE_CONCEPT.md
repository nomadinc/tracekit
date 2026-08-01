# Offer Workspace Concept

## Route

`/concepts/offer-workspace`

## Purpose

This isolated, mock-only concept tests whether the Offer Workspace can answer:

> Tell me how this Offer is performing, why it is performing that way, and whether I should invest more money in it.

Its Primary Question is: “Should I spend more money on this Offer?”

## Business Context Behavior

Logo-and-text Business Context selectors represent five distinct Offers. Selecting one replaces the complete commercial, financial, Traffic, Customer, Timeline, and Intelligence Story while preserving the TraceKit shell. The interaction is a change of Permanent Context, not a report filter.

The concept demonstrates a user-selected default in local component state and falls back to the first context. It does not use localStorage or production persistence.

## Permanent Context

The selected Offer remains visible while the user inspects Traffic Sources, Profit Drivers, Customers, Orders, Timeline events, comparisons, and Evidence through Temporary Context.

## Offer Summary

The summary leads with qualified Profit and performance, then Revenue, Spend, Profit Margin, ROAS, CPA, Orders, Customers, Average Order Value, refund and chargeback rates, Tracking Health, trend, and attention state.

## Traffic Sources

Traffic Source contribution appears beneath the strategic Offer. Campaigns, Ad Sets, Creatives, Affiliates, and attribution Evidence remain subordinate drill-downs.

## Profit Drivers

Material financial contributors are ordered by impact. Every driver opens a financial-first explanation with amount, meaning, next inspection, Related Objects, and Evidence.

## Customer Quality

New and returning Customers, lifetime value, repeat behavior, click-to-purchase time, high-value contribution, refunds, chargebacks, and Tracking quality remain connected to the Offer.

## Profit and Performance Trend

One continuous trend chart replaces the repeated daily mini-bars. It defaults to Profit over the last seven days and provides mock 7-, 14-, and 30-day controls. Profit, Revenue, Spend, CPA, ROAS, and Orders may be toggled. Direct labels, markers, and distinct line styles preserve meaning without relying on color.

Significant Event markers connect the trend to relevant business changes. Inspection states what changed, what happened afterward, what Evidence supports the relationship, and whether the relationship is observed or inferred. The concept does not claim unsupported causation.

## Significant Events

Significant Events replaces the generic Offer Timeline. It includes only business changes that help explain performance movement. Selecting an event focuses the related chart marker when available and opens a context-adaptive Drawer with the event, subsequent performance, Relationships, Explain, and Evidence.

## Universal Search

Command+K or Control+K opens mock evidence search. Offer names, URLs, Campaigns, Affiliates, Orders, Customer email, Everflow IDs, and click IDs restore the correct Business Context, highlight a related section where applicable, open the appropriate Drawer, and preserve the searched value.

## Compare Mode

Compare begins as a secondary Business Context action. A focused selector accepts two to four contexts and temporarily transforms the Workspace into a readable decision comparison. Closing Compare restores the previous Offer.

The comparison includes Profit, Revenue, Spend, Profit Margin, ROAS, CPA, Orders, Customers, Average Order Value, refunds, chargebacks, Shipping Margin, lifetime value, repeat purchase, and Tracking Health. A dedicated Performance Drivers section shows explicit deltas for acquisition efficiency, refunds, shipping economics, Average Order Value, and Customer durability.

### Traffic Source Comparison

Compare Mode ranks Meta / Facebook, Google, TikTok, Affiliates, Native, Email, and Organic within each selected Business Context. Each source exposes Spend, Revenue, Profit, ROAS, CPA, Orders, Refund Rate, Customer Lifetime Value, and Tracking Health. Rankings, labels, values, and explicit differences make the comparison understandable without color.

### Comparison Conclusion

The decision summary identifies the best overall Offer, strongest Traffic Source, weakest Traffic Source, primary performance drivers, and a bounded mock budget action. Explain and Evidence map each conclusion back to the visible matching-period values rather than relying on a generic top-level claim.

## TraceKit Intelligence

TraceKit Intelligence remains a proactive future add-on, but it is distributed contextually rather than isolated in a standalone section. Restrained callouts appear only where structured mock Evidence supports a useful decision: Profit, the performance trend, Traffic Sources, Profit Drivers, Customer Quality, Shipping, Tracking Health, Significant Events, and Compare Mode.

Each callout opens the attached Intelligence Drawer and separates Fact, Inference, Recommendation, and evidence strength. Supporting Evidence and Related Objects remain inspectable. Intelligence never replaces Core Explain or Evidence.

## MCP Chat Distinction

The lightweight MCP Chat entry point is labeled reactive Core functionality. It offers example prompts but does not replace the visual Workspace or simulate a production chat implementation.

## Drawer Behavior

One responsive shell adapts to the inspected Object:

- Traffic Source: “How is this source contributing to Offer performance?”
- Campaign or Related Object: “How does this Object relate to Offer performance?”
- Profit Driver: “Why is this amount affecting Offer Profit?”
- Significant Event: “What changed, what happened afterward, and what Evidence connects them?”
- Intelligence: “What did TraceKit notice, why does it matter, and what action is recommended?”
- Comparison: “Why is one Business Context outperforming another?”

Business explanation precedes Related Objects, supporting Evidence, and raw mock values.

## Accessibility

Identity uses a logo placeholder, text, and explicit selected/default state. Trends use direction icons, words, and values. Financial states and Tracking Health use text and icons. The primary performance visualization uses direct labels, borders, pattern, and values so it remains meaningful without color. Controls use native buttons and inputs with focus treatments.

## Responsive Behavior

Desktop uses the shared TraceKit list–Workspace–Drawer shell. Business Context selection becomes a full-width temporary surface at narrow widths. Trend controls wrap, the continuous chart preserves its ordered x-axis, Traffic Source comparisons stack, summary metrics and content grids reflow, and the Drawer becomes full-width. Horizontal scrolling is retained only for genuinely dense source data.

## Mock-Only Assumptions

- All Offers, metrics, trends, Customers, Orders, Traffic, costs, Timeline events, Relationships, Evidence, comparisons, Intelligence, and search detection are local mock data.
- Daily Profit, Revenue, Spend, CPA, ROAS, Orders, source-level Customer quality, comparison deltas, rankings, annotations, and evidence-strength labels are structured mock values.
- Brand marks are text-based mock assets stored with the data, not production logos.
- Default selection lasts only for the current component session.
- No APIs, Connectors, authentication, persistence, production data, or live behavior are used.

## Product Questions Still Requiring Review

- Final Business Context selector density and overflow behavior
- Maximum visible and comparable contexts
- Brand versus Offer hierarchy in the selector
- Compare Mode limits and narrow-screen behavior
- Final Traffic Source drill-down depth for Prototype Version 1
- Which Relationships become directly navigable
- Final subtle brand-accent treatment
- Whether Campaign later receives a subordinate child Workspace
- Whether the primary performance visualization should include one metric or multiple directly labeled measures
- Whether multi-measure trends should normalize incompatible units or preserve separate axes
- Final rules for establishing observed association versus likely contribution
- Whether Traffic Source Comparison should default to Profit, Profit per Customer, or a user-selected decision metric
- Whether Compare Mode should permit four contexts on ordinary laptop widths
- Whether MCP Chat belongs in the shared header or another secondary surface

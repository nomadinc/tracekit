# Customer Workspace Concept

## Route

`/concepts/customer-workspace`

This is an isolated, local-only UX concept. It is not linked from production navigation and does not connect to live customer data.

## Interactions Implemented

- Select, search, and filter customers in an information-dense master list.
- Inspect customer-level Operational Profit, lifetime revenue, first touch, last purchase, and Tracking Health.
- Hover every journey node for a concise evidence preview.
- Open any journey event in a persistent forensic evidence drawer.
- Inspect URLs, query parameters, identifiers, redirect hops, tracking diagnostics, relationships, and explanations.
- Open an order in the same evidence drawer while preserving customer context.
- Open Universal Search from the header or with Command+K on macOS and Control+K elsewhere.
- Paste realistic customer, order, journey, session, click, Everflow, Stripe, or PayPal identifiers.
- Deep-link from a search result to the matching customer and evidence, highlight the journey node, and focus the searched identifier.
- Start, pause, restart, advance, and inspect a lightweight journey replay.
- Collapse the customer list on narrower screens and present the evidence drawer full-width.

## Assumptions

- The primary desktop user is investigating a known customer or identifier.
- The customer remains the permanent context; events and orders are temporary inspection contexts.
- Operational Profit is useful during the day but is not presented as Reconciled Profit.
- Tracking Health expresses observable evidence and confidence, not certainty about a user's browser configuration.
- Concept styling follows the current TraceKit slate, cyan, border, typography, and status language where practical.

## Intentionally Mocked

- All customers, journeys, orders, identifiers, financial values, and tracking observations.
- Identifier detection and result matching.
- Journey replay timing.
- Relationship navigation and external-object actions.
- Copy operations affect only the local clipboard.
- No API requests, authentication changes, connector activity, persistence, or production mutations occur.

## Questions This Prototype Is Intended to Answer

- Does the master-detail structure make the customer feel like the permanent context?
- Can a business owner understand the customer story without starting from CRM fields?
- Does progressive disclosure make forensic depth available without overwhelming the default experience?
- Is one evidence drawer sufficient for journey events, orders, payments, and related objects?
- Does Universal Search feel like evidence search rather than system-specific search?
- Can tracking experts understand exactly why TraceKit assigned attribution and Tracking Health?
- Is the journey replay useful for explanation and support workflows?
- Which information deserves priority before this concept informs Chapter 5 navigation decisions?

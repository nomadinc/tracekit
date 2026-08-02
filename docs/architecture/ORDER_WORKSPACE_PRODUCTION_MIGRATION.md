# Order Workspace Production Migration

Version: 1.0  
Status: Phase 1 — Mock Repository

## Production Boundary

The approved Order Workspace is available at `/orders` inside the shared production shell. `OrderRepository` supplies scoped Order summaries, Workspace snapshots, the Profit Ledger, commercial composition, financial analyses, attribution, timeline events, identifiers, redirects, diagnostics, Intelligence observations, Drawer records, search results, and deep-link resolution. `MockOrderRepository` returns fresh serializable clones and uses no live connector data.

## Scope and Permissions

Every repository request includes authentication, identity, active Organization, and Business Context. Orders are restricted to accessible Organizations and Offers. `orders.view` controls Workspace access. `orders.view_financials` with `financials.view` controls Profit Ledger details, while `customers.view_sensitive_data` controls Customer email and phone. Product Admin identities do not enter tenant Order data.

## Deep-Link Contract

The production route supports `order_id`, `focus`, `line`, `attribution`, `event_id`, `identifier`, `customer_id`, `offer_id`, `drawer`, `search`, and `replay`. Typed parsing and normalization reject stale or inaccessible Order, financial-line, event, Identifier, relationship, and Drawer state. Mission Control, Customer, Offer, and Universal Search use production routes and preserve development identity.

## Profit and Financial Analysis

The vertical Profit Ledger preserves explicit signed values from Revenue through commercial composition, costs, Shipping, taxes, and qualified Net Profit. Shipping Charged, Actual Shipping Cost, Packaging, and Net Shipping Margin are visible without opening the Drawer.

Financial Analysis Drawers answer why an amount is what it is before exposing Evidence. Processor Fee Analysis renders processor-agnostic structured pricing, percentage and fixed fees, each capture formula, expected and observed totals, signed variance, settlement state, and Profit impact. Fixed fees are applied once per capture.

## Journey Evidence

Journey and attribution Drawers answer what happened and what tracking Evidence proves it. They progressively disclose URLs, parameters, Identifiers, redirect paths, Tracking Diagnostics, relationships, Explain, and Evidence. Replay Journey uses the same Order Timeline while retaining the Order as Permanent Context.

## Remaining Live-Data Work

A future repository must aggregate authorized commerce, payment, shipping, media, affiliate, financial, Customer, and tracking read models; implement server-side authorization and sensitive-access auditing; connect live search and MCP resolution; and add caching, observability, reconciliation, and rounding-policy explanations. Contextual Intelligence remains structured mock content rather than a live engine.

# Customer Workspace Production Migration

Version: 1.0  
Status: Phase 1 — Mock Repository

## Production Boundary

The approved Customer Workspace is available at `/customers` in the shared production shell. `CustomerRepository` supplies serializable summaries, Workspace snapshots, Journey events, Tracking Health, privacy signals, Identifiers, redirect paths, relationships, Explain content, Evidence, related Orders and Offers, Drawer records, search results, and deep-link resolution. `MockCustomerRepository` is the only Phase 1 implementation and returns fresh clones; no connector or live-data source is used.

## Scope and Permissions

Repository calls explicitly include authentication, identity, active Organization, and Business Context. Customers remain Organization-scoped and may be narrowed by the active Offer. Cross-Organization deep links restore context only for an entitled identity. `customers.view_sensitive_data` controls email and phone display. Financial values use the existing `financials.view` capability.

## Route Contract

The route supports `customer_id`, `focus`, `event_id`, `identifier`, `order_id`, `offer_id`, `drawer`, `search`, and `replay`. Typed parsing and normalization prevent inaccessible or stale Customer, Journey, Identifier, Order, and Drawer state from throwing. Mission Control, Offer relationships, and Universal Search use production routes and preserve development identity.

## Production Experience

The migration preserves the compact Customer list, Permanent Customer context, Customer Story, Journey hover/focus previews, Replay Journey, Tracking Health, uncertainty-aware privacy/interference signals, related Orders and Offers, Universal Forensic Analysis, Explain, Evidence, and the shared attached Drawer. Drawer content answers what happened and what Evidence proves it through progressive disclosure of URLs, parameters, Identifiers, redirects, diagnostics, and relationships.

## Remaining Live-Data Work

A future repository must aggregate normalized Customers, Journeys, Orders, Offers, Financial Events, and Connector evidence with server-side authorization, persistent sensitive-data auditing, search indexing, caching, observability, and live MCP resolution. The Order Workspace remains on its stable production route pending its own migration.

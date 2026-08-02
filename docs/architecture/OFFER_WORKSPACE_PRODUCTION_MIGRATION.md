# Offer Workspace Production Migration

Version: 1.0  
Status: Phase 1 — Mock Repository

## Purpose

The production Offer Workspace is available at `/offers` inside the shared TraceKit shell. It preserves the approved Offer Workspace interaction model while separating product UI from data acquisition.

## Repository Boundary

The UI depends on `OfferRepository`, which returns focused, serializable read models for Offer summaries, Workspace snapshots, trend ranges, Traffic Sources, Profit Drivers, Customer Quality, Significant Events, contextual Intelligence, comparisons, Drawer records, search results, and deep-link resolution.

`MockOfferRepository` is the only Phase 1 implementation. It returns fresh cloned values and never exposes connector payloads. No live data, connector, database, or authentication integration is present.

## Scope and Context

Every repository request includes the authenticated development identity and active Organization. Offer lists and comparisons are restricted to accessible Offers in that Organization. A permitted cross-Organization deep link first restores the Organization, then normalizes Business Context. Invalid or inaccessible state falls back safely.

Business Context remains the selected Offer, not a report filter. Organization and Business Context remain distinct production-shell state.

## Deep-Link Contract

The route supports `offer_id`, `focus`, `traffic_source`, `driver`, `event_id`, `drawer`, `search`, `compare`, and repeated `compare_offer` parameters. Parsing and normalization live outside the UI component. Mission Control and Universal Search use this contract and never route to concept pages.

## Production Experience

The migration includes the approved Profit and Performance hierarchy, continuous 7/14/30-day trend, Traffic Sources, Profit Drivers, Customer Quality, Significant Events, contextual mock Intelligence, two-to-four Offer Compare Mode, Explain, Evidence, and context-adaptive content in the shared attached Drawer.

Related Customer and Order actions use stable production route contracts while those Workspaces await migration.

## Remaining Live-Data Work

Later work must replace the mock implementation with an aggregated, permission-scoped Offer read model; connect normalized Orders, Customers, Financials, Traffic Sources, and connector health; implement live search and MCP resolution; and add production loading, caching, audit, and observability behavior. Contextual Intelligence remains structured mock content and is not a live Intelligence engine.

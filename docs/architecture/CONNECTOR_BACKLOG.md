# TraceKit Connector Backlog

This backlog records connector priorities and validation expectations. It does not assert that listed capabilities are already implemented.

## Standard Connector Lifecycle

A connector is not fully onboarded until it completes the standard lifecycle:

Connected  
→ Initial Import Complete  
→ Automatic Sync Enabled  
→ Dashboard Ready

See the [TraceKit Product Blueprint](../blueprint/TRACEKIT_PRODUCT_BLUEPRINT.md) for product intent and the [Product Decision Log](../blueprint/PRODUCT_DECISIONS.md) for approved connector decisions.

## Tier 1 — Launch Critical

### Shopify

Shopify must support the standard connector lifecycle:

Connected  
→ Initial Import Complete  
→ Automatic Sync Enabled  
→ Dashboard Ready

Expected validation areas:

- Orders
- Sales
- Revenue
- Products
- Quantities
- Customers
- Transaction IDs
- Source timestamps
- Refunds
- Status changes
- Pagination completeness
- Processor relationship
- Fee source or configured fee model

### Commas

Commas must support the standard connector lifecycle:

Connected  
→ Initial Import Complete  
→ Automatic Sync Enabled  
→ Dashboard Ready

Expected validation areas:

- Orders
- Sales
- Revenue
- Products
- Quantities
- Customers
- Transaction IDs
- Source timestamps
- Refunds
- Status changes
- Pagination completeness
- Processor relationship
- Fee source or configured fee model

### Next29

Next29 must support the standard connector lifecycle:

Connected  
→ Initial Import Complete  
→ Automatic Sync Enabled  
→ Dashboard Ready

Expected validation areas:

- Orders
- Sales
- Revenue
- Products
- Quantities
- Customers
- Transaction IDs
- Source timestamps
- Refunds
- Status changes
- Pagination completeness
- Processor relationship
- Fee source or configured fee model

## Tier 2 — Financial Truth

Tier 2 work strengthens authoritative financial-event coverage and the path from Operational Profit to Reconciled Profit:

- PayPal
- NMI Snapshot Mode
- NMI contract-calculated processing fees
- Authoritative NMI financial-event mappings
- Month-end reconciliation

These items require validated source provenance and financial semantics. Missing values or mappings must not be silently estimated.

## Tier 3 — Deferred / Existing Compatibility

### WowBoost

Status: Deferred

Current findings:

- The Executive Dashboard reconciles to `platform_orders`.
- WowBoost exports may include duplicate receipt rows.
- Test orders are intentionally excluded.
- Export pagination and UI revenue semantics need additional investigation.
- WowBoost is not widely used enough to remain launch-critical.
- Existing support should be preserved, but launch-critical development time should no longer be spent on source-specific edge cases.

### WowPay

Status: Hidden from customer-facing v1 UI.

- Backend routes remain temporarily.
- WowPay is not an authoritative Executive Dashboard commerce source.
- WowPay can be removed or repurposed later after a dependency review.

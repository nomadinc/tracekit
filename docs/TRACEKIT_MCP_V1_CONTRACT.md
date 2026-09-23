# TraceKit MCP V1 — M1 Architecture, Security & Tool Contract

Status: design contract for WS-010 M1. No production activation.

## Architecture boundary

MCP clients MUST enter through TraceKit's authenticated application/session boundary and MUST NOT receive direct Supabase, PostgREST, provider API, or service-role access.

Request path:

MCP transport -> TraceKit MCP session adapter -> resolveApplicationSession -> authorization gateway -> governed MCP service -> canonical TraceKit repository/read model -> evidence stores.

The MCP service is read-only in V1.

## Security invariants

1. Authentication is mandatory. Development identities are not valid MCP principals.
2. Every tool call resolves the current persistent membership and active Organization server-side.
3. Organization/resource scope is derived from the authenticated session. Client-supplied organization IDs never expand scope.
4. Permission overrides, including explicit denies, apply to MCP exactly as they do to TraceKit.
5. Sensitive customer fields require customers.view_sensitive_data in addition to the base customer/order permission.
6. Financial fields require financials.view and, for order financial detail, orders.view_financials where applicable.
7. Service-role credentials remain server-only and are never returned to MCP clients.
8. Every invocation records an audit event with actor, authenticated identity, account, organization, tool, result, permission evaluated, correlation ID, and redacted metadata.
9. MCP responses expose canonical/qualified state and retained evidence. They do not manufacture attribution, relationships, profit, or confidence when TraceKit marks them unavailable or incomplete.
10. V1 tools perform no mutation, connector control, credential management, reconciliation writes, imports, exports, or administrative actions.

## V1 tool contract

### tracekit.list_customers
Purpose: bounded discovery of customers within the active Organization.
Permission: customers.view.
Sensitive data: default response masks/omits email and phone. Full sensitive fields require customers.view_sensitive_data.
Source: CustomerRepository production read model.
Limits: bounded page size; no unbounded export.

### tracekit.get_customer
Purpose: retrieve the canonical customer workspace: retained journey evidence, related orders/offers, tracking state, and qualified privacy signals.
Permission: customers.view.
Sensitive data: gated separately by customers.view_sensitive_data.
Source: CustomerRepository.loadWorkspace.
Behavior: missing canonical Journey remains explicitly missing; commerce fallback evidence must remain qualified rather than promoted into a Journey.

### tracekit.list_orders
Purpose: bounded order discovery within active Organization.
Permission: orders.view.
Financial data: revenue/profit fields require orders.view_financials and financials.view; otherwise omitted or marked restricted.
Sensitive customer data: requires customers.view_sensitive_data.
Source: OrderRepository production read model.

### tracekit.get_order
Purpose: retrieve canonical order workspace, attribution/evidence timeline, relationships, and available financial composition.
Permission: orders.view.
Financial detail: requires orders.view_financials plus financials.view.
Sensitive data: requires customers.view_sensitive_data.
Source: OrderRepository.loadWorkspace.
Behavior: unavailable financial/commercial fields remain unavailable; MCP must not convert placeholders into asserted facts.

### tracekit.get_journey
Purpose: retrieve a TKID-centered evidence timeline and attached commerce/attribution state.
Permission: customers.view.
State: DEFERRED from initial implementation until Journey access is wrapped in a tenant-scoped canonical repository/service. Current UI direct /v1/journeys access is not sufficient as the MCP security boundary.

### tracekit.get_profit_summary
Purpose: bounded organization-level profit/revenue/cost summary with diagnostics.
Permission: financials.view.
State: DEFERRED until the existing profit response types are backed by an explicitly tenant-scoped canonical service suitable for MCP. Money UI placeholder is not a contract.

### tracekit.get_reconciliation_gaps
Purpose: surface retained unmatched/partial reconciliation records without discarding evidence.
Permission: financials.view.
State: DEFERRED until a canonical tenant-scoped reconciliation read model is identified or created.

### tracekit.search
Purpose: bounded cross-entity search.
Permissions: results are filtered per entity permission; the tool never reveals that an inaccessible resource exists.
Initial searchable types: customer and order only.
Sensitive fields: masked unless separately authorized.
State: may ship with customer/order tools after permission-filtered aggregation is implemented.

## Explicitly excluded from V1

- SQL/query execution
- arbitrary table access
- raw Supabase/PostgREST proxying
- connector creation or sync control
- credential reads/writes
- imports/backfills
- reconciliation mutations
- customer/order mutation
- exports
- tenant administration
- impersonation
- arbitrary provider API calls
- unrestricted raw payload retrieval

## Error contract

Authentication failure: generic unauthenticated response.
Authorization/resource-scope failure: generic access_denied; do not disclose cross-tenant resource existence.
Not found within authorized scope: not_found.
Canonical data unavailable: unavailable with a qualified reason where safe.
Internal/provider failure: generic failure plus correlation ID; no credentials, raw headers, SQL, or secret-bearing payloads.

## Audit contract

Action namespace: mcp.tool.<tool_name>
Result: success | denied | failure
Target type/id: only when authorized and safe to record.
permission_evaluated: primary permission gate.
Metadata allowlist: tool version, bounded filters, result count, duration bucket, data-class flags. Existing audit redaction remains mandatory.

## Initial implementation gate

M2 may begin only with:
- list_customers
- get_customer
- list_orders
- get_order
- permission-filtered search

Journey, profit, and reconciliation tools remain deferred until their canonical tenant-scoped service boundary is verified.

No production MCP endpoint or external client registration is authorized by this document.

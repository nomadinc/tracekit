# TraceKit UI Convergence requirement

**Status: TRACEKIT UI CONVERGENCE: DEFERRED — REQUIRED BEFORE LAUNCH**

This is a durable product and recovery requirement. The current Legacy Dashboard
application shell is temporary scaffolding, not the approved final TraceKit UI.
Its presence in production is not a decision to retain Legacy Dashboard branding
or presentation. Previously completed TraceKit logo, branding, and UI work is
not abandoned because another shell is currently visible.

## Sequencing

While Connections/provider integrations, major product surfaces, and
tenancy/users/team-management foundations remain under active development:

- continue functional product work;
- keep screens usable and fix functional defects immediately;
- do not pause Connections or tenancy/product work for broad visual redesign;
- do not start UI Convergence opportunistically during unrelated backend work;
- do not treat the Legacy Dashboard appearance as the target design.

After those foundations are sufficiently complete, execute one coordinated
**TraceKit UI Convergence** phase across the authenticated application, followed
by final launch polish.

## Convergence scope

The phase is a system-wide migration onto one canonical TraceKit application
shell and design system, not a collection of unrelated page redesigns. It must:

- restore the approved TraceKit logo and app icon where appropriate and remove
  Legacy Dashboard branding;
- establish one authoritative primary navigation, application bar,
  organization/workspace switcher, business/product context selector, global
  search, user/account menu, notifications, and appropriate MCP surface;
- standardize typography, spacing, page widths, cards, tables, drawers, modals,
  forms, filters, badges, buttons, navigation states, loading/error/empty
  states, and responsive behavior;
- use the established high-end dark SaaS TraceKit direction: clean, restrained,
  operationally dense where useful, and not visually busy;
- converge Dashboard/Home, Connections, Customers, Orders, Money, Chargebacks,
  Operations, Offers/business context, Settings, Users/Teams/Tenancy, and MCP
  surfaces.

New major surfaces must remain portable into the canonical shell without
rewriting their business logic.

## Capability preservation gate

Convergence primarily replaces presentation and shell code. It must not remove
or regress proven behavior: connection setup and management, commerce
ingestion/status, customer/order views, financial reporting, chargeback review
and affiliate/source reporting, dispute reconciliation, operations/work items,
organization/workspace behavior, tenancy/RBAC, team management/invitations, or
MCP functionality.

The capability regression gate must pass before merge. Any page moved into the
canonical shell must retain its route, authorized data path, and completed
capability coverage. Do not rebuild working business functionality solely for
visual convergence, and do not remove completed functionality while replacing
legacy presentation components.


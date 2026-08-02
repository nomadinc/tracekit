# TraceKit Identity, Access, and Application Shell

> Phase 1 status: the persistent WorkOS AuthKit and TraceKit tenancy foundation is documented in `PERSISTENT_IDENTITY_AND_TENANCY.md`. The original architecture below remains design history; real-data access is still blocked pending complete server-side repository authorization.

Version: 1.0
Status: Phase 1 Architecture

## Purpose

This document defines the engineering boundary for identity, tenancy, authorization, and the shared TraceKit application shell. It supports one coherent platform for Product Admins, direct Client Organizations, and Agencies without selecting a third-party authentication provider prematurely.

Phase 1 uses local development identity state. It is not production-secure authentication and must never be represented as such.

## 1. Identity Model

Identity represents the authenticated human independently from any Account, Organization, role, or authentication provider. A user may hold multiple memberships and may access more than one Organization when those memberships allow it.

Authentication answers who the user is. Authorization answers what that user may do within an active scope.

## 2. Account Hierarchy

```text
TraceKit Platform
├── Product Admin Accounts
├── Agency Accounts
│   └── Assigned Client Organizations
└── Client Organizations
```

An Account establishes the commercial and administrative relationship. An Organization establishes the business-data boundary. Agency context and selected Client Organization remain distinct.

## 3. Organization and Agency Tenancy

- Direct Client users access only their Organization.
- Agency users access only assigned Client Organizations.
- Product Admin users operate at platform scope and do not silently enter tenant data.
- Every organization-scoped request must identify and validate the active Organization.
- Business Context choices are derived only from Offers belonging to the active Organization.

## 4. Membership Model

A membership connects an Identity to an Account and, where applicable, an Organization. It contains default role assignments, explicit permission grants or denials, and data-scope constraints.

Membership resolution follows:

```text
Authenticated User
→ Account Membership
→ Active Organization
→ Required Permission
→ Allowed Data Scope
```

## 5. Capability-Based Permissions

Roles are collections of permissions, not the authorization mechanism itself. The typed permission registry is the stable authorization contract. Role defaults may be supplemented by explicit grants and denials, with denial taking precedence.

Server handlers must use the same permission identifiers as the application shell. Interface visibility is convenience, not enforcement.

## 6. Default Roles

### Product Admin

- Platform Owner
- Platform Admin
- Support
- Billing
- Read-only Operations

### Agency

- Agency Owner
- Agency Admin
- Team Member
- Read-only User

### Client Organization

- Organization Owner
- Organization Admin
- Analyst / Operator
- Finance
- Customer Support
- Read-only User

Default-role permissions are Phase 1 policy and may evolve through an approved authorization review.

## 7. Business Context Access

Business Context represents the active Offer or business within the active Organization. It is not a report filter.

- Organization access is resolved before Business Context access.
- Business Contexts are restricted to the active Organization and `offers.view`.
- Changing Organization clears or replaces an invalid Business Context.
- The selected Organization and selected Business Context must remain visually distinct.

## 8. Shell Variants

### Client Shell

Mission Control, Offers, Customers, Orders, Money, Operations, and Settings. Navigation is permission-aware.

### Agency Shell

Mission Control, Clients, Offers, Customers, Orders, Reports, Team, Branding, and Settings. Agency Account context remains visible while a Client Organization is selected.

### Product Admin Shell

Organizations, Agencies, Users, Connectors, Imports, System Health, Billing, Audit Logs, Feature Access, and Support. This is a platform operations console, not a Client shell with extra links.

All variants share identity, authorization, accessibility, command, notification, responsive-navigation, and Drawer primitives.

## 9. Route Authorization

Each protected destination declares a required permission and scope. Direct-route access must resolve authorization independently of navigation visibility and render an explicit Access Denied state when disallowed.

Platform routes require platform membership and the relevant `admin.*` or operational capability. Organization routes require membership in the active Organization. Agency routes require Agency membership and assigned-client scope.

## 10. Server-Side Enforcement Requirements

Phase 1 shell checks demonstrate policy but do not secure data. Before real authentication or tenant data is enabled, every server request must:

1. Resolve an authenticated server-side session.
2. Resolve an active membership.
3. Validate active Account and Organization scope.
4. Validate the required typed permission.
5. constrain reads and writes to the allowed data scope.
6. record sensitive decisions and mutations in the audit log.

The existing server-held TraceKit admin secret is a service-to-service proxy credential. It is not a user identity or authorization model.

## 11. Authentication-Provider Abstraction

Application code depends on a provider-neutral `IdentitySession` boundary rather than vendor SDK types. A future adapter will translate provider sessions into TraceKit Identity, membership, Account, Organization, and permission claims.

The Phase 1 mock provider is development-only, clearly labeled, local, replaceable, and prohibited from asserting production security.

## 12. Login-Method Direction

The provider boundary must support later approval of:

- Email and password
- Passwordless email or magic link
- Google
- Microsoft
- Enterprise SSO
- Multi-factor authentication
- Password recovery
- Invitation-based activation

No provider is selected in Phase 1.

## 13. Account and Organization Switching

Account and Organization switching is permission- and membership-scoped. Direct clients do not receive an Organization switcher when only one Organization is available. Agency users can select only assigned clients. Switching Organization revalidates Business Context and route access.

## 14. Admin Impersonation Safeguards

Impersonation is not implemented in Phase 1. A later implementation requires explicit capability, reason capture, visible impersonation state, short-lived sessions, immutable audit events, prohibition for unsupported sensitive actions, and a reliable exit control. Product Admin tenant preview must never be silent.

## 15. White-Label Theming Foundation

The shell reads a bounded brand configuration capable of representing Agency logo, product name, favicon, accent token, invitation/login presentation, custom domain, and “Powered by TraceKit” policy.

Phase 1 supports safe product-name, logo-mark, and accessible accent configuration only. Brand configuration may not restructure the shell or weaken contrast. Custom domains and white-label administration remain later work.

## 16. Audit-Log Requirements

Future persistent audit records must cover authentication events, invitations, membership and permission changes, Organization switching where risk warrants, Connector changes, financial actions, billing changes, feature access, impersonation, and sensitive-data access or export.

Audit records require actor, account, Organization, action, target, result, timestamp, source, and relevant reason without storing secrets or raw sensitive payloads.

## 17. Phase Boundaries

### Phase 1

- Shared production shell primitives
- Typed permission registry and authorization utilities
- Development-only provider-neutral identity/session boundary
- Organization and Business Context switching
- Client, Agency, and Product Admin shell variants
- Permission-aware navigation and direct-route Access Denied states
- White-label configuration boundary

### Later Phases

- Approved real authentication provider
- Persistent identities, memberships, roles, grants, and denials
- Invitations and activation
- MFA and enterprise SSO
- Password recovery
- Persistent audit logs
- Safe Product Admin impersonation and tenant preview
- Custom domains and white-label administration
- Billing integration

No database migration is included in Phase 1.

## 18. Open Engineering Decisions

- Authentication provider and server-session format
- Persistent Account, Organization, membership, role, and permission schema
- Organization resolution in URLs, sessions, and API contracts
- Server authorization middleware versus explicit handler guards
- Audit storage, retention, and export policy
- Sensitive-data policy and step-up authentication
- Invitation, recovery, MFA, and SSO flows
- Product Admin tenant-preview and impersonation controls
- White-label asset storage and custom-domain verification
- Billing ownership across Platform, Agency, and Client Accounts
- Feature-access policy and rollout controls

## Phase 1 Implementation Summary

The existing Next.js application, route group, command palette, notification system, investigation Drawer, live Workspace provider, and current production routes remain in place. The shared `AppShell` is extended through provider-neutral development identity state, typed permissions, scoped Organization and Business Context selection, permission-aware shell variants, and guarded placeholder destinations.

Approved concepts remain isolated and unchanged. They can migrate into production Workspaces through shared shell and authorization boundaries in later reviewed phases.

# Persistent Identity and Tenancy

Version: 1.0

Status: Phase 1 implemented and validated

## Responsibility boundary

WorkOS AuthKit authenticates people, verifies identity, manages hosted login methods, and owns the WorkOS session lifecycle. TraceKit maps the external WorkOS user ID to an internal User and owns Accounts, Agencies, Client Organizations, Memberships, roles as permission collections, permission overrides, Agency assignments, Business Context access, application authorization, and audit records. A WorkOS organization is an authentication realm; it is not sufficient authorization to a TraceKit tenant.

## Authentication and session flow

`/auth/sign-in` obtains an SDK authorization URL. `/auth/callback` uses AuthKit's standard callback handler and its PKCE/CSRF validation, synchronizes the internal User, and returns to Mission Control. `/auth/sign-out` invokes SDK session termination. Email/password, Magic Auth, Google, and Microsoft are configured within the one hosted AuthKit flow; MFA, SAML, OIDC, and SCIM can be added without replacing the application boundary.

Next.js 15 uses `middleware.ts` with AuthKit 4.3.1. The SDK validates and refreshes the WorkOS session. Server code resolves the internal User, Membership, Account, optional Agency, assigned Organizations, role permissions, explicit overrides, and Business Context access. Only a safe subset reaches the client. Refresh tokens, service credentials, WorkOS API keys, and authorization diagnostics remain server-only.

## Persistent entities

Migration `038_persistent_identity_and_tenancy.sql` creates internal Users, Accounts, Agencies, Organizations, roles, Memberships, permission overrides, Agency-client assignments, Business Context access, Invitations, and audit events. UUIDs are internal primary keys; WorkOS IDs are unique external mappings. It uses the existing Supabase/Postgres framework, enables RLS, revokes browser roles, and grants the server-only service role. Application authorization remains mandatory.

## Organization distinctions and Agency model

- Authentication Organization: WorkOS authentication policy realm.
- Active TraceKit Organization: authorized client data tenant.
- Agency Account: team account that may receive explicit client assignments.
- Business Context: active Offer inside the active TraceKit Organization.

Agency Membership and client assignment are independent. Agency roles provide capability defaults; assignments define reachable Client Organizations. Client restrictions and explicit denies may narrow access. Assignment never makes an Agency user a Client Organization administrator. White-label configuration remains Account-owned.

## Memberships, roles, and permissions

The existing typed capability registry remains authoritative. Roles collect default permissions and do not replace capability checks. An active Membership establishes Account or Organization scope. Role grants are applied first, explicit allows second, and explicit denies last; any applicable deny wins. Suspended or removed Memberships have no effective permissions. Product Admin requires explicit platform Membership and capability—never an email address or ordinary WorkOS organization membership.

## Invitations and membership administration

WorkOS may deliver identity onboarding, while TraceKit persists inviter, intended email, target, requested role, provider invitation ID, expiry, and acceptance. Acceptance requires a pending, unexpired, unreplayed invitation whose authenticated email matches and target remains authorized. The URL alone never grants Membership. The schema and validation boundary are Phase 1 foundations; transactional create, revoke, resend, acceptance, and final-owner transfer services remain Phase 2.

## Organization switching and Business Context

The server revalidates a requested Organization against the resolved session, records `organization.switched`, and stores the choice in an HMAC-protected, HTTP-only, SameSite=Lax cookie bound to the internal User. Unauthorized and nonexistent targets receive the same response. A successful switch clears Business Context and incompatible investigation state.

Business Context is loaded only after Organization authorization, must belong to that Organization, and must be revalidated before data access. Phase 1 production repositories remain mock-backed, so persistent Business Context loading is deliberately not enabled for live data.

## Authorization gateway

Shared server utilities enforce authenticated active User, active Membership, capability, Organization access, resource scope, sensitive-data permission, and financial-data permission. Denials are non-enumerating. UI visibility remains a convenience and is not an authorization control.

## Product Admin

Product Admin is a platform Account Membership plus explicit capability. The separate Product Admin shell remains. Tenant preview and impersonation are deferred; any WorkOS impersonation marker is assurance information and never grants tenant scope.

## Audit events

The model supports structured authentication, invitation, Membership, override, Organization-switch, sensitive/financial decision, and denied-access events. Metadata redacts token, secret, password, cookie, personal identifier, click identifier, and transaction-like keys. Raw tokens and secrets must never be persisted.

## Development identity isolation

Mock identities require both `TRACEKIT_IDENTITY_MODE=development` and `TRACEKIT_ENABLE_DEV_IDENTITIES=true`, and are rejected whenever `NODE_ENV=production`. WorkOS mode is the safe default. A query-string `dev_identity` cannot activate mock identity in production.

## Server-proxy security status

Legacy same-origin proxies still attach a privileged TraceKit secret and some accept caller-controlled `workspace_id`. Middleware blocks all non-health `/api/*` routes when `TRACEKIT_REAL_DATA_ENABLED=true`. This is a secure stop, not completed tenant authorization. No legacy proxy is approved for real customer data until it resolves a server session and derives tenant/resource scope independently of browser input.

## Environment variables and local setup

Required WorkOS values are `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, and `NEXT_PUBLIC_WORKOS_REDIRECT_URI`. Persistence uses `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`. `TRACEKIT_REAL_DATA_ENABLED` must remain `false`. Secrets belong in the deployment secret store, never Git.

Copy `ui/.env.example` to the ignored local environment file. For explicit mock review, enable development identity mode. For AuthKit review, configure a WorkOS development project, callback `http://localhost:3000/auth/callback`, sign-in endpoint `/auth/sign-in`, and logout URI; apply migration 038 to a development Supabase database; then create TraceKit Membership records explicitly. No email-domain auto-provisioning occurs.

## Remaining Phase 2 work

- Complete repository-backed Business Context access.
- Implement transactional Invitation and membership-administration services, including final-owner safeguards.
- Move every legacy proxy behind authorization and derive immutable Organization scope.
- Add durable authentication failure, sign-out, refresh, and authorization-decision audit hooks.
- Add rate limiting, mutation CSRF review, durable correlation, and monitoring.
- Define tenant RLS policies after the production session-to-database claims strategy is approved.

## Security limitations

This phase does not make TraceKit safe for real customer data. Live repositories remain disabled; legacy privileged proxies remain blocked in real-data mode; there is no approved browser-to-database claims path; and invitation administration is foundational rather than complete. The local WorkOS hosted authentication cycle has been validated, but the remaining data-access limitations still require security review before customer data is enabled.

# WS-019 M4.2 Production Acceptance Plan

This plan is read-only except for an explicitly approved Work Item fixture transition and Notification presentation-state update. It does not authorize execution.

## Preconditions

- Authenticate through the supported WorkOS application flow.
- Enter the approved Stem Labs Admin Client View and record the server-resolved organization ID.
- Prove effective `organizations.view`, `actions.execute`, and `audit_logs.view` through the authenticated application session.
- Approve a distinct synthetic/fixture tenant identifier. Do not inspect that tenant's private records.

## Evidence sequence

1. Read the bounded Work Item list and one approved Work Item through `/api/work-items`; require every returned `workspace_id` to equal the active organization.
2. Submit a foreign `workspace_id` on list/detail and require a non-disclosing 404 before the Core request.
3. Submit a foreign Work Item ID and require a non-disclosing 404 with no activity or data change.
4. If a disposable non-customer-impact Work Item fixture is approved, perform one allowed transition, then prove its activity row records the authenticated user and active tenant. Repeat the now-invalid transition and require 409 with no second transition. If no fixture exists, leave this production gate blocked.
5. Submit a foreign workspace or actor hint to the transition route and require a non-disclosing rejection before the Core request.
6. Read Notifications through `/api/notifications`; require the active organization scope. Submit foreign workspace/detail/update requests and require rejection with no notification-state change.
7. Read `/api/audit-events?limit=50`; require `scope=active_organization`, bounded pagination, `audit_logs.view`, and only active-organization events. Submit tenant identifiers and verify they are ignored by contract because the endpoint accepts no caller tenant scope.
8. In platform context, verify account-scoped audit visibility; enter Admin Client View and verify the same endpoint becomes organization-scoped. Correlate the existing `admin.client_view.entered`/`exited` audit events.

## Evidence to retain

Capture timestamps, request correlation where available, active session identity and organization, response status, row counts, and before/after counts for every authorized non-destructive mutation. Do not retain cookies, tokens, credentials, or foreign-tenant contents.

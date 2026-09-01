# WS-008 — TraceKit 29Next Connection — M2 Checkpoint

Status: REVIEW — implementation complete, execution gate pending

Branch: `workstream/29next`

Baseline: `5320a1a5f410ad80e9b39be1620ccf5fe20f1777`

## Scope implemented

M2 intentionally stays provider-specific and does not modify Shopify, Everflow, Commas runtime, canonical subscription schema, shared scheduler dispatch, or production configuration.

Implemented:

- `api/src/connectors/next29/types.ts`
  - Stable Admin API version constant (`2024-04-01`)
  - Tenant/provider request types
  - Cursor page model
  - Order/attribution foundation types
  - Immutable evidence envelope/sink contract
- `api/src/connectors/next29/errors.ts`
  - Provider error classification
  - Authentication/authorization/rate-limit/transient handling
  - Secret/error redaction
- `api/src/connectors/next29/client.ts`
  - Store-scoped Admin API base URL
  - Bearer authentication
  - Explicit `X-29Next-Api-Version`
  - GET-only order list/retrieve foundation
  - Cursor iterator with max-page bound
  - Same-origin/Admin-path pagination URL guard
  - Timeout handling
  - 429/5xx retry handling with Retry-After support
  - Correlation IDs and structural rate-limit/request-ID observations
- `api/src/connectors/next29/verification.ts`
  - Single bounded read-only orders request
  - Proves auth plus `orders:read` access without exposing provider values
- `api/src/connectors/next29/evidence.ts`
  - Tenant-scoped immutable evidence handoff
  - Versioned 29Next provider envelope
  - No direct coupling to Supabase or UI evidence implementation
- `api/src/next29-client.test.ts`
  - Auth/version headers
  - Admin API URL construction
  - Cursor progression
  - Host/path escape rejection
  - 429 retry and Retry-After
  - Read-only verification
  - Tenant-scoped evidence preservation

## Architecture decisions

1. Provider identifier remains `next29`, matching the existing `CommerceProvider` union.
2. Stable API version is pinned to `2024-04-01`; callers may override explicitly for controlled upgrades.
3. Connection verification uses `GET /orders/` so success proves both token validity and the required `orders:read` scope.
4. Pagination follows provider-supplied `next` URLs only when they remain on the configured Admin API origin/path.
5. No `updated_since` behavior is assumed; incremental design remains webhook-first plus bounded overlap reconciliation until a documented filter is proven.
6. Evidence is handed to TraceKit through a provider-neutral sink interface; persistence wiring belongs to the later ingestion milestone.
7. Subscription lifecycle persistence remains deferred to the shared canonical-schema coordination milestone identified in M1.

## Validation state

The branch contains the focused regression suite and it is included by the existing API test command (`node --test src/*.test.ts`).

This environment cannot execute the repository suite because it has no GitHub DNS/network access and the repository is not mounted locally. The repository also has no `.github/workflows` CI workflow to execute the tests remotely.

Therefore M2 is not declared PASS yet. Required closeout gate in a Codex/local worktree:

```bash
cd api
npm test
npx tsc --noEmit
```

M2 becomes PASS only after those commands succeed (or any failures are fixed) on `workstream/29next`.

## Next milestone after PASS

M3 should wire bounded historical order ingestion into the existing TraceKit sync/evidence/source-mapping infrastructure, then normalize customers, products, orders, and financial transactions without adding the subscription lifecycle schema yet.

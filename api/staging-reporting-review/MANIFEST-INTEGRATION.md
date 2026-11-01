# WS-023 source manifest integration delta

Exact uploaded bytes are retained as `ws023-reporting-operation-manifest-v1.json`; checksum and exact source commitment are in `manifest-binding.json`. This is source extraction acceptance only. No grant, deployment, key enrollment or native acceptance is implied.

Base: e44b59c37873fd70d1a0154304edcdf8fd5eb684. Prior integration: b5a9dbc59a9303f52b0b8e206372c54dd851f29f.

| Source operation | Implementation | Activation boundary |
|---|---|---|
| customer.list | Existing guarded Core computation and explicit projections | Search variants, view dependencies and native RLS acceptance pending |
| customer.detail | Guarded Core computation, work_items explicitly unavailable | Work-item column scope excluded; view/native acceptance pending |
| customer.journey.detail | Tenant/person/journey-bound Core computation | Native view/RLS acceptance pending |
| customer.orders | Existing deterministic view resolution; no heuristic identity join | SECURITY INVOKER base-table authority unresolved; no view grant proposed |
| profit.summary | Implemented explicit source projection, currency qualification, existing Core sumProfitTotals, live membership revalidation | Rollup actual schema/ACL/RLS and trusted issuer acceptance pending |
| profit.summary.executive_expansion | Denied before reads, HTTP 422 | Additional graph unresolved |
| profit.summary.offer | Denied before reads, HTTP 422 profit_offer_identity_unresolved | Verified financial-to-commerce bridge absent |

Base Profit requires both financial permissions. Unknown monetary fields reject rather than becoming fabricated zero. Empty periods retain data_available=false and currency=null; actual zero-valued rows remain zero. Pagination failure or incomplete scan rejects. SQL is a rollback-only, unexecuted review proposal, not privilege authorization. Its optional Profit addendum must be consolidated with the base exact-ACL assertions before any execution approval; running the two files as-is does not activate anything.

## Financial identity contract

A financial record can acquire an authoritative commerce-order relationship only through independently verified exact provider event/transaction identity, event type, organization/workspace, connection and provider-account namespace, with one unique canonical target. Preserve original provider IDs, parent references and evidence commitments. Conflicting targets, duplicate namespace identities, foreign tenants/accounts and absent authority reject linkage. Email/amount/time/proximity and offer IDs alone are never sufficient. This delta implements NO bridge writer or speculative join. Missing linkage remains unresolved and visible in unfiltered base reporting; no offer attribution is invented. Historical unknown provenance is not promoted. A durable bridge and its writer/uniqueness contract remain separate implementation dependencies.

## Caller and authority closure

The preceding isolated integration already replaced restricted-preview x-tk-secret/direct credential paths with the signed scoped transport. This delta propagates only closed customer-safe Profit 422 errors. Neither browser nor caller receives database keys. Production legacy behavior is not claimed as cut over. Trusted issuer code/current membership checks exist, but enrollment, custody, JWT trust, actual role/session verification, page-level read-only identity bootstrap and independent security review remain pending. All errors/reads are no-store.

Original WS-023 findings refer to the combined base, not proof that the isolated prior cutover was absent. The manifest is not a grant allowlist: raw JSON, identity metadata and policy snapshots remain excluded from DB projections and browser responses. Work-items are unavailable. No writes, maintenance or privileged RPCs are exposed.

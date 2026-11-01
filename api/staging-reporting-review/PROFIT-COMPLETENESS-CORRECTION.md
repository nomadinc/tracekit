# Focused Profit completeness correction

Parent source: 734223e28c4633768283744af2873804d07dc43d. Original affected source: c921b3e98cd78a6db2f1cb1d0c9f4b808a209ccc.

Original reproduction executes the historical profit.ts and historical projection manifest. 1001 same-day source identities have expected net profit 1050. Returning the prior page's final identity at the next offset makes the old implementation accept 1001. The same substituted response is rejected by the correction; the complete original set returns 1050. No accounting calculation is changed.

## Completion mechanism

The correction eliminates cross-request offset pagination rather than pretending that keyset pagination establishes a consistent snapshot. It requests ONE bounded PostgREST main read with `count=exact`, range 0..4999 and `id.asc`. The existing rollup UUID primary key is verified both in migration 002 and a fresh staging catalog read. `id` is the sole added projection/grant column. No key is invented.

The guarded repository requires `Prefer: count=exact` to be applied, a canonical exact Content-Range whose total equals the returned body length, correct tenant and physical/effective role evidence, and no unexpected relation/query. The computation independently requires count==length and canonical, unique, strictly ascending UUID IDs. Missing counts/keys, duplicated boundary rows, ordering conflicts, truncation, incomplete body or transport uncertainty fail without another request or retry. Results >5000 or lower server row caps fail closed. Empty periods retain data_available=false. Unknown money remains unavailable; actual zero is preserved.

The single mainRead statement mechanism was inspected in official PostgREST v14.0 Query/Statements.hs: count CTE and response aggregation are part of the same SQL statement. Reference: https://github.com/PostgREST/postgrest/blob/v14.0/src/PostgREST/Query/Statements.hs . This is upstream implementation evidence, NOT proof of the installed staging version. Documentation: https://docs.postgrest.org/en/v14/references/api/pagination_count.html .

No successful Profit read is allowed by default. REPORTING_PROFIT_SNAPSHOT_CONTRACT must equal single-statement-exact-count-v1 in the trusted Core environment; it is not caller query/token input. That setting must not be installed until WS-022 independently verifies the deployed mainRead/count single-statement behavior, absence of conflicting response/count hooks, actual role/RLS enforcement and deployment identity. The setting is a configuration gate, not independent evidence or security approval. No setting, credentials or database grants were changed.

## Native limitations

Mocked concurrent insert/update/delete tests capture one response snapshot and prove there is no second request that could compose different snapshots. They do NOT prove native PostgreSQL concurrency or installed PostgREST semantics. Native tests must verify single-statement count/body snapshot under concurrent writes, row-cap rejection, membership revocation, role switching, pre-request hooks, query timeouts and lost responses. If source/installed behavior cannot establish that guarantee, leave the gate disabled. No successful partial totals are an acceptable fallback.

## Installed order-view result

Fresh read-only catalog queries against staging joahiwgidfbzwzyslrbq returned NO object named tracekit_customer_order_read_model in any schema. The previously captured source definition is not an installed-definition verification. Accordingly there is no live invoker-view/RLS parity claim. The proposed dependency grants remain unexecuted and cannot install against this missing view. Installing the accepted view definition and validating its o.* rewrite/column privileges requires a separately approved staging execution plan. Do not create an owner-bypass view or broaden base-table grants to make it work.

The same query confirmed profit_daily_rollups.id is uuid NOT NULL, with PRIMARY KEY(id). Sanitized raw catalog-tool evidence is in installed-order-profit-catalog-result.json. No customer records, credentials or financial rows were selected. No migrations or grants were executed.

# WS-022 → WS-004 / Core Edge/privacy: exact outstanding acceptance packet

4 unresolved historical entries. REVIEW request prepared only; not sent. No merge/deploy authorization.

Review service-credential versus tenant-binding trust model before changing tenancy assertions. Prove unauthorized/inactive service denial, unbound tenant rejection, correct org from the authoritative binding, no caller-supplied organization, and sanitized responses/logs with synthetic requests. Canonical fixture failures currently include root TYPE and mutation of string 1.0: verify fixture export shape and iterate only actual payloads while retaining nested raw-IP rejection. A fixture repair alone does not accept service credential tenancy.

| Historical row position | Boundary | Exact test | Current evidence |
|---|---|---|---|
| 11 | ui | delivery derives tenancy from authenticated credential and validates contract | tests/edge-intelligence-v1-delivery.test.ts:1:851 |
| 12 | ui | delivery does not expose persistence errors or raw credentials | tests/edge-intelligence-v1-delivery.test.ts:1:1244 |
| 13 | ui | Core validator accepts every pinned canonical Edge v1 fixture | tests/edge-intelligence-v1-validator.test.ts:1:371 |
| 14 | ui | Core validator rejects raw IP even when hidden in an optional v1 field | tests/edge-intelligence-v1-validator.test.ts:1:1248 |

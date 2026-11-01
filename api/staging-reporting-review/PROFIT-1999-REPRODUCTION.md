# Mandatory 1001-row / 1999-total reproduction

The reported original shape is now reproduced explicitly: 1000 distinct same-day rollups have net_profit=1, and the 1001st has net_profit=999. Exact total: 1999. Historical c921 profit.ts accepts 1001 when the second offset response repeats the preceding boundary identity. The corrected complete response returns 1999; that same duplicated identity rejects with 503. The earlier 1050 example remains as an additional regression, not a substitute for this mandatory case.

The historical source and its original columns manifest are retained byte-for-byte in api/tests/fixtures/ws001-profit-c921. The test reads the exact Git objects when available and otherwise uses these committed fixtures. No database or external connectivity is used.

Reproduce on Node 24.22.1 (or independently qualified compatible Node):

    npm --prefix api ci --ignore-scripts
    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/profit-pagination.test.ts api/src/staging-reporting/profit.test.ts

Full focused checks:

    node --experimental-loader ./api/src/staging-reporting/offline-loader.mjs --test api/src/staging-reporting/*.test.ts ui/tests/ws001-staging-reporting-cutover.test.ts ui/tests/ws001-staging-session-boundary.test.ts

Observed: 70 PASS, 0 FAIL, 0 SKIP. The historical vulnerability is deliberately asserted as a reproduced failure inside a passing regression test; console output records ORIGINAL SECURITY ASSERTION FAIL expected 1999, accepted 1001.

The correction was implemented at 3d4b0c12dcb93b9d00e7f8d2ed965e4d98c9b4d5. This source delta adds the exact required numeric case, portable historical fixtures and local test loader. It does not change accounting or relax the single-response snapshot gate. Prior 27 Core regressions passed with unchanged inputs; no new native acceptance is claimed.

Deployment remains blocked on independently verified deployed PostgREST exact-count/body snapshot behavior, issuer/roles/RLS, and the absent staging order view. Results exceeding the server cap or 5000-row bound reject without another page. No database grants, migrations, keys or credentials have been activated. WS-022 PASS is pending, not asserted.

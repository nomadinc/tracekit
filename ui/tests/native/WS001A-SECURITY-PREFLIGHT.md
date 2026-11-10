# WS-001A native security preflight — isolation contract

Scope: synthetic PostgreSQL 17.6/PostgREST 14.5 acceptance for the unchanged two-file 29Next persistence correction.
No production deployment, credentials, Supabase connection, commerce provider, replay, migration, or protected executor.

## Immutable provenance

See `ws001a-supply-chain.manifest`: checkout v4.2.2, setup-node v4.4.0, and upload-artifact v4.6.2 are pinned to verified upstream GitHub **commit** SHAs. Both native images are pinned to Docker Hub image-index digests; `linux/amd64` is explicitly requested. Images are downloaded by immutable reference during preparation. The same `POSTGREST_IMAGE` reference is used for both pull and container execution. Runtime architecture, PostgreSQL server version, PostgREST executable version, image references and action SHAs are recorded. An image-index digest is multiarchitecture: `linux/amd64` and the runtime version check must both succeed.

## Credentials and role boundary

- `fixture_admin`: synthetic Postgres bootstrap login/superuser, only in the disposable DB. It creates synthetic fixtures and reads SQL evidence. Not used in PostgREST URI.
- `postgrest_login`: `LOGIN NOINHERIT`, **not a superuser**, no fixture table ownership or DDL. Its only runtime table authority is `SET ROLE web_anon` membership. PostgREST connects to localhost using a separate synthetic password.
- `web_anon`: synthetic NOLOGIN API role. For test fixtures **only**, grants allow SELECT/INSERT/UPDATE over the synthetic commerce tables. This synthetic schema **does not have RLS** and does not assert database-enforced tenant separation. Tenant isolation is tested as application-writer scoping and contradictory-identity rejection.
- No `secrets.*` interpolation. Checkout credentials are not persisted. `GITHUB_TOKEN` permissions are `contents: read`. Native test processes get a sanitized `env -i` containing only synthetic database credentials and allowed test metadata. No production credentials are supplied or mounted.

## Network boundary

Preparation runs with external network to obtain apt packages, immutable Docker images, Node, and locked npm dependencies. APT uses only the workflow-generated signed Ubuntu 24.04 archive/security sources (no runner third-party APT source files). The npm lockfile is checked to require exclusively HTTPS `registry.npmjs.org` tarballs, and npm is invoked with that explicit registry and `--ignore-scripts`. Docker image acquisition is by the two immutable digest references; Actions themselves are full-SHA pinned. Preparation-source restrictions are enforced on invoked acquisition commands, **not** as a blanket pre-acquisition VM firewall; the GitHub-hosted runner still has ordinary network reachability during the preparation phase. No test-case code executes during acquisition (`npm ci --ignore-scripts`). Before starting either native database service, `ws001a-lockdown.sh` installs IPv4 and IPv6 `OUTPUT` rules with UID ownership matching:
- the pinned PostgreSQL image's measured `postgres` UID;
- PostgREST service UID `25002`;
- native SQL/Node/Python/curl test UID `25003`.

These identities may reach loopback only. The dedicated test UID has no sudo or Docker socket access. Runtime services share host networking but explicitly bind to `127.0.0.1`: PostgreSQL listens on 5432, PostgREST on 3000. There is no published public port. The native job verifies the actual host effective UIDs of both native container processes against the UID-targeted firewall rules, loopback listener bindings, the firewall rules, denied external IPv4 for **all three UIDs**, denied external DNS/TLS for the test UID, and Docker socket denial. The output is retained as raw proof for WS-022, not assumed successful in advance. Any failure blocks acceptance. GitHub runner/control and artifact-upload identities remain network-enabled; this is enforced **runtime-identity containment**, not a claim that the entire GitHub-hosted VM or Docker daemon has zero egress. Root-level compromise or misconfigured GitHub-hosted runner remains an explicit residual platform risk for WS-022 to review.

No production Core, Supabase, external commerce/webhook endpoint is configured or used. Their unreachability from the confined runtime is enforced by the UID-specific egress restrictions, rather than assumed from code inspection. Services run from pinned images with no production volumes or credentials.

## Exact dispatch guard

The manual `workflow_dispatch` requires the independently reviewed **40-character** `expected_commit` input. The separate `revision-guard` job compares `github.ref` and `github.sha` with this value **before checkout, artifact acquisition, or fixture setup**. Acceptance runs only if that gate passes; checkout then uses `ref: ${{ github.sha }}`, and compares checked-out HEAD to the expected commit. Moving the acceptance branch after review therefore results in rejection of the unreviewed SHA, not execution of newly changed source. This does **not** create GitHub branch protection or prohibit writes to the branch. PR #580 remains draft until independently authorized.

## Failure capture and evidence limitations

The always-run diagnostics step collects available PostgreSQL/PostgREST container logs, final SQL identities/NUMERIC snapshots, role and image metadata, firewall enforcement, concurrency/rollback and HTTP evidence. It stops disposable services after attempting snapshots and captures shutdown logs. It writes an evidence inventory and file hashes. The mandatory evidence gate requires the expected raw outputs and PASS sentinels and fails closed when any are missing; the artifact upload is `if: always()` and pins the upload action.

If GitHub fails before checkout, only workflow/job logs and whatever inline fallback log can be produced are available. If the runner crashes, is terminated, or loses network connectivity before artifact upload, uploaded artifacts **cannot be guaranteed**; GitHub's runner/job logs remain the outer evidence source. If dispatch selects the `main` stub rather than the acceptance-branch workflow, no native PASS is possible; exact SHA and full-harness steps must appear in the run. Native behavior is not certified until an authorized run is observed and reviewed by WS-022.

**Preflight and production rollout both remain HOLD until explicit independent acceptance and separate authorization.**

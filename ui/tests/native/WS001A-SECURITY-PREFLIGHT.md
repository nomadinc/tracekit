# WS-001A native security preflight — isolation contract

Scope: synthetic PostgreSQL 17.6/PostgREST 14.5 acceptance for the unchanged two-file 29Next persistence correction.
No production deployment, credentials, Supabase connection, commerce provider, replay, migration, or protected executor.

## Immutable provenance

See `ws001a-supply-chain.manifest`: checkout v4.2.2, setup-node v4.4.0, and upload-artifact v4.6.2 are pinned to verified upstream GitHub **commit** SHAs. Both native images are pinned to Docker Hub image-index digests; `linux/amd64` is explicitly requested. Images are downloaded by immutable reference during preparation. The same `POSTGREST_IMAGE` reference is used for both pull and container execution. Runtime architecture, PostgreSQL server version, PostgREST executable version, image references and action SHAs are recorded. An image-index digest is multiarchitecture: `linux/amd64` and the runtime version check must both succeed.

## Credentials and role boundary

The synthetic database has three distinct SQL authorities:

| Role | Superuser | Usage | Privileges |
| --- | --- | --- | --- |
| `fixture_admin` | Yes, disposable database bootstrap only | Initializes schema/records/roles in a dedicated preparation step | Fixture DDL/setup; never passed to contained SQL or Node |
| `acceptance_sql` | No (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`) | Native independent-session SQL, rollback, snapshot and assertion queries | `CONNECT` on acceptance DB, `USAGE` on public schema, `SELECT` on five synthetic tables, `INSERT/UPDATE` only on synthetic platform orders and payment transactions, `USAGE/SELECT` on the synthetic platform-orders ID sequence; no schema `CREATE`, no role membership in `fixture_admin` |
| `postgrest_login` | No (`LOGIN NOINHERIT`) | PostgREST HTTP connection only | Membership in synthetic `web_anon`, no fixture DDL or database ownership |
| `web_anon` | No (`NOLOGIN`) | PostgREST effective test-only HTTP role | `SELECT/INSERT/UPDATE` synthetic tables and platform-order sequence; not tenant-level SQL authorization |

The runner calls fixture setup as `fixture_admin` **only during preparation**, then executes `ALTER ROLE fixture_admin NOLOGIN` before starting any native SQL/Node case. A login as the bootstrap superuser must be PostgreSQL-denied even if its synthetic password is read from the workflow source. Its disabled `rolcanlogin=false` state is independently queried using the restricted `acceptance_sql` identity and the evidence is protected in the runner-owned SHA-256 manifest. The contained launcher strips the environment via `env -i` and provides **only** `acceptance_sql` credentials to SQL/Node processes; runner-level global `PGUSER`/`PGPASSWORD` for `fixture_admin` are removed. Native role checks must show `acceptance_sql|f|f|f|f|t|t|t|t|t|f` (non-superuser, no CREATE/role authority, approved DML and sequence, not a member of `fixture_admin`). The native test identity must not access `sudo` or the Docker socket. PostgREST receives its distinct synthetic credentials in its own container environment. Both passwords are synthetic and ephemeral. **No RLS exists in the synthetic schema**; tenant isolation is tested through actual writer predicates and conflicting-provenance rejection, not database-level RLS.

## Artifact ownership and integrity

`acceptance-logs/` is owned by the GitHub runner with mode `0755`; native UID 25003 cannot create, replace or delete files at its root. `acceptance-logs/runtime/` is separately owned by UID/GID 25003 with mode `0700`. Native SQL/concurrency and actual-writer raw evidence are written there; runner-owned `tee` logs and the HTTP validator results remain in the trusted root. Directory mode `1777` is prohibited.

Before native SQL, `ws001a-artifact-integrity.sh snapshot` enforces owner and mode `0600` for pinned source-hash evidence, supply-chain manifests, image data, firewall proof, role permissions and schema setup logs. It stores a runner-only SHA-256 baseline and verifies a deliberately attempted write by UID 25003 to the pinned candidate evidence is **denied**. Every contained invocation is gated on role/egress evidence and the exact runtime directory ownership. On exit the collector checks hashes/modes and records the restricted directory's original owner/mode and contents, rejects symlinks, then transitions the runtime evidence to runner ownership so the artifact uploader can read it. The mandatory evidence gate rechecks the protected provenance hashes, original role matrix, all three runtime UIDs' probes, SQL/HTTP cases, and missing/contradictory artifacts. All checks are **designed fail-closed but unexecuted** until separately authorized.

## Network boundary

Preparation runs with external network to obtain apt packages, immutable Docker images, Node, and locked npm dependencies. APT uses only the workflow-generated signed Ubuntu 24.04 archive/security sources (no runner third-party APT source files). The npm lockfile is checked to require exclusively HTTPS `registry.npmjs.org` tarballs, and npm is invoked with that explicit registry and `--ignore-scripts`. Docker image acquisition is by the two immutable digest references; Actions themselves are full-SHA pinned. Preparation-source restrictions are enforced on invoked acquisition commands, **not** as a blanket pre-acquisition VM firewall; the GitHub-hosted runner still has ordinary network reachability during the preparation phase. No test-case code executes during acquisition (`npm ci --ignore-scripts`). Before starting either native database service, `ws001a-lockdown.sh` installs IPv4 and IPv6 `OUTPUT` rules with UID ownership matching:
- the pinned PostgreSQL image's measured `postgres` UID;
- PostgREST service UID `25002`;
- native SQL/Node/Python/curl test UID `25003`.

These identities may reach loopback only. The dedicated test UID has no sudo or Docker socket access. Runtime services share host networking but explicitly bind to `127.0.0.1`: PostgreSQL listens on 5432, PostgREST on 3000. There is no published public port. The native job verifies the actual host effective UIDs of both native container processes against the UID-targeted firewall rules, loopback listener bindings, denied external IPv4 **and IPv6** for all three runtime UIDs, denied external DNS/TLS for the test UID, permitted loopback connections to both services for those identities, and Docker socket/sudo/capability restrictions. It logs independent probe results and listener/namespace information for WS-022. A failed probe or unexpected process UID prevents native acceptance. The output is retained as raw proof for WS-022, not assumed successful in advance. Any failure blocks acceptance. GitHub runner/control and artifact-upload identities remain network-enabled; this is enforced **runtime-identity containment**, not a claim that the entire GitHub-hosted VM or Docker daemon has zero egress. Root-level compromise or misconfigured GitHub-hosted runner remains an explicit residual platform risk for WS-022 to review.

No production Core, Supabase, external commerce/webhook endpoint is configured or used. Their unreachability from the confined runtime is enforced by the UID-specific egress restrictions, rather than assumed from code inspection. Services run from pinned images with no production volumes or credentials.

## Exact dispatch guard

The manual `workflow_dispatch` requires the independently reviewed **40-character** `expected_commit` input. The separate `revision-guard` job compares `github.ref` and `github.sha` with this value **before checkout, artifact acquisition, or fixture setup**. Acceptance runs only if that gate passes; checkout then uses `ref: ${{ github.sha }}`, and compares checked-out HEAD to the expected commit. Moving the acceptance branch after review therefore results in rejection of the unreviewed SHA, not execution of newly changed source. This does **not** create GitHub branch protection or prohibit writes to the branch. PR #580 remains draft until independently authorized.

## Failure capture and evidence limitations

The always-run diagnostics step collects available PostgreSQL/PostgREST container logs, final SQL identities/NUMERIC snapshots, role and image metadata, firewall enforcement, concurrency/rollback and HTTP evidence. It stops disposable services after attempting snapshots and captures shutdown logs. It writes an evidence inventory and file hashes. The mandatory evidence gate requires the expected raw outputs and PASS sentinels and fails closed when any are missing; the artifact upload is `if: always()` and pins the upload action.

If GitHub fails before checkout, only workflow/job logs and whatever inline fallback log can be produced are available. If the runner crashes, is terminated, or loses network connectivity before artifact upload, uploaded artifacts **cannot be guaranteed**; GitHub's runner/job logs remain the outer evidence source. If dispatch selects the `main` stub rather than the acceptance-branch workflow, no native PASS is possible; exact SHA and full-harness steps must appear in the run. Native behavior is not certified until an authorized run is observed and reviewed by WS-022.

**Preflight and production rollout both remain HOLD until explicit independent acceptance and separate authorization.**

# WS-022 acceptance handoff

Prepared after the user reported green checks for remediation commit
`eb2a85b93ea55e8f66092656336361a1baeb4761`. Remote checks have not been
independently inspected. This handoff does not certify release readiness.

## Complete migration-chain gate

Use a host with Bash, Git, `psql`, the Supabase CLI, and a fresh disposable
local Supabase Postgres 17 instance. The repository's configured database port
is 54322. No migration-chain workflow is configured in `.github/workflows`.
The current execution host lacks these database prerequisites.

Before provisioning, inspect the installed CLI's `--help`, `db reset --help`,
and `migration up --help`. Use an empty local harness to provision the database:
booting directly from this repository can attempt its migrations before the
historical M15 prerequisite fixture is inserted. The authoritative script owns
the ordered reset, fixture insertion, remaining migrations, and final assertions.
Do not substitute plain Postgres with mocked Supabase schemas or extensions.

From the repository root, create two detached validation worktrees. Use new
paths that do not already exist. These are validation copies of exact commits,
not implementation branches.

```bash
git worktree add --detach ../ws022-chain-baseline 4f65ca1a6ec349671373210a8ac6d55beca905a1
git worktree add --detach ../ws022-chain-patched eb2a85b93ea55e8f66092656336361a1baeb4761
mkdir -p ../ws022-chain-results
supabase --version > ../ws022-chain-results/supabase-version.txt
psql --version > ../ws022-chain-results/psql-version.txt
```

Set `TRACEKIT_MIGRATION_TEST_DB_URL` to the fresh instance's localhost
`postgres` database URL using its local test password. Keep the URL out of
shared logs. Set `TRACEKIT_MIGRATION_TEST_DISPOSABLE=1` only after confirming
that the instance contains no data to preserve. Each invocation resets that
disposable database, so sequential runs can use the same instance.

```bash
export TRACEKIT_MIGRATION_TEST_DISPOSABLE=1
bash ../ws022-chain-baseline/scripts/test-m15-authoritative-migration-chain.sh > ../ws022-chain-results/baseline.log 2>&1
baseline_exit=$?
printf '%s\n' "$baseline_exit" > ../ws022-chain-results/baseline-exit.txt
bash ../ws022-chain-patched/scripts/test-m15-authoritative-migration-chain.sh > ../ws022-chain-results/patched.log 2>&1
patched_exit=$?
printf '%s\n' "$patched_exit" > ../ws022-chain-results/patched-exit.txt
```

Run these commands in Bash without `set -e`, so both exit codes are recorded.
Keep the instance available until any failures have been diagnosed. Do not
upload logs containing credentials; redact them before returning evidence.

Acceptance requires both exit codes to be zero, both logs to contain the
script's final `PASS: authoritative migration chain converged through ...`
line, and the same final migration version. Preserve the exact commits, CLI
version, database/server image version, exit codes, and sanitized logs. The
script checks required ledger entries, M15 context, authoritative action RPCs,
notification state, RLS and ACLs. A guard exit, partial ledger, or static test
result does not satisfy this gate. A new patched-only failure stops acceptance.

## Decisions owned by WS-019

- Disposition of the unchanged baseline failures: UI 93 failures, API nine
  failures/four skipped, 60 TypeScript diagnostics, and the single named M3
  confirmation-path gate failure. Matching baseline results establish no new
  observed regression; they do not establish that the existing gates pass.
- Review the remaining development-only findings: UI seven high/two moderate;
  nested relay two critical/one moderate. Production-only audits are zero in
  every package boundary. Do not silently accept development findings based
  only on that distinction.
- If framework-major remediation is required, authorize a separate bounded
  review of Vitest/Cloudflare test-pool and Tailwind/parser compatibility before
  implementation. No major framework upgrade is included in WS-022.

Return the migration evidence and explicit gate/risk dispositions to WS-019.
Keep `regression_gates` unproven until its acceptance evidence is satisfied.
Push, PR, merge and deployment remain separately authorized actions.

CLI reference: https://supabase.com/docs/reference/cli/introduction

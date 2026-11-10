#!/usr/bin/env bash
# Always-run best-effort collection. Must never block the following artifact upload.
set +e
mkdir -p acceptance-logs
{
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  echo "GITHUB_SHA=$GITHUB_SHA"
  echo "GITHUB_REF=$GITHUB_REF"
  echo "GITHUB_RUN_ID=$GITHUB_RUN_ID"
  echo "GITHUB_RUN_ATTEMPT=$GITHUB_RUN_ATTEMPT"
  echo "UID=$(id -u)"
} > acceptance-logs/runner-context.txt
if [[ -f ui/tests/native/ws001a-artifact-integrity.sh ]]; then
  bash ui/tests/native/ws001a-artifact-integrity.sh verify     > acceptance-logs/trusted-integrity-verification.log 2>&1
else
  echo 'HOLD: missing protected-provenance verifier' > acceptance-logs/trusted-integrity-verification.log
fi
if command -v docker >/dev/null 2>&1; then
  docker ps -a --no-trunc > acceptance-logs/docker-ps.txt 2>&1
  docker logs --timestamps ws001a-postgres > acceptance-logs/postgresql-service.log 2>&1
  docker logs --timestamps ws001a-postgrest > acceptance-logs/postgrest-runtime.log 2>&1
  docker inspect ws001a-postgres > acceptance-logs/postgresql-container-inspect.json 2>&1
  docker inspect ws001a-postgrest > acceptance-logs/postgrest-container-inspect.json 2>&1
  if [[ -n "$POSTGRES_IMAGE" ]]; then
    docker image inspect "$POSTGRES_IMAGE" --format '{{.RepoDigests}} {{.Os}}/{{.Architecture}}' > acceptance-logs/postgresql-image-final.txt 2>&1
  fi
  if [[ -n "$POSTGREST_IMAGE" ]]; then
    docker image inspect "$POSTGREST_IMAGE" --format '{{.RepoDigests}} {{.Os}}/{{.Architecture}}' > acceptance-logs/postgrest-image-final.txt 2>&1
  fi
fi
if command -v psql >/dev/null 2>&1 && command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  if [[ -f ui/tests/native/ws001a-contained-exec.sh && -f acceptance-logs/egress-probe-summary.txt ]]; then
    bash ui/tests/native/ws001a-contained-exec.sh psql -X -v ON_ERROR_STOP=1 -Atqc \
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name" \
      > acceptance-logs/fixture-tables.txt 2>&1
    bash ui/tests/native/ws001a-contained-exec.sh psql -X -v ON_ERROR_STOP=1 -Atqc \
      "SELECT id,platform,platform_order_id,provider_order_id,account_id,organization_id,connection_id,provider_account_id,canonical_order_id,amount::text FROM platform_orders ORDER BY id" \
      > acceptance-logs/orders-final-snapshot.txt 2>&1
    bash ui/tests/native/ws001a-contained-exec.sh psql -X -v ON_ERROR_STOP=1 -Atqc \
      "SELECT id,platform,transaction_id,event_type,account_id,amount::text,fee_amount::text,net_amount::text,raw_json::text FROM payment_transactions ORDER BY transaction_id,account_id" \
      > acceptance-logs/payments-final-snapshot.txt 2>&1
    bash ui/tests/native/ws001a-contained-exec.sh psql -X -v ON_ERROR_STOP=1 -Atqc \
      "SELECT rolname,rolsuper,rolcanlogin,rolinherit FROM pg_roles WHERE rolname IN ('fixture_admin','acceptance_sql','postgrest_login','web_anon') ORDER BY rolname" \
      > acceptance-logs/roles-final-snapshot.txt 2>&1
  fi
fi
if command -v iptables >/dev/null 2>&1; then
  sudo iptables -S OUTPUT > acceptance-logs/ipv4-output-final.txt 2>&1
  sudo ip6tables -S OUTPUT > acceptance-logs/ipv6-output-final.txt 2>&1
fi
# Preserve actual shutdown diagnostics after all final SQL snapshots are collected.
if command -v docker >/dev/null 2>&1; then
  docker stop --time 5 ws001a-postgrest > acceptance-logs/postgrest-stop.txt 2>&1
  docker stop --time 5 ws001a-postgres > acceptance-logs/postgresql-stop.txt 2>&1
  docker logs --timestamps ws001a-postgrest > acceptance-logs/postgrest-shutdown.log 2>&1
  docker logs --timestamps ws001a-postgres > acceptance-logs/postgresql-service.log 2>&1
fi
if [[ -d acceptance-logs/runtime ]]; then
  sudo find acceptance-logs/runtime -mindepth 1 -printf '%u:%g:%m %y %p\n' \
    > acceptance-logs/runtime-file-ownership.txt 2>&1
  sudo find acceptance-logs/runtime -type l -print \
    > acceptance-logs/runtime-symlinks.txt 2>&1
  sudo find acceptance-logs/runtime -mindepth 1 ! -type f ! -type d -print \
    > acceptance-logs/runtime-special-files.txt 2>&1
  if [[ ! -s acceptance-logs/runtime-symlinks.txt && ! -s acceptance-logs/runtime-special-files.txt ]]; then
    # Trusted collector snapshots untrusted files, never accepts a native PASS
    # sentinel as sole evidence. Keep original raw directory outside artifact tree.
    sudo mkdir -p acceptance-logs/runtime-copy
    sudo cp -a acceptance-logs/runtime/. acceptance-logs/runtime-copy/
    sudo find acceptance-logs/runtime -type f -print0 |
      sudo xargs -0 -r sha256sum > acceptance-logs/runtime-original-sha256.txt
    sudo find acceptance-logs/runtime-copy -type f -print0 |
      sudo xargs -0 -r sha256sum > acceptance-logs/runtime-copy-sha256.txt
    sed 's@acceptance-logs/runtime-copy/@acceptance-logs/runtime/@' \
      acceptance-logs/runtime-copy-sha256.txt |
      cmp -s - acceptance-logs/runtime-original-sha256.txt
    copy_verified=$?
    echo "runtime original/copy digest compare exit=$copy_verified" \
      > acceptance-logs/runtime-copy-integrity.txt
    if [[ "$copy_verified" == 0 ]]; then
      sudo mv acceptance-logs/runtime /tmp/ws001a-native-original-runtime
      sudo mv acceptance-logs/runtime-copy acceptance-logs/runtime
      sudo chown -R "$(id -u):$(id -g)" acceptance-logs/runtime
      sudo find acceptance-logs/runtime -type f -exec chmod 600 '{}' +
      chmod 700 acceptance-logs/runtime
      echo 'PASS: restricted raw evidence copied, digest matched, collector owns sealed copy' \
        >> acceptance-logs/runtime-copy-integrity.txt
    fi
  fi
fi
find acceptance-logs -type f -printf '%P\n' | sort > acceptance-logs/artifact-inventory.txt 2>&1
find acceptance-logs -type f ! -name 'file-sha256.txt' -print0 |
  sort -z | xargs -0 -r sha256sum > acceptance-logs/file-sha256.txt 2>&1
exit 0

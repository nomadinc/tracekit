#!/usr/bin/env bash
set -euo pipefail
mode="$1"
root=acceptance-logs
baseline="$root/.trusted-provenance.sha256"
protected="commit.txt candidate-hashes.txt supply-chain.manifest approved-apt.list postgresql-image.txt postgrest-image.txt postgresql-image-uid.txt contained-test-uid.txt npm-locked-acquisition.txt node-version.txt npm-version.txt tsx-version.txt postgresql-host-uid.txt postgresql-listener.txt egress-firewall-rules.txt egress-probe-summary.txt egress-all-uids.txt schema.log role-permissions.txt bootstrap-login-revoked.txt bootstrap-login-disabled.txt bootstrap-login-denied.log restricted-set-role-denied.log"
test "$(stat -c '%u:%g:%a' "$root")" = "$(id -u):$(id -g):755"
if [[ "$mode" == snapshot ]]; then
  test "$(stat -c '%u:%g:%a' "$root/runtime")" = '25003:25003:700'
  : > "$baseline"
  for name in $protected; do
    file="$root/$name"
    test -s "$file" && test ! -L "$file"
    test "$(stat -c '%u' "$file")" = "$(id -u)"
    chmod 600 "$file"
    sha256sum "$file" >> "$baseline"
  done
  set +e
  sudo -u ws001a-test env -i PATH=/usr/bin:/bin HOME=/tmp/ws001a-test \
    sh -c 'printf tamper >> acceptance-logs/candidate-hashes.txt' \
    > "$root/blocked-provenance-tamper.log" 2>&1
  denied=$?
  set -e
  test "$denied" != 0
  echo 'PASS: native UID cannot modify runner-owned provenance' > "$root/artifact-permission-checks.txt"
  chmod 600 "$root/blocked-provenance-tamper.log" "$root/artifact-permission-checks.txt"
  sha256sum "$root/blocked-provenance-tamper.log" "$root/artifact-permission-checks.txt" >> "$baseline"
  chmod 600 "$baseline"
  echo 'PASS: protected source hashes and provenance baseline captured'
elif [[ "$mode" == verify ]]; then
  test "$(stat -c '%u:%a' "$baseline")" = "$(id -u):600"
  while read -r hash file; do
    test ! -L "$file"
    test "$(stat -c '%u:%a' "$file")" = "$(id -u):600"
  done < "$baseline"
  sha256sum --check --status "$baseline"
  echo 'PASS: protected runner-owned provenance is unchanged'
else
  exit 2
fi

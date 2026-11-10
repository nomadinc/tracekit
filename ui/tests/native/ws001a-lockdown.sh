#!/usr/bin/env bash
# Restrict three isolated execution identities to loopback for the entire native phase.
# Run only after all packages/images have been acquired.
set -euo pipefail
mkdir -p acceptance-logs
PG_UID="$(cat acceptance-logs/postgresql-image-uid.txt)"
PGRST_UID=25002
TEST_UID=25003
for uid in "$PG_UID" "$PGRST_UID" "$TEST_UID"; do
  [[ "$uid" =~ ^[0-9]+$ ]] || { echo "Invalid isolated UID"; exit 1; }
  [[ "$uid" != "$(id -u)" && "$uid" != "0" ]] || { echo "Unsafe isolated UID"; exit 1; }
done
sudo iptables -w -N WS001A_EGRESS || true
sudo iptables -w -F WS001A_EGRESS
sudo iptables -w -A WS001A_EGRESS -o lo -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -w -A WS001A_EGRESS -o lo -d 127.0.0.1/32 -p tcp -m multiport --dports 5432,3000 -j ACCEPT
sudo iptables -w -A WS001A_EGRESS -j REJECT
sudo ip6tables -w -N WS001A_EGRESS || true
sudo ip6tables -w -F WS001A_EGRESS
sudo ip6tables -w -A WS001A_EGRESS -o lo -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# No IPv6 native service is required. All new IPv6 connections are denied.
sudo ip6tables -w -A WS001A_EGRESS -j REJECT
for uid in "$PG_UID" "$PGRST_UID" "$TEST_UID"; do
  sudo iptables -w -C OUTPUT -m owner --uid-owner "$uid" -j WS001A_EGRESS 2>/dev/null ||
    sudo iptables -w -I OUTPUT 1 -m owner --uid-owner "$uid" -j WS001A_EGRESS
  sudo ip6tables -w -C OUTPUT -m owner --uid-owner "$uid" -j WS001A_EGRESS 2>/dev/null ||
    sudo ip6tables -w -I OUTPUT 1 -m owner --uid-owner "$uid" -j WS001A_EGRESS
done
{
  echo "=== ipv4 OUTPUT and dedicated chain ==="
  sudo iptables -w -S OUTPUT
  sudo iptables -w -S WS001A_EGRESS
  echo "=== ipv6 OUTPUT and dedicated chain ==="
  sudo ip6tables -w -S OUTPUT
  sudo ip6tables -w -S WS001A_EGRESS
  echo "PG_UID=$PG_UID PGRST_UID=$PGRST_UID TEST_UID=$TEST_UID"
} | tee acceptance-logs/egress-firewall-rules.txt

# Test all three runtime UIDs (PostgreSQL, PostgREST, native application).
# setpriv executes the probe with the same effective UID as each runtime process.
test -x /usr/bin/curl
test -x /usr/bin/setpriv
for uid in "$PG_UID" "$PGRST_UID" "$TEST_UID"; do
  observed="$(sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups id -u)"
  [[ "$observed" == "$uid" ]] || { echo "FAIL: wrong probe UID $observed expected $uid"; exit 1; }
  echo "probe identity $uid verified" | tee -a acceptance-logs/egress-all-uids.txt
  set +e
  sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups \
    env -i PATH=/usr/bin:/bin HOME=/tmp \
    curl --noproxy '*' --connect-timeout 2 --max-time 4 -fsS http://1.1.1.1/ \
    > "acceptance-logs/egress-uid-$uid.log" 2>&1
  code=$?
  set -e
  echo "runtime UID $uid external IPv4 exit=$code (must be nonzero)" |
    tee -a acceptance-logs/egress-all-uids.txt
  [[ "$code" != 0 ]] || { echo "FAIL: runtime UID $uid has external IPv4 egress"; exit 1; }
  set +e
  sudo setpriv --reuid="$uid" --regid="$uid" --clear-groups \
    env -i PATH=/usr/bin:/bin HOME=/tmp \
    curl --noproxy '*' --ipv6 --globoff --connect-timeout 2 --max-time 4 \
    -fsS 'http://[2606:4700:4700::1111]/' \
    > "acceptance-logs/egress-ipv6-uid-$uid.log" 2>&1
  ipv6_code=$?
  set -e
  echo "runtime UID $uid external IPv6 exit=$ipv6_code (must be nonzero)" |
    tee -a acceptance-logs/egress-all-uids.txt
  [[ "$ipv6_code" != 0 ]] || { echo "FAIL: runtime UID $uid has external IPv6 egress"; exit 1; }
done
# Also test external name-resolution/TLS as the native application identity.
set +e
sudo -u ws001a-test env -i HOME=/tmp/ws001a-test PATH=/usr/bin:/bin \
  curl --noproxy '*' --connect-timeout 2 --max-time 4 -fsS http://1.1.1.1/ \
  > acceptance-logs/egress-ip-probe.log 2>&1
ip_exit=$?
sudo -u ws001a-test env -i HOME=/tmp/ws001a-test PATH=/usr/bin:/bin \
  curl --noproxy '*' --connect-timeout 2 --max-time 4 -fsS https://api.github.com/ \
  > acceptance-logs/egress-dns-probe.log 2>&1
dns_exit=$?
set -e
{
  echo "external IPv4 probe exit=$ip_exit (must be nonzero)"
  echo "external DNS/TLS probe exit=$dns_exit (must be nonzero)"
} | tee acceptance-logs/egress-probe-summary.txt
[[ "$ip_exit" != 0 && "$dns_exit" != 0 ]] || { echo "FAIL: isolated user has external egress"; exit 1; }

# Docker socket connection is tested in the post-startup local-network proof.
echo "PASS: enforcement probes, UID-scoped IPv4/IPv6 restrictions installed" | tee -a acceptance-logs/egress-probe-summary.txt

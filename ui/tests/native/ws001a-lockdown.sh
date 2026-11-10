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
sudo iptables -w -A WS001A_EGRESS -d 127.0.0.0/8 -j ACCEPT
sudo iptables -w -A WS001A_EGRESS -j REJECT
sudo ip6tables -w -N WS001A_EGRESS || true
sudo ip6tables -w -F WS001A_EGRESS
sudo ip6tables -w -A WS001A_EGRESS -d ::1/128 -j ACCEPT
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

# Test both IP and DNS egress using the unprivileged test identity; require failure.
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

# No source under test runs as runner/sudo. Docker socket must be inaccessible.
if sudo -u ws001a-test test -r /var/run/docker.sock; then
  echo "FAIL: test user can read Docker socket"
  exit 1
fi
echo "PASS: enforcement probes, blocked Docker socket, isolated UIDs" | tee -a acceptance-logs/egress-probe-summary.txt

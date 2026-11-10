#!/usr/bin/env python3
"""Runner-trusted checks against final PostgreSQL snapshots, not test PASS markers."""
import json
from pathlib import Path

root = Path("acceptance-logs")
summary = json.loads((root / "runtime/actual-writer-summary.json").read_text())
orders = [line.split("|") for line in (root / "orders-final-snapshot.txt").read_text().splitlines() if line.strip()]
payments = [line.split("|", 8) for line in (root / "payments-final-snapshot.txt").read_text().splitlines() if line.strip()]
stem = "11111111-1111-4111-8111-111111111111"
assert summary.get("status") == "PASS"
stem_orders = [r for r in orders if len(r) >= 10 and r[3] == "102872" and r[4] == stem]
nh_orders = [r for r in orders if len(r) >= 10 and r[3] == "102872" and r[4] != stem]
assert len(stem_orders) == 1 and len(nh_orders) == 1, (stem_orders, nh_orders)
assert stem_orders[0][0] == str(summary["stemOrderId"])
assert stem_orders[0][2] == "102872"
assert nh_orders[0][0] == str(summary["nhOrderId"])
assert nh_orders[0][2].startswith("next29:scoped:")
stem_payments = [r for r in payments if len(r) == 9 and r[2] == "2446" and r[3] == "debit" and r[4] == stem]
nh_payments = [r for r in payments if len(r) == 9 and r[2] == "2446" and r[3] == "debit" and r[4] != stem]
assert len(stem_payments) == 1 and len(nh_payments) == 1
assert stem_payments[0][0] == summary["stemPaymentId"]
assert stem_payments[0][5] == "19.990000"
assert stem_payments[0][8] == "", "Legacy payment raw provenance was changed"
assert nh_payments[0][0] == summary["nhPaymentId"]
assert summary["orderCount"] == 2 and summary["paymentCount"] == 2
print("PASS: independent SQL snapshots confirm two distinct orders, two payments, original Stem identities, unchanged 19.990000 and missing legacy provenance")

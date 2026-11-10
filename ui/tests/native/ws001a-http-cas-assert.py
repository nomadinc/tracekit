#!/usr/bin/env python3
"""Validate raw PostgREST GET and guarded PATCH evidence without float coercion."""
import argparse
import decimal
import json
import re
import sys
import unittest
from pathlib import Path


def parse_http(raw):
    """Parse curl -i bytes; reject malformed, ambiguous, or multiple responses."""
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    split = re.search(br"\r?\n\r?\n", raw)
    if not split:
        raise AssertionError("HTTP header/body delimiter is absent")
    header_bytes, body = raw[:split.start()], raw[split.end():]
    header_lines = re.split(br"\r?\n", header_bytes)
    match = re.fullmatch(rb"HTTP/\d(?:\.\d)?\s+(\d{3})(?:\s+[^\r\n]*)?", header_lines[0])
    if not match:
        raise AssertionError("HTTP status line malformed")
    status = int(match.group(1))
    headers = {}
    for line in header_lines[1:]:
        if b":" not in line:
            raise AssertionError("Malformed HTTP header")
        key, value = line.split(b":", 1)
        key = key.decode("ascii").strip().lower()
        value = value.decode("latin-1").strip()
        if key in headers:
            raise AssertionError("Duplicate HTTP header: " + key)
        headers[key] = value
    return status, headers, body


def parse_rows(body, *, allow_empty=False):
    if not body.strip():
        if allow_empty:
            return []
        raise AssertionError("Expected PostgREST JSON representation is absent")
    rows = json.loads(body.decode("utf-8"), parse_float=decimal.Decimal, parse_int=int)
    if not isinstance(rows, list):
        raise AssertionError("Expected a JSON array representation")
    return rows


def check_range(headers, expected, *, allow_unknown=False):
    value = headers.get("content-range")
    if value is None:
        return "absent (optional; row count verified from representation and database)"
    if not re.fullmatch(r"(?:\d+-\d+/(?:\d+|\*)|\*/(?:\d+|\*))", value):
        raise AssertionError("Invalid Content-Range: " + value)
    if expected == 1 and value != "0-0/1" and not (allow_unknown and value == "0-0/*"):
        raise AssertionError("Content-Range contradicts one affected row: " + value)
    if expected == 0 and value not in ("*/0", "0-0/0"):
        raise AssertionError("Content-Range contradicts zero affected rows: " + value)
    if expected not in (0, 1):
        raise AssertionError("Unsupported expected row count")
    return value


def validate(get_raw, success_raw, stale_raw):
    get_status, get_headers, get_body = parse_http(get_raw)
    if get_status != 200:
        raise AssertionError("Scoped GET must return HTTP 200: " + str(get_status))
    get_rows = parse_rows(get_body)
    if len(get_rows) != 1:
        raise AssertionError("Scoped GET must identify exactly one order")
    before = get_rows[0]
    if (not isinstance(before.get("id"), int) or before["id"] <= 0
            or before.get("platform_order_id") != "102872"
            or before.get("version") != 1
            or before.get("amount") != decimal.Decimal("123.450000")):
        raise AssertionError("Unexpected scoped GET identity, version, or NUMERIC")
    get_range = check_range(get_headers, 1, allow_unknown=True)

    success_status, success_headers, success_body = parse_http(success_raw)
    if success_status != 200:
        raise AssertionError("Guarded success PATCH must return HTTP 200: " + str(success_status))
    success_rows = parse_rows(success_body)
    if len(success_rows) != 1 or success_rows[0] != {"id": before["id"], "version": 2}:
        raise AssertionError("Guarded PATCH must acknowledge exactly one original row at version 2")
    success_range = check_range(success_headers, 1)

    stale_status, stale_headers, stale_body = parse_http(stale_raw)
    if stale_status not in (200, 204):
        raise AssertionError("Stale PATCH unexpected HTTP status: " + str(stale_status))
    stale_rows = parse_rows(stale_body, allow_empty=stale_status == 204)
    if stale_rows:
        raise AssertionError("Stale PATCH unexpectedly acknowledged affected rows")
    if stale_status == 200 and not stale_body.strip():
        raise AssertionError("HTTP 200 stale PATCH must contain [] representation")
    if stale_status == 204 and stale_body.strip():
        raise AssertionError("HTTP 204 stale PATCH must not contain a body")
    stale_range = check_range(stale_headers, 0)
    return {
        "status": "PASS", "original_order_id": before["id"],
        "get": {"status": get_status, "rows": len(get_rows), "content_range": get_range,
                "numeric_exact": str(before["amount"])},
        "successful_patch": {"status": success_status, "affected_rows": len(success_rows),
                             "version": success_rows[0]["version"], "content_range": success_range},
        "stale_patch": {"status": stale_status, "affected_rows": len(stale_rows),
                        "content_range": stale_range}
    }


class ValidatorTests(unittest.TestCase):
    def example(self, status, rows, headers=None, endings="\r\n"):
        header_lines = [f"HTTP/1.1 {status} Test"]
        for key, value in (headers or {}).items():
            header_lines.append(f"{key}: {value}")
        body = json.dumps(rows, separators=(",", ":")) if rows is not None else ""
        return (endings.join(header_lines) + endings * 2 + body).encode()

    def fixture(self, stale_status=200, ranges=True):
        get = self.example(200, [{"id": 1, "platform_order_id": "102872",
                                  "version": 1, "amount": 123.45}],
                           {"Content-Range": "0-0/1"} if ranges else {})
        ok = self.example(200, [{"id": 1, "version": 2}],
                          {"Content-Range": "0-0/1"} if ranges else {})
        no = self.example(stale_status, [] if stale_status == 200 else None,
                          {"Content-Range": "*/0"} if ranges else {})
        return get, ok, no

    def test_exact_row_counts_with_content_range(self):
        self.assertEqual(validate(*self.fixture())["stale_patch"]["affected_rows"], 0)

    def test_optional_content_range_absent(self):
        self.assertEqual(validate(*self.fixture(ranges=False))["successful_patch"]["affected_rows"], 1)

    def test_get_content_range_unknown_total(self):
        get, success, stale = self.fixture()
        get = get.replace(b"Content-Range: 0-0/1", b"Content-Range: 0-0/*")
        self.assertEqual(validate(get, success, stale)["get"]["content_range"], "0-0/*")

    def test_zero_204_optional_header(self):
        self.assertEqual(validate(*self.fixture(stale_status=204, ranges=False))["stale_patch"]["status"], 204)

    def test_wrong_zero_count_denied(self):
        get, success, _ = self.fixture()
        with self.assertRaises(AssertionError):
            validate(get, success, self.example(200, [], {"Content-Range": "0-0/1"}))

    def test_non_empty_stale_denied(self):
        get, success, _ = self.fixture()
        with self.assertRaises(AssertionError):
            validate(get, success, self.example(200, [{"id": 1, "version": 3}]))

    def test_unexpected_status_denied(self):
        get, success, _ = self.fixture()
        with self.assertRaises(AssertionError):
            validate(get, success, self.example(409, {"code": "23505"}))

    def test_success_wrong_identity_denied(self):
        get, _, stale = self.fixture()
        with self.assertRaises(AssertionError):
            validate(get, self.example(200, [{"id": 2, "version": 2}]), stale)

    def test_exact_decimal_parser(self):
        get, success, stale = self.fixture()
        get = get.replace(b"123.45", b"123.450000")
        self.assertEqual(validate(get, success, stale)["get"]["numeric_exact"], "123.450000")

    def test_wrong_numeric_denied(self):
        get, success, stale = self.fixture()
        with self.assertRaises(AssertionError):
            validate(get.replace(b"123.45", b"123.450001"), success, stale)

    def test_crlf_and_lf(self):
        get, success, stale = self.fixture(ranges=False)
        self.assertEqual(validate(get.replace(b"\r\n", b"\n"), success, stale)["status"], "PASS")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--get", dest="get_path", type=Path)
    p.add_argument("--success", type=Path)
    p.add_argument("--stale", type=Path)
    p.add_argument("--out", type=Path)
    args = p.parse_args()
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ValidatorTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    if not all((args.get_path, args.success, args.stale, args.out)):
        p.error("--get, --success, --stale and --out required")
    result = validate(args.get_path.read_bytes(), args.success.read_bytes(), args.stale.read_bytes())
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatDisputeAmount } from "../lib/chargebacks/format-currency";

test("principal and fee retain independent currencies", () => {
  assert.match(
    formatDisputeAmount(100, "EUR", "provider_payload.currency"),
    /€100\.00/
  );
  assert.match(
    formatDisputeAmount(5, "GBP", "provider_payload.fee_currency"),
    /£5\.00/
  );
});

test("unknown currency never defaults to USD", () => {
  assert.equal(
    formatDisputeAmount(100, null, null),
    "100.00 (currency unknown)"
  );
  assert.equal(
    formatDisputeAmount(5, "USD", null),
    "5.00 (currency unknown)"
  );
});

test("zero values and missing amounts remain distinct", () => {
  assert.equal(
    formatDisputeAmount(0, null, null),
    "0.00 (currency unknown)"
  );
  assert.equal(formatDisputeAmount(null, "USD", "provider_payload.currency"), "—");
});

test("detail currency null does not fall back to list currency", () => {
  const source = readFileSync(
    new URL("../components/chargebacks/chargeback-review-workspace.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /detail \? detail\.currency : selected\.currency/);
  assert.match(source, /detail \? detail\.feeCurrency : selected\.feeCurrency/);
  assert.doesNotMatch(source, /detail\?\.currency\?\?selected\.currency/);
  assert.doesNotMatch(source, /currency:"USD"/);
});

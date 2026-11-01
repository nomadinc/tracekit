import assert from "node:assert/strict";
import test from "node:test";
import { qualifyProfitCurrency } from "./profit-currency-qualification";

test("USD-only records are qualified", () => {
  assert.deepEqual(
    qualifyProfitCurrency([{ currency: "USD" }, { currency: "usd" }]),
    {
      valid: true,
      currency: "USD",
      currencies: ["USD"],
      data_available: true,
    }
  );
});

test("GBP-only records are qualified", () => {
  const result = qualifyProfitCurrency([{ currency: "GBP" }]);
  assert.equal(result.valid, true);
  assert.equal(result.currency, "GBP");
});

test("EUR-only records are qualified", () => {
  const result = qualifyProfitCurrency([{ currency: "EUR" }]);
  assert.equal(result.valid, true);
  assert.equal(result.currency, "EUR");
});

test("mixed currencies are rejected", () => {
  const result = qualifyProfitCurrency([
    { currency: "USD" },
    { currency: "EUR" },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.currency, null);
  assert.deepEqual(result.currencies, ["EUR", "USD"]);
});

test("missing currency is rejected", () => {
  const result = qualifyProfitCurrency([
    { currency: "USD" },
    { currency: null },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.currency, null);
});

test("empty reporting periods remain unavailable", () => {
  assert.deepEqual(qualifyProfitCurrency([]), {
    valid: true,
    currency: null,
    currencies: [],
    data_available: false,
  });
});

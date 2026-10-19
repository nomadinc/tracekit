import assert from "node:assert/strict";
import test from "node:test";
import { sourceMoney, displaySourceMoney, aggregateSourceMoney } from "./ws026-source-money.ts";
test("missing and invalid amounts never become zero", () => {
 for (const amount of [null, undefined, "", "abc", NaN, Infinity, false]) assert.equal(sourceMoney(amount, "USD"), null);
});
test("real zero is preserved", () => assert.deepEqual(sourceMoney("0.00", "USD"), { amount: 0, currency: "USD" }));
test("unknown currency is not USD", () => assert.equal(sourceMoney("12.50", null), null));
test("currency formatting uses source currency", () => {
 assert.match(displaySourceMoney(sourceMoney("12.50", "EUR")), /€/);
 assert.equal(displaySourceMoney(null), "Unavailable");
});
test("mixed-currency or missing input refuses aggregation", () => {
 assert.equal(aggregateSourceMoney([sourceMoney(2, "USD"), sourceMoney(3, "EUR")]), null);
 assert.equal(aggregateSourceMoney([sourceMoney(2, "USD"), null]), null);
});
test("same-currency zero remains a valid aggregate", () =>
 assert.deepEqual(aggregateSourceMoney([sourceMoney(2, "USD"), sourceMoney(-2, "USD")]), { amount: 0, currency: "USD" }));

import assert from "node:assert/strict";
import test from "node:test";
import { selectedDetail } from "../lib/chargebacks/selected-detail";

test("old dispute detail is hidden immediately when selection changes", () => {
  const a = { currency: "EUR", feeCurrency: "GBP" };
  const loaded = { id: "A", value: a };

  assert.equal(selectedDetail("A", loaded), a);
  assert.equal(selectedDetail("B", loaded), null);
  assert.equal(selectedDetail(null, loaded), null);
});

test("only matching dispute detail is displayed", () => {
  const b = { currency: null, feeCurrency: null };
  const loaded = { id: "B", value: b };

  assert.equal(selectedDetail("A", loaded), null);
  assert.equal(selectedDetail("B", loaded), b);
  assert.equal(selectedDetail("B", null), null);
});

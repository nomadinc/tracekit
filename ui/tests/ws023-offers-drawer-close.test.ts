import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/offers/commerce-product-mapping-review.tsx", import.meta.url),
  "utf8"
);

test("Offers bulk drawer Close uses zero-argument callback", () => {
  assert.match(source, /onCancel=\{\(\) => drawer\.closeDrawer\(\)\}/);
  assert.doesNotMatch(source, /onCancel=\{drawer\.closeDrawer\}/);
});

test("bulk Close button invokes its onCancel callback", () => {
  assert.match(source, /onClick=\{onCancel\}/);
});

test("Offers callback does not modify owner-scoped cleanup", () => {
  assert.match(source, /onChanged=\{async \(\) => \{ drawer\.closeDrawer\(\); await loadList\(\); \}\}/);
});

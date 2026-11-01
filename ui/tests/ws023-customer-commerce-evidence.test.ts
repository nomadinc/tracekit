import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../lib/customers/production-repository.ts", import.meta.url),
  "utf8"
);

test("timestamp proximity cannot establish order identity", () => {
  assert.doesNotMatch(source, /Math\\.abs\\(orderTime - eventTime\\)/);
  assert.match(source, /const explicitOrderId/);
});

test("missing canonical Journey retains order-only evidence", () => {
  assert.match(source, /const commerceOnlyStory/);
  assert.match(source, /canonical Journey unresolved/);
  assert.match(source, /no canonical Journey relationship is asserted/);
});

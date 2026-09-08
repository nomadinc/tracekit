import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const relativePath of [
  "lib/commerce/shopify-core/normalized-writer.ts",
  "../api/src/connectors/shopify/normalized-writer.ts",
]) {
  test(`${relativePath} updates an existing refund ledger row instead of skipping it`, () => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

    assert.match(source, /const ledgerBody = \{/);
    assert.match(source, /if \(existing\[0\]\) \{/);
    assert.match(source, /method: "PATCH"/);
    assert.match(source, /conversions\?id=eq\.\$\{q\(existing\[0\]\.id\)\}/);
    assert.match(source, /amount: -Math\.abs\(refund\.amount\)/);
    assert.match(source, /else \{\s*await request\("conversions", \{\s*method: "POST"/s);
  });
}

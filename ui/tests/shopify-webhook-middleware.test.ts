import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Shopify signed webhook is the only commerce webhook explicitly public through WorkOS middleware", async () => {
  const middleware = await source("middleware.ts");
  assert.match(middleware, /unauthenticatedPaths:[\s\S]*"\/api\/webhooks\/shopify"/);
  assert.doesNotMatch(middleware, /"\/api\/webhooks\/:path\*"/);
});

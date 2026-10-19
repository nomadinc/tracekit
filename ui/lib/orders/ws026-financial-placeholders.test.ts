import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const repo = readFileSync(fileURLToPath(new URL("./production-repository.ts", import.meta.url)), "utf8");
const view = readFileSync(fileURLToPath(new URL("../../components/orders/order-workspace.tsx", import.meta.url)), "utf8");
test("unknown processor currency is not asserted as USD", () => {
 assert.doesNotMatch(repo, /currency:"USD",captures:/);
 assert.match(repo, /currency:null,captures:/);
});
test("missing shipping financial amounts remain null", () => {
 assert.match(repo, /shipping:\{charged:null,actual:null,packaging:null,margin:null\}/);
});
test("shipping UI distinguishes unknown values from zero", () => {
 for (const field of ["charged", "actual", "packaging", "margin"])
  assert.ok(view.includes(`snap.shipping.${field} === null ? "Unavailable"`));
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerDeepLink, normalizeCustomerDeepLink, selectCustomerDetailId } from "../lib/customers/deep-link";

const stem = "c1e3833d-b565-46b7-8414-6476edce9e4c";
const nh = "8129566a-4fc7-438d-ad6d-417ec3745358";
const customers = [{ id: stem }, { id: nh }] as any;

test("valid Stem and NH direct customer URLs retain exact requested IDs", () => {
  for (const id of [stem, nh]) {
    const parsed = parseCustomerDeepLink("v=1&customer_id=" + id);
    assert.equal(selectCustomerDetailId(id, parsed.customerId, customers), id);
    assert.equal(normalizeCustomerDeepLink(parsed, customers).customerId, id);
  }
});
test("invalid opaque and malformed explicit IDs never select first or cached customer", () => {
  for (const raw of ["missing-person", "invalid id", "", "foreign-person"]) {
    const parsed = parseCustomerDeepLink("v=1&customer_id=" + encodeURIComponent(raw));
    const selected = selectCustomerDetailId(raw, parsed.customerId, customers);
    assert.equal(selected, parsed.customerId);
    assert.notEqual(selected, stem);
    assert.equal(normalizeCustomerDeepLink(parsed, customers).customerId, parsed.customerId);
  }
});
test("only list navigation without customer_id may default to first customer", () => {
  const parsed = parseCustomerDeepLink("v=1");
  assert.equal(selectCustomerDetailId(null, parsed.customerId, customers), stem);
  assert.equal(normalizeCustomerDeepLink(parsed, customers).customerId, null);
});
test("back/forward and NH to Stem to NH keep exact requested identity", () => {
  const history = [nh, stem, nh, "missing-person", nh];
  for (const id of history) {
    const parsed = parseCustomerDeepLink("v=1&customer_id=" + id);
    assert.equal(selectCustomerDetailId(id, parsed.customerId, customers), id);
  }
});
test("foreign customer identity never normalizes to authorized list member", () => {
  const parsed = parseCustomerDeepLink("v=1&customer_id=foreign-person");
  assert.equal(normalizeCustomerDeepLink(parsed, [{id:stem}] as any).customerId, "foreign-person");
});

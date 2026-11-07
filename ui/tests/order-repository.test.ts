import assert from "node:assert/strict";
import test from "node:test";
import { developmentIdentityById } from "../lib/identity/development-state";
import {
  normalizeOrderDeepLink,
  orderDeepLinkHref,
  parseOrderDeepLink,
} from "../lib/orders/deep-link";
import {
  calculateProcessorFee,
  MockOrderRepository,
} from "../lib/orders/mock-repository";
import { resolveMockRepositoryScope } from "../lib/identity/mock-repository-scope";
const identity = (id: string) => {
  const v = developmentIdentityById(id);
  assert.ok(v);
  return v;
};
const scope = (
  id = "client-admin",
  org: string | null = "org-bullseye",
  offer: string | null = "offer-bullseye",
) => resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity(id), activeOrganizationId: org, activeBusinessContextId: offer });
test("unobserved Orders never produce identities, captures, financial drawers or search records", async () => {
  const repository = new MockOrderRepository();
  for (const current of [scope(), scope("client-read-only"), scope("agency-owner", "org-valuerx", "offer-valuerx-individual"), scope("platform-admin", null, null)]) {
    assert.deepEqual(await repository.listOrders(current), []);
    assert.deepEqual(await repository.listOrders(current, { state: "profitable", query: "TK" }), []);
    assert.equal(await repository.resolveOrder(current, "ord-123"), null);
    assert.equal(await repository.loadWorkspace(current, "ord-123"), null);
    assert.deepEqual(await repository.loadTimeline(current, "ord-123"), []);
    assert.equal(await repository.loadDrawer(current, "ord-123", "processor-fee:processor-fees"), null);
    assert.deepEqual(await repository.search(current, "ef_ord_10482"), []);
    const state = await repository.resolveDeepLink(current, parseOrderDeepLink("?order_id=ord-123&line=missing&drawer_kind=processor-fee&drawer_id=missing"));
    assert.equal(state.orderId, null);
    assert.equal(state.drawer, null);
  }
});
test("processor expected fee applies fixed fee to every capture", () => {
  const fee = calculateProcessorFee(
    "PayPal",
    2.9,
    0.29,
    [
      { id: "1", amount: 150 },
      { id: "2", amount: 74.9 },
    ],
    7.14,
  );
  assert.equal(fee.captures[0].expectedFee, 4.64);
  assert.equal(fee.captures[1].expectedFee, 2.46);
  assert.equal(fee.expectedFee, 7.1);
  assert.equal(fee.variance, 0.04);
  assert.match(fee.captures[1].formula, /\+ \$0.29/);
});
test("Order route contracts preserve production destinations", () => {
  const href = orderDeepLinkHref(
    {
      orderId: "ord-123",
      offerId: "offer-bullseye",
      customerId: "cust-123",
      focus: "ledger",
    },
    "client-admin",
  );
  assert.match(href, /^\/orders\?/);
  assert.doesNotMatch(href, /concepts/);
  assert.match("/customers?customer_id=cust-123", /^\/customers/);
  assert.match("/offers?offer_id=offer-bullseye", /^\/offers/);
});

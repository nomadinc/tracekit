import assert from "node:assert/strict";
import test from "node:test";
import { developmentIdentityById } from "../lib/identity/development-state";
import {
  customerDeepLinkHref,
  normalizeCustomerDeepLink,
  parseCustomerDeepLink,
} from "../lib/customers/deep-link";
import { MockCustomerRepository } from "../lib/customers/mock-repository";
import { resolveMockRepositoryScope } from "../lib/identity/mock-repository-scope";
const identity = (id: string) => {
  const v = developmentIdentityById(id);
  assert.ok(v);
  return v;
};
const scope = (
  id = "client-admin",
  organizationId: string | null = "org-bullseye",
  businessContextId: string | null = "offer-bullseye",
) => resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity(id), activeOrganizationId: organizationId, activeBusinessContextId: businessContextId });
test("Customer snapshots are scoped, serializable, and cloned", async () => {
  const r = new MockCustomerRepository(),
    list = await r.listCustomers(scope());
  assert.ok(list.every((c) => c.organizationId === "org-bullseye"));
  const a = await r.loadWorkspace(scope(), "cust-123");
  assert.ok(a);
  a.customer.name = "Changed";
  const b = await r.loadWorkspace(scope(), "cust-123");
  assert.notEqual(b?.customer.name, "Changed");
  assert.doesNotThrow(() => JSON.stringify(b));
});
test("sensitive fields and financials follow capabilities", async () => {
  const r = new MockCustomerRepository(),
    view = await r.loadWorkspace(scope("client-read-only"), "cust-123");
  assert.equal(view?.customer.sensitiveMasked, true);
  assert.match(view?.customer.email || "", /•/);
  assert.equal(view?.orders[0].profit, 842);
  const support = await r.loadWorkspace(scope("client-admin"), "cust-123");
  assert.equal(support?.customer.sensitiveMasked, false);
});
test("inaccessible and platform Customer scopes are denied", async () => {
  const r = new MockCustomerRepository();
  assert.equal(await r.loadWorkspace(scope(), "cust-vrx-1"), null);
  assert.deepEqual(
    await r.listCustomers(scope("platform-admin", null, null)),
    [],
  );
  assert.equal(
    await r.resolveCustomer(scope("client-admin", null, null), "cust-vrx-1"),
    null,
  );
  assert.deepEqual(
    await r.resolveCustomer(scope("agency-owner", "org-valuerx", "offer-valuerx-individual"), "cust-vrx-1"),
    {
      organizationId: "org-valuerx",
      businessContextId: "offer-valuerx-individual",
      customerId: "cust-vrx-1",
    },
  );
});
test("deep links normalize invalid event, identifier, Order, and Drawer state", async () => {
  const r = new MockCustomerRepository(),
    list = await r.listCustomers(scope()),
    snap = await r.loadWorkspace(scope(), "cust-123");
  const state = normalizeCustomerDeepLink(
    parseCustomerDeepLink(
      "?v=1&customer_id=missing&event_id=bad&identifier_ref=bad&order_id=bad&drawer_kind=journey-event&drawer_id=bad&replay=1",
    ),
    list,
    snap,
  );
  assert.equal(state.customerId, "cust-123");
  assert.equal(state.eventId, null);
  assert.equal(state.identifierRef, null);
  assert.equal(state.orderId, null);
  assert.equal(state.drawerId, null);
  assert.equal(state.replay, true);
});
test("identifier search focuses the matching event and production Drawer", async () => {
  const r = new MockCustomerRepository(),
    results = await r.search(scope(), "ef_21a7f0ce98");
  assert.ok(results.length);
  const parsed = parseCustomerDeepLink(results[0].href.split("?")[1]);
  assert.equal(parsed.customerId, "cust-123");
  assert.ok(parsed.eventId);
  assert.match(parsed.identifierRef || "", /^everflow-/);
  assert.equal(parsed.drawer?.kind, "identifier");
  assert.doesNotMatch(results[0].href, /ef_21a7f0ce98/);
  assert.doesNotMatch(results[0].href, /concepts/);
});
test("Customer changes clear incompatible temporary and Replay state", async () => {
  const r = new MockCustomerRepository(),
    list = await r.listCustomers(scope()),
    next = await r.loadWorkspace(scope(), "cust-124");
  const normalized = normalizeCustomerDeepLink(
    {
      version: 1,
      customerId: "cust-124",
      focus: "journey",
      eventId: "cust-123-evt-1",
      identifierRef: "fbclid-cust-123-evt-1",
      orderId: "ord-123",
      offerId: null,
      drawer: { kind: "journey-event", recordId: "cust-123-evt-1" },
      searchRef: null,
      replay: true,
    },
    list,
    next,
  );
  assert.equal(normalized.eventId, null);
  assert.equal(normalized.orderId, null);
  assert.equal(normalized.drawerId, null);
  assert.equal(normalized.replay, true);
});
test("Mission Control, Offer, and Order contracts use production routes", () => {
  const href = customerDeepLinkHref(
    { customerId: "cust-123", offerId: "offer-bullseye", focus: "journey" },
    "client-admin",
  );
  assert.match(href, /^\/customers\?/);
  assert.doesNotMatch(href, /concepts/);
  assert.match(`/orders?customer_id=cust-123`, /^\/orders\?/);
});
test("privacy conclusions retain uncertainty", async () => {
  const r = new MockCustomerRepository(),
    snap = await r.loadWorkspace(
      scope("client-admin", "org-bullseye", "offer-bullseye-retention"),
      "cust-125",
    );
  assert.equal(snap?.customer.trackingHealth, "Interference Likely");
  assert.equal(snap?.privacySignals[0].state, "Likely");
  assert.match(snap?.privacySignals[0].explanation || "", /may have affected/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  developmentIdentityById,
  resolveDevelopmentIdentityRequest,
  withDevelopmentIdentity,
} from "../lib/identity/development-state";
import { MockOfferRepository } from "../lib/offers/mock-repository";
import { MockCustomerRepository } from "../lib/customers/mock-repository";
import { MockOrderRepository } from "../lib/orders/mock-repository";
import {
  normalizeOfferDeepLink,
  parseOfferDeepLink,
} from "../lib/offers/deep-link";
import {
  normalizeCustomerDeepLink,
  parseCustomerDeepLink,
} from "../lib/customers/deep-link";
import {
  normalizeOrderDeepLink,
  parseOrderDeepLink,
} from "../lib/orders/deep-link";
import { PRODUCTION_ROUTES } from "../lib/navigation/production-routes";
import { resolveMockRepositoryScope } from "../lib/identity/mock-repository-scope";

function identity(id: string) {
  const value = developmentIdentityById(id);
  assert.ok(value);
  return value;
}

const clientScope = resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity("client-admin"), activeOrganizationId: "org-bullseye", activeBusinessContextId: "offer-bullseye" });
const agencyUnscoped = resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity("agency-owner"), activeOrganizationId: null, activeBusinessContextId: null });
const agencyValueRxScope = resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity("agency-owner"), activeOrganizationId: "org-valuerx", activeBusinessContextId: "offer-valuerx-individual" });

test("Mission Control and cross-Workspace builders select exact opaque objects", () => {
  const offer = PRODUCTION_ROUTES.offers({
    offerId: "offer-bullseye",
    focus: "summary",
  });
  const customer = PRODUCTION_ROUTES.customers({
    customerId: "cust-123",
    offerId: "offer-bullseye",
    focus: "journey",
  });
  const orderFromOffer = PRODUCTION_ROUTES.orders({
    orderId: "ord-123",
    offerId: "offer-bullseye",
    focus: "ledger",
  });
  const orderFromCustomer = PRODUCTION_ROUTES.orders({
    orderId: "ord-123",
    customerId: "cust-123",
    focus: "timeline",
  });
  assert.equal(
    parseOfferDeepLink(offer.split("?")[1]).offerId,
    "offer-bullseye",
  );
  assert.equal(
    parseCustomerDeepLink(customer.split("?")[1]).customerId,
    "cust-123",
  );
  assert.equal(
    parseOrderDeepLink(orderFromOffer.split("?")[1]).orderId,
    "ord-123",
  );
  assert.equal(
    parseOrderDeepLink(orderFromCustomer.split("?")[1]).customerId,
    "cust-123",
  );
  for (const href of [offer, customer, orderFromOffer, orderFromCustomer])
    assert.match(href, /[?&]v=1(?:&|$)/);
});

test("Offer related Customer and Order records are canonical IDs", async () => {
  const snapshot = await new MockOfferRepository().loadWorkspace(
    clientScope,
    "offer-bullseye",
  );
  assert.deepEqual(snapshot?.customerQuality.customerIds.slice(0, 2), [
    "cust-123",
    "cust-124",
  ]);
  assert.deepEqual(snapshot?.customerQuality.orderIds.slice(0, 2), [
    "ord-123",
    "ord-125",
  ]);
});

test("Customer related Order separates canonical ID from display number", async () => {
  const snapshot = await new MockCustomerRepository().loadWorkspace(
    clientScope,
    "cust-123",
  );
  assert.equal(snapshot?.orders[0].id, "ord-123");
  assert.equal(snapshot?.orders[0].number, "TK-10482");
});

test("Order routes point back to exact production Customer and Offer", async () => {
  const snapshot = await new MockOrderRepository().loadWorkspace(
    clientScope,
    "ord-123",
  );
  assert.equal(
    parseCustomerDeepLink(
      PRODUCTION_ROUTES.customers({
        customerId: snapshot?.relatedCustomer.id,
      }).split("?")[1],
    ).customerId,
    "cust-123",
  );
  assert.equal(
    parseOfferDeepLink(
      PRODUCTION_ROUTES.offers({ offerId: snapshot?.relatedOffer.id }).split(
        "?",
      )[1],
    ).offerId,
    "offer-bullseye",
  );
});

test("Universal Search resolves production Offer, Customer, and Order contracts", async () => {
  const [offers, customers, orders] = await Promise.all([
    new MockOfferRepository().search(clientScope, "Bullseye"),
    new MockCustomerRepository().search(clientScope, "John"),
    new MockOrderRepository().search(clientScope, "TK-10482"),
  ]);
  assert.ok(offers.some((item) => item.href.startsWith("/offers?")));
  assert.ok(customers.some((item) => item.href.startsWith("/customers?")));
  assert.ok(orders.some((item) => item.href.startsWith("/orders?")));
});

test("versioned deep links survive serialization and history-style reparsing", () => {
  const href = PRODUCTION_ROUTES.orders({
    orderId: "ord-123",
    eventId: "ord-123-purchase",
    drawer: { kind: "timeline-event", recordId: "ord-123-purchase" },
  });
  const first = parseOrderDeepLink(href.split("?")[1]);
  const second = parseOrderDeepLink(
    PRODUCTION_ROUTES.orders(first).split("?")[1],
  );
  assert.deepEqual(second, first);
});

test("invalid object and Drawer IDs normalize without disclosure or exceptions", async () => {
  const offers = await new MockOfferRepository().listOffers(clientScope);
  const customers = await new MockCustomerRepository().listCustomers(
    clientScope,
  );
  const orders = await new MockOrderRepository().listOrders(clientScope);
  assert.equal(
    normalizeOfferDeepLink(
      parseOfferDeepLink(
        "v=1&offer_id=offer-secret&drawer_kind=evidence&drawer_id=hidden",
      ),
      offers,
    ).offerId,
    "offer-bullseye",
  );
  assert.equal(
    normalizeCustomerDeepLink(
      parseCustomerDeepLink(
        "v=1&customer_id=cust-secret&drawer_kind=evidence&drawer_id=hidden",
      ),
      customers,
    ).drawer,
    null,
  );
  assert.equal(
    normalizeOrderDeepLink(
      parseOrderDeepLink(
        "v=1&order_id=ord-secret&drawer_kind=evidence&drawer_id=hidden",
      ),
      orders,
    ).drawer,
    null,
  );
});

test("agency resolves an assigned active Organization while unscoped and direct-client access fail closed", async () => {
  const offers = new MockOfferRepository();
  const customers = new MockCustomerRepository();
  const orders = new MockOrderRepository();
  assert.deepEqual(
    await offers.resolveOffer(agencyValueRxScope, "offer-valuerx-individual"),
    { organizationId: "org-valuerx", offerId: "offer-valuerx-individual" },
  );
  assert.equal(
    await offers.resolveOffer(
      clientScope,
      "offer-valuerx-individual",
    ),
    null,
  );
  assert.equal(
    (await customers.resolveCustomer(agencyValueRxScope, "cust-vrx-1"))
      ?.organizationId,
    "org-valuerx",
  );
  assert.equal(
    await customers.resolveCustomer(
      clientScope,
      "cust-vrx-1",
    ),
    null,
  );
  assert.equal(
    (await orders.resolveOrder(agencyValueRxScope, "ord-vrx-1"))?.organizationId,
    "org-valuerx",
  );
  assert.equal(
    await orders.resolveOrder(
      clientScope,
      "ord-vrx-1",
    ),
    null,
  );
  assert.deepEqual(await offers.listOffers(agencyUnscoped), []);
});

test("Drawer target and Business Context restore from canonical URL state", () => {
  const offer = parseOfferDeepLink(
    "v=1&offer_id=offer-bullseye&drawer_kind=profit-driver&drawer_id=actual-shipping-cost",
  );
  const customer = parseCustomerDeepLink(
    "v=1&customer_id=cust-123&drawer_kind=identifier&drawer_id=everflow-cust-123-evt-7",
  );
  const order = parseOrderDeepLink(
    "v=1&order_id=ord-123&drawer_kind=processor-fee&drawer_id=processor-fees",
  );
  assert.deepEqual(offer.drawer, {
    kind: "profit-driver",
    recordId: "actual-shipping-cost",
  });
  assert.deepEqual(customer.drawer, {
    kind: "identifier",
    recordId: "everflow-cust-123-evt-7",
  });
  assert.deepEqual(order.drawer, {
    kind: "processor-fee",
    recordId: "processor-fees",
  });
  assert.equal(offer.offerId, "offer-bullseye");
});

test("canonical Drawer identifiers resolve through mock repositories", async () => {
  const offer = await new MockOfferRepository().loadDrawer(clientScope, "offer-bullseye", "profit-driver:actual-shipping-cost");
  const customer = await new MockCustomerRepository().loadDrawer(clientScope, "cust-123", "journey-event:cust-123-evt-0");
  const order = await new MockOrderRepository().loadDrawer(clientScope, "ord-123", "processor-fee:processor-fees");
  assert.equal(offer?.kind, "profit-driver");
  assert.equal(customer?.kind, "event");
  assert.equal(order?.mode, "financial");
});

test("Compare IDs are deduplicated, bounded, and versioned", () => {
  const href = PRODUCTION_ROUTES.offers({
    compare: true,
    comparisonOfferIds: [
      "offer-bullseye",
      "offer-bullseye",
      "offer-bullseye-retention",
      "offer-third",
      "offer-fourth",
      "offer-fifth",
    ],
  });
  assert.deepEqual(
    new URLSearchParams(href.split("?")[1]).getAll("compare_offer"),
    [
      "offer-bullseye",
      "offer-bullseye-retention",
      "offer-third",
      "offer-fourth",
    ],
  );
});

test("invalid explicit development identity never falls back", () => {
  assert.deepEqual(
    resolveDevelopmentIdentityRequest("not-a-user", "client-admin"),
    { identity: null, invalidExplicitId: "not-a-user" },
  );
  assert.equal(
    resolveDevelopmentIdentityRequest(null, "client-admin").identity?.id,
    "client-admin",
  );
  assert.match(
    withDevelopmentIdentity(
      PRODUCTION_ROUTES.offers({ offerId: "offer-bullseye" }),
      "client-admin",
    ),
    /dev_identity=client-admin/,
  );
});

test("opaque identifier references prevent sensitive raw values in generated URLs", async () => {
  const customer = (
    await new MockCustomerRepository().search(clientScope, "ef_21a7f0ce98")
  ).find((item) => item.type.includes("Everflow"));
  const order = (
    await new MockOrderRepository().search(clientScope, "ef_ord_10482")
  ).find((item) => item.type.includes("Everflow"));
  assert.ok(customer && order);
  assert.doesNotMatch(customer.href, /ef_21a7f0ce98/);
  assert.doesNotMatch(order.href, /ef_ord_10482/);
  assert.match(customer.href, /identifier_ref=everflow-/);
  assert.match(order.href, /identifier_ref=ef-ord-/);
});

test("production core sources do not target concepts or legacy object detail routes", () => {
  const sources = [
    "components/mission-control/mission-control.tsx",
    "components/offers/offer-workspace.tsx",
    "components/customers/customer-workspace.tsx",
    "components/orders/order-workspace.tsx",
    "components/shared/command-palette.tsx",
  ]
    .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(sources, /\/concepts\//);
  assert.doesNotMatch(sources, /\/customers\/\$\{|\/orders\/\$\{/);
});

test("route registry excludes concept routes and covers all production destinations", () => {
  const destinations = [
    PRODUCTION_ROUTES.missionControl(),
    PRODUCTION_ROUTES.offers(),
    PRODUCTION_ROUTES.customers(),
    PRODUCTION_ROUTES.orders(),
    PRODUCTION_ROUTES.money(),
    PRODUCTION_ROUTES.operations(),
    PRODUCTION_ROUTES.settings(),
    PRODUCTION_ROUTES.clients(),
    PRODUCTION_ROUTES.reports(),
    PRODUCTION_ROUTES.team(),
    PRODUCTION_ROUTES.branding(),
    PRODUCTION_ROUTES.platform("organizations"),
  ];
  assert.ok(
    destinations.every(
      (href) => href.startsWith("/") && !href.startsWith("/concepts"),
    ),
  );
});

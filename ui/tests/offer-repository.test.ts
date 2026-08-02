import assert from "node:assert/strict";
import test from "node:test";
import { developmentIdentityById } from "../lib/identity/development-state";
import { withDevelopmentIdentity } from "../lib/identity/development-state";
import {
  normalizeOfferDeepLink,
  offerDeepLinkHref,
  parseOfferDeepLink,
} from "../lib/offers/deep-link";
import { MockOfferRepository } from "../lib/offers/mock-repository";

const identity = (id: string) => {
  const value = developmentIdentityById(id);
  assert.ok(value);
  return value;
};
const scope = (
  id = "client-admin",
  organizationId: string | null = "org-bullseye",
) => ({ authenticated: true, identity: identity(id), organizationId });

test("mock Offer snapshots are scoped, serializable, and freshly cloned", async () => {
  const repository = new MockOfferRepository();
  const offers = await repository.listOffers(scope());
  assert.deepEqual(
    offers.map((item) => item.organizationId),
    ["org-bullseye", "org-bullseye"],
  );
  const first = await repository.loadWorkspace(scope(), offers[0].id);
  assert.ok(first);
  first.offer.name = "Changed";
  const second = await repository.loadWorkspace(scope(), offers[0].id);
  assert.notEqual(second?.offer.name, "Changed");
  assert.doesNotThrow(() => JSON.stringify(second));
});

test("Offer scope rejects inaccessible Offers and product-admin client rendering", async () => {
  const repository = new MockOfferRepository();
  assert.equal(
    await repository.loadWorkspace(scope(), "offer-valuerx-individual"),
    null,
  );
  assert.deepEqual(
    await repository.listOffers(scope("platform-admin", null)),
    [],
  );
  assert.equal(
    await repository.resolveOffer(
      scope("client-admin", null),
      "offer-valuerx-individual",
    ),
    null,
  );
  assert.deepEqual(
    await repository.resolveOffer(
      scope("agency-owner", null),
      "offer-valuerx-individual",
    ),
    { organizationId: "org-valuerx", offerId: "offer-valuerx-individual" },
  );
});

test("deep links parse and normalize invalid route state safely", async () => {
  const repository = new MockOfferRepository();
  const offers = await repository.listOffers(scope());
  const snapshot = await repository.loadWorkspace(scope(), offers[0].id);
  const parsed = parseOfferDeepLink(
    "?offer_id=missing&focus=profit-drivers&driver=missing&event_id=missing&drawer=driver:missing&compare=1&compare_offer=missing",
  );
  const normalized = normalizeOfferDeepLink(parsed, offers, snapshot);
  assert.equal(normalized.offerId, offers[0].id);
  assert.equal(normalized.driverId, null);
  assert.equal(normalized.eventId, null);
  assert.equal(normalized.drawerId, null);
  assert.equal(normalized.compare, false);
});

test("Mission Control Offer hrefs preserve identity and production focus", () => {
  const href = withDevelopmentIdentity(
    offerDeepLinkHref({
      offerId: "offer-bullseye",
      focus: "profit-drivers",
      driverId: "actual-shipping-cost",
      drawer: { kind: "profit-driver", recordId: "actual-shipping-cost" },
    }),
    "client-admin",
  );
  assert.match(href, /^\/offers\?/);
  assert.match(href, /dev_identity=client-admin/);
  assert.match(href, /driver=actual-shipping-cost/);
  assert.doesNotMatch(href, /concepts/);
});

test("Compare accepts two to four valid accessible Offers and derives its conclusion", async () => {
  const repository = new MockOfferRepository();
  const agencyScope = scope("agency-owner", "org-valuerx");
  const comparison = await repository.loadComparison(agencyScope, [
    "offer-valuerx-individual",
    "offer-valuerx-family",
    "offer-valuerx-individual",
    "offer-bullseye",
  ]);
  assert.ok(comparison);
  assert.equal(comparison.offers.length, 2);
  assert.ok(comparison.conclusion.drivers.length);
  assert.ok(comparison.conclusion.evidence.length);
  assert.equal(
    await repository.loadComparison(agencyScope, ["offer-valuerx-individual"]),
    null,
  );
});

test("trend selection and Offer search resolve through repository use cases", async () => {
  const repository = new MockOfferRepository();
  const trend = await repository.loadTrend(scope(), "offer-bullseye", 14, [
    "profit",
    "cpa",
  ]);
  assert.equal(trend.length, 14);
  assert.ok(
    trend.every(
      (point) =>
        typeof point.profit === "number" && typeof point.cpa === "number",
    ),
  );
  const search = await repository.search(scope(), "Bullseye");
  assert.ok(search.some((result) => result.href.startsWith("/offers?")));
});

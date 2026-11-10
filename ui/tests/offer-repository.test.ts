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
import { resolveMockRepositoryScope } from "../lib/identity/mock-repository-scope";

const identity = (id: string) => {
  const value = developmentIdentityById(id);
  assert.ok(value);
  return value;
};
const scope = (
  id = "client-admin",
  organizationId: string | null = "org-bullseye",
) => resolveMockRepositoryScope({ authenticated: true, developmentOnly: true, identity: identity(id), activeOrganizationId: organizationId, activeBusinessContextId: organizationId === "org-bullseye" ? "offer-bullseye" : organizationId === "org-valuerx" ? "offer-valuerx-individual" : organizationId === "org-petes" ? "offer-petes" : null });

test("unobserved Offers never produce metrics, trends, comparison or search records", async () => {
  const repository = new MockOfferRepository();
  for (const current of [scope(), scope("client-read-only"), scope("agency-owner", "org-valuerx"), scope("platform-admin", null)]) {
    assert.deepEqual(await repository.listOffers(current), []);
    assert.equal(await repository.resolveOffer(current, "offer-bullseye"), null);
    assert.equal(await repository.loadWorkspace(current, "offer-bullseye"), null);
    assert.deepEqual(await repository.loadTrend(current, "offer-bullseye", 14, ["profit", "cpa"]), []);
    assert.equal(await repository.loadComparison(current, ["offer-bullseye", "offer-valuerx-individual"]), null);
    assert.equal(await repository.loadDrawer(current, "offer-bullseye", "profit-driver:actual-shipping-cost"), null);
    assert.deepEqual(await repository.search(current, "Bullseye"), []);
  }
});
test("missing Offer data clears unresolved object and drawer links", () => {
  const state = normalizeOfferDeepLink(parseOfferDeepLink("?offer_id=missing&driver=missing&compare=1&compare_offer=missing"), [], null);
  assert.equal(state.offerId, "missing");
  assert.equal(state.driverId, null);
  assert.equal(state.compare, false);
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

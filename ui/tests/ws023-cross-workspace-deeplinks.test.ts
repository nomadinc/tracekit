import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOrderDeepLink,
  parseOrderDeepLink,
} from "../lib/orders/deep-link";
import {
  normalizeCustomerDeepLink,
  parseCustomerDeepLink,
} from "../lib/customers/deep-link";
import {
  normalizeOfferDeepLink,
  parseOfferDeepLink,
} from "../lib/offers/deep-link";
import { ProductionOrderRepository } from "../lib/orders/production-repository";

test("explicit foreign and invalid IDs never normalize to another record", () => {
  const order = normalizeOrderDeepLink(
    parseOrderDeepLink("?order_id=next29:foreign"),
    [{ id: "next29:local" } as any],
    null,
  );
  assert.equal(order.orderId, "next29:foreign");

  const customer = normalizeCustomerDeepLink(
    parseCustomerDeepLink("?customer_id=foreign"),
    [{ id: "local" } as any],
    null,
  );
  assert.equal(customer.customerId, "foreign");

  const offer = normalizeOfferDeepLink(
    parseOfferDeepLink("?offer_id=foreign"),
    [{ id: "local" } as any],
    null,
  );
  assert.equal(offer.offerId, "foreign");
});

test("missing IDs retain ordinary default selection", () => {
  assert.equal(
    normalizeOrderDeepLink(
      parseOrderDeepLink(""),
      [{ id: "local-order" } as any],
    ).orderId,
    "local-order",
  );

  assert.equal(
    normalizeCustomerDeepLink(
      parseCustomerDeepLink(""),
      [{ id: "local-customer" } as any],
    ).customerId,
    "local-customer",
  );

  assert.equal(
    normalizeOfferDeepLink(
      parseOfferDeepLink(""),
      [{ id: "local-offer" } as any],
    ).offerId,
    "local-offer",
  );
});

test("mismatched Orders API response is rejected before related reads", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);

      return new Response(
        JSON.stringify({
          ok: true,
          orders: [{
            order: {
              platform_order_id: "next29:stem",
              order_id: "103104",
              organization_id: "stem",
              workspace_id: "stem",
            },
            customer: { id: "stem-customer" },
          }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    const repository = new ProductionOrderRepository();
    const result = await repository.loadWorkspace(
      {
        authenticated: true,
        workspaceId: "stem",
        organizationId: "stem",
        businessContextId: null,
        session: {},
      },
      "next29:nh",
    );

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /order_id=next29%3Anh/);
    assert.doesNotMatch(calls[0], /\/api\/customers\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

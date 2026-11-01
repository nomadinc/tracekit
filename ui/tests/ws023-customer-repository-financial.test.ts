import assert from "node:assert/strict";
import test from "node:test";
import { ProductionCustomerRepository } from "../lib/customers/production-repository";

const customerId = "3337c0e5-c0e0-4795-9bd6-d855acda3e1c";
const workspaceId = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";

const scope = {
  authenticated: true,
  workspaceId,
  organizationId: workspaceId,
  businessContextId: "stem-labs",
  session: {},
};

async function verify(
  amount: number | undefined,
  expected: number | null
) {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.TK_SECRET_KEY;
  const originalBase = process.env.TRACEKIT_API_BASE_URL;

  // Dummy credentials only. All Core requests are intercepted.
  process.env.TK_SECRET_KEY = "ws023-offline-test-only";
  process.env.TRACEKIT_API_BASE_URL = "http://127.0.0.1:18787";

  const requests: string[] = [];

  globalThis.fetch = async (input: any) => {
    const url = new URL(String(input), "http://localhost:3000");

    requests.push(url.pathname);

    assert.equal(
      url.pathname,
      `/v1/customers/${customerId}`
    );
    assert.equal(url.origin, "http://127.0.0.1:18787");
    assert.equal(url.searchParams.get("workspace_id"), workspaceId);

    const order: Record<string, unknown> = {
      order_id: "#1053",
      platform_order_id: "shopify:test:1053",
      status: "COMPLETED",
    };

    const summary: Record<string, unknown> = {
      total_orders: 1,
      total_journeys: 0,
    };

    if (amount !== undefined) {
      order.amount = amount;
      summary.lifetime_revenue = amount;
    }

    return Response.json({
      customer: {
        id: customerId,
        display_name: "Leon Snead",
      },
      summary,
      orders: [order],
      journeys: [],
      attribution: [],
    });
  };

  try {
    const result = await new ProductionCustomerRepository().loadWorkspace(
      scope as any,
      customerId
    );

    assert.ok(result);
    assert.equal(result.customer.id, customerId);
    assert.equal(result.orders.length, 1);
    assert.equal(result.orders[0].number, "#1053");
    assert.equal(result.orders[0].amount, expected);
    assert.equal(result.lifetimeRevenue, expected);
    assert.equal(result.journeyId, "No canonical journey");
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalSecret === undefined) {
      delete process.env.TK_SECRET_KEY;
    } else {
      process.env.TK_SECRET_KEY = originalSecret;
    }

    if (originalBase === undefined) {
      delete process.env.TRACEKIT_API_BASE_URL;
    } else {
      process.env.TRACEKIT_API_BASE_URL = originalBase;
    }
  }
}

test("authorized $87.29 remains available", async () => {
  await verify(87.29, 87.29);
});

test("redacted monetary fields remain unavailable", async () => {
  await verify(undefined, null);
});

test("genuine authorized zero remains zero", async () => {
  await verify(0, 0);
});

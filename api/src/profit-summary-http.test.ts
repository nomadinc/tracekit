import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.ts";

const CORE = "https://core.example.test";
const DB = "https://profit-db.example.test";
const SECRET = "synthetic-profit-test-secret";

type Row = {
  currency?: string | null;
  gross_revenue?: number;
  net_revenue?: number;
  net_profit?: number;
  [key: string]: unknown;
};

async function request(
  rows: Row[],
  query = "workspace_id=stem",
  authenticated = true
) {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];

  globalThis.fetch = async (input: any) => {
    const url = new URL(String(input));

    // Fail closed: never allow unexpected network traffic.
    assert.equal(url.origin, DB);
    assert.equal(url.pathname, "/rest/v1/profit_daily_rollups");

    calls.push(url);

    return Response.json(rows, {
      headers: {
        "content-type": "application/json",
      },
    });
  };

  try {
    const headers = authenticated
      ? { "x-tk-secret": SECRET }
      : {};

    const response = await worker.fetch(
      new Request(`${CORE}/v1/profit/summary?${query}`, {
        headers,
      }),
      {
        TK_SECRET_KEY: SECRET,
        SUPABASE_URL: DB,
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-db-key",
      } as any,
      {} as any
    );

    return {
      status: response.status,
      body: await response.json() as any,
      calls,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function row(currency: string | null, amount = 87.29): Row {
  return {
    workspace_id: "stem",
    day: "2026-10-31",
    currency,
    gross_revenue: amount,
    net_revenue: amount,
    net_profit: amount,
    order_count: 1,
    event_count: 1,
  };
}

for (const currency of ["USD", "GBP", "EUR"]) {
  test(`${currency} Profit summary returns qualified HTTP 200`, async () => {
    const result = await request([row(currency)]);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.currency, currency);
    assert.equal(result.body.data_available, true);
    assert.equal(result.body.financial_status, "operational_unreconciled");
    assert.equal(result.body.gross_revenue, 87.29);
    assert.equal(result.calls.length, 1);
  });
}

test("mixed currencies return HTTP 422 without aggregated profit", async () => {
  const result = await request([row("USD"), row("EUR")]);

  assert.equal(result.status, 422);
  assert.equal(result.body.error, "profit_currency_qualification_required");
  assert.equal(result.body.net_profit, undefined);
  assert.deepEqual(result.body.currencies, ["EUR", "USD"]);
});

test("missing currency returns HTTP 422", async () => {
  const result = await request([row(null)]);

  assert.equal(result.status, 422);
  assert.equal(result.body.error, "profit_currency_qualification_required");
});

test("empty period reports no data, not a qualified currency", async () => {
  const result = await request([]);

  assert.equal(result.status, 200);
  assert.equal(result.body.data_available, false);
  assert.equal(result.body.currency, null);
  assert.equal(result.body.financial_status, "operational_unreconciled");
});

test("unauthenticated Profit request is denied before database access", async () => {
  const result = await request([row("USD")], "workspace_id=stem", false);

  assert.equal(result.status, 401);
  assert.equal(result.calls.length, 0);
});

test("missing workspace is rejected before database access", async () => {
  const result = await request([row("USD")], "");

  assert.equal(result.status, 400);
  assert.equal(result.calls.length, 0);
});

test("date, connector, platform and currency filters reach PostgREST", async () => {
  const result = await request(
    [row("USD")],
    "workspace_id=stem&from=2026-10-01&to=2026-10-31&connector_id=shopify&platform=shopify&currency=USD"
  );

  assert.equal(result.status, 200);

  const url = result.calls[0];

  assert.equal(url.searchParams.get("workspace_id"), "eq.stem");
  assert.deepEqual(
    url.searchParams.getAll("day"),
    ["gte.2026-10-01", "lte.2026-10-31"]
  );
  assert.equal(url.searchParams.get("connector_id"), "eq.shopify");
  assert.equal(url.searchParams.get("platform"), "eq.shopify");
  assert.equal(url.searchParams.get("currency"), "eq.USD");

  const filters = [...url.searchParams.entries()];
  assert.ok(filters.some(([key, value]) => key === "day" && value === "gte.2026-10-01"));
  assert.ok(filters.some(([key, value]) => key === "day" && value === "lte.2026-10-31"));
});

test("offer-scoped Profit fails closed without database access", async () => {
  for (const offerId of ["67", "foreign-offer"]) {
    const result = await request(
      [row("USD")],
      `workspace_id=stem&offer_id=${encodeURIComponent(offerId)}`
    );

    assert.equal(result.status, 422);
    assert.equal(result.body.error, "profit_offer_identity_unresolved");
    assert.equal(result.body.data_available, false);
    assert.equal(result.body.net_profit, undefined);
    assert.equal(result.calls.length, 0);
  }
});

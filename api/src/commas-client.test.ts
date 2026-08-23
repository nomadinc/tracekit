import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CommasClient, type CommasDiscoveryDiagnosticEvent } from "./connectors/commas/client.ts";
import {
  CommasAuthenticationError,
  CommasAuthorizationError,
  CommasConfigurationError,
  CommasNotFoundError,
  CommasRateLimitError,
  CommasTransientError,
  CommasValidationError,
  redactCommasText,
} from "./connectors/commas/errors.ts";
import {
  compareProductAndService,
  compareTransactionListAndDetail,
  summarizeCommasDiscovery,
  summarizeNestedTransactions,
  summarizeObservedProducts,
  summarizeTwoPageTraversal,
} from "./connectors/commas/discovery.ts";
import { compareCommasProductMap } from "./connectors/commas/product-map.ts";
import { runBoundedCommasDiscovery } from "./connectors/commas/bounded-discovery.ts";
import { discoverCommasIdentifierSurface } from "./connectors/commas/identifier-discovery.ts";
import { selectCommasDiscoveryAccount } from "./connectors/commas/account-selection.ts";
import { probeCommasDisputeCollections, sanitizeCommasFixture } from "./connectors/commas/dispute-discovery.ts";
import { verifyCommasReadOnlyConnection } from "./connectors/commas/verification.ts";

const syntheticProduct = {
  id: "prod_synthetic_1",
  title: "Synthetic Main",
  internal_name: "GR",
  description: "Synthetic fixture",
  price: "67.00",
  payment_link: "https://example.invalid/pay/prod_synthetic_1",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function productsPage(page = 1, totalPages = 1, items = [syntheticProduct]) {
  return {
    status: "success",
    data: {
      current_page: page,
      data: items,
      per_page: 1,
      last_page: totalPages,
      total: totalPages,
      next_page_url: page < totalPages ? `https://example.invalid/products?page=${page + 1}` : null,
    },
    request_id: `req_synthetic_${page}`,
  };
}

function clientWith(fetcher: typeof fetch, options: Record<string, unknown> = {}) {
  return new CommasClient(
    { apiKey: "synthetic-api-key", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, ...options },
    { fetch: fetcher, sleep: async () => {}, random: () => 0, correlationId: () => "corr_synthetic" },
  );
}

test("constructs the documented API-key header without alternate auth", async () => {
  let captured: RequestInit | undefined;
  const client = clientWith(async (_url, init) => {
    captured = init;
    return jsonResponse(productsPage());
  });
  await client.listProducts({ perPage: 1 });
  const headers = new Headers(captured?.headers);
  assert.equal(headers.get("x-api-key"), "synthetic-api-key");
  assert.equal(headers.get("authorization"), null);
});

test("rejects missing configuration without serializing credentials", () => {
  assert.throws(() => new CommasClient({ apiKey: "" }), CommasConfigurationError);
});

test("constructs production resource URLs", async () => {
  let capturedUrl = "";
  const client = new CommasClient({ apiKey: "synthetic-api-key" }, {
    fetch: async (url) => {
      capturedUrl = String(url);
      return jsonResponse(productsPage());
    },
    correlationId: () => "corr_synthetic",
  });
  await client.listProducts({ page: 2, perPage: 10 });
  assert.equal(capturedUrl, "https://www.fanbasis.com/public-api/products?page=2&per_page=10");
});

test("encodes transaction query parameters", async () => {
  let capturedUrl = "";
  const client = clientWith(async (url) => {
    capturedUrl = String(url);
    return jsonResponse({ data: { transactions: [], pagination: { current_page: 1, total_pages: 1 } } });
  });
  await client.listTransactions({ productId: "prod / 1", customerId: "cust+1", page: 1, perPage: 5 });
  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get("product_id"), "prod / 1");
  assert.equal(url.searchParams.get("customer_id"), "cust+1");
});

test("parses Laravel pagination", async () => {
  const client = clientWith(async () => jsonResponse(productsPage(1, 2)));
  const page = await client.listProducts({ perPage: 1 });
  assert.deepEqual(page.pagination, {
    currentPage: 1,
    perPage: 1,
    totalPages: 2,
    totalItems: 2,
    hasMore: true,
    nextPage: 2,
  });
});

test("iterates multiple pages without duplicating page requests", async () => {
  const requested: number[] = [];
  const client = clientWith(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    requested.push(page);
    return jsonResponse(productsPage(page, 2, [{ ...syntheticProduct, id: `prod_${page}` }]));
  });
  const ids: string[] = [];
  for await (const page of client.iterateProducts({ perPage: 1, maxPages: 2 })) ids.push(...page.items.map((item) => item.id));
  assert.deepEqual(requested, [1, 2]);
  assert.deepEqual(ids, ["prod_1", "prod_2"]);
});

test("types 401 as authentication and does not retry", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return jsonResponse({ status: "error", message: "Invalid key" }, 401);
  });
  await assert.rejects(client.listProducts(), CommasAuthenticationError);
  assert.equal(calls, 1);
});

test("types 403 as authorization and does not retry", async () => {
  const client = clientWith(async () => jsonResponse({ status: "error", message: "Forbidden" }, 403));
  await assert.rejects(client.listProducts(), CommasAuthorizationError);
});

test("types 404 as not found", async () => {
  const client = clientWith(async () => jsonResponse({ status: "error", message: "Missing" }, 404));
  await assert.rejects(client.getTransaction("tx_synthetic"), CommasNotFoundError);
});

test("retries 429 using Retry-After", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 2 },
    {
      fetch: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ success: false, message: "Rate limited" }, 429, { "Retry-After": "2" })
          : jsonResponse(productsPage());
      },
      sleep: async (ms) => { sleeps.push(ms); },
      correlationId: () => "corr_synthetic",
    },
  );
  await client.listProducts();
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("returns typed rate-limit error after bounded attempts", async () => {
  const client = clientWith(
    async () => jsonResponse({ success: false, message: "Rate limited" }, 429, { "Retry-After": "0" }),
    { maxAttempts: 2 },
  );
  await assert.rejects(client.listProducts(), CommasRateLimitError);
});

test("retries transient 5xx", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return calls === 1 ? jsonResponse({ message: "Temporary" }, 503) : jsonResponse(productsPage());
  }, { maxAttempts: 2 });
  await client.listProducts();
  assert.equal(calls, 2);
});

test("does not retry non-retryable 400", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return jsonResponse({ message: "Invalid" }, 400);
  });
  await assert.rejects(client.listProducts(), CommasValidationError);
  assert.equal(calls, 1);
});

test("types timeout failures without leaking request configuration", async () => {
  const client = clientWith((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }), { timeoutMs: 1, maxAttempts: 1 });
  await assert.rejects(client.listProducts(), (error: unknown) => {
    assert.ok(error instanceof CommasTransientError);
    assert.equal(error.status, 408);
    assert.doesNotMatch(JSON.stringify(error), /synthetic-api-key/);
    return true;
  });
});

test("redacts sensitive strings", () => {
  const redacted = redactCommasText("buyer@synthetic.example Bearer abcdefghijklmnopqrstuvwxyz123456 api_key=secret-value");
  assert.doesNotMatch(redacted, /buyer@|Bearer abc|secret-value/);
});

test("redaction preserves ISO timestamps and does not mistake rate-limit reset epochs for phones", async () => {
  const timestamp = "2026-08-04T12:34:56.123Z";
  assert.equal(redactCommasText(`updated ${timestamp}`), `updated ${timestamp}`);
  const events: CommasDiscoveryDiagnosticEvent[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true },
    {
      fetch: async () => jsonResponse(productsPage(), 200, { "X-RateLimit-Reset": "1785864000" }),
      correlationId: () => "corr_synthetic",
      discoveryDiagnostic: (event) => events.push(event),
    },
  );
  await client.listProducts();
  const response = events.find((event) => event.phase === "response");
  assert.equal(response?.responseHeaders?.["x-ratelimit-reset"], "1785864000");
});

test("preserves unknown fields behind raw provider types", async () => {
  const client = clientWith(async () => jsonResponse(productsPage(1, 1, [{ ...syntheticProduct, future_field: { enabled: true } }])));
  const page = await client.listProducts();
  assert.deepEqual(page.items[0].future_field, { enabled: true });
});

test("supports empty lists", async () => {
  const client = clientWith(async () => jsonResponse(productsPage(1, 1, [])));
  const page = await client.listProducts();
  assert.deepEqual(page.items, []);
  assert.equal(page.pagination.hasMore, false);
});

test("rejects malformed success responses", async () => {
  const client = clientWith(async () => jsonResponse({ status: "success", data: { unexpected: true } }));
  await assert.rejects(client.listProducts(), CommasValidationError);
});

test("rejects list items without verified provider identity", async () => {
  const client = clientWith(async () => jsonResponse(productsPage(1, 1, [{ title: "Missing ID" } as typeof syntheticProduct])));
  await assert.rejects(client.listProducts(), CommasValidationError);
});

test("propagates an internal request correlation ID", async () => {
  const client = clientWith(async () => jsonResponse(productsPage()));
  const page = await client.listProducts({}, { correlationId: "corr_requested" });
  assert.equal(page.correlationId, "corr_requested");
});

test("exposes no mutation or unsupported read methods", () => {
  const client = clientWith(async () => jsonResponse(productsPage()));
  assert.deepEqual(client.supportedMethods, ["listProducts", "listCustomers", "listTransactions", "getTransaction"]);
  for (const method of ["createProduct", "chargeCustomer", "issueRefund", "respondToDispute", "listRefunds", "listDisputes"]) {
    assert.equal(method in client, false);
  }
});

test("serialized provider errors exclude credentials and response bodies", async () => {
  const client = clientWith(async () => jsonResponse({
    message: "buyer@synthetic.example failed with token abcdefghijklmnopqrstuvwxyz123456",
    payload: { api_key: "should-never-serialize" },
  }, 401));
  await assert.rejects(client.listProducts(), (error: unknown) => {
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, /buyer@|should-never-serialize|abcdefghijklmnopqrstuvwxyz/);
    return true;
  });
});

test("normal client operation emits no discovery diagnostics", async () => {
  const originalError = console.error;
  let writes = 0;
  console.error = () => { writes += 1; };
  try {
    await clientWith(async () => jsonResponse(productsPage())).listProducts();
  } finally {
    console.error = originalError;
  }
  assert.equal(writes, 0);
});

test("opt-in discovery diagnostics capture a redacted HTTP 500 exchange", async () => {
  const events: CommasDiscoveryDiagnosticEvent[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic-api-key", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 1 },
    {
      fetch: async () => new Response(JSON.stringify({
        message: "Failure for buyer@synthetic.example",
        customer: { phone: "+1 (415) 555-0199", address: "123 Synthetic Street" },
        payment_token: "abcdefghijklmnopqrstuvwxyz1234567890",
      }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": "req-safe", "set-cookie": "private=value" },
      }),
      sleep: async () => {},
      correlationId: () => "corr_synthetic",
      discoveryDiagnostic: (event) => events.push(event),
    },
  );
  await assert.rejects(client.listProducts({ page: 1, perPage: 2 }), CommasTransientError);
  const response = events.find((event) => event.phase === "response");
  assert.equal(response?.status, 500);
  assert.equal(response?.url, "http://127.0.0.1:8787/public-api/products");
  assert.deepEqual(response?.query, { page: "1", per_page: "2" });
  assert.equal(response?.providerRequestId, "req-safe");
  assert.equal(response?.responseHeaders?.["set-cookie"], "<redacted>");
  assert.doesNotMatch(JSON.stringify(events), /synthetic-api-key|buyer@|555-0199|Synthetic Street|private=value|abcdefghijklmnopqrstuvwxyz/);
});

test("discovery diagnostics distinguish malformed JSON from an HTTP failure", async () => {
  const events: CommasDiscoveryDiagnosticEvent[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 1 },
    {
      fetch: async () => new Response("not-json", { status: 200 }),
      correlationId: () => "corr_synthetic",
      discoveryDiagnostic: (event) => events.push(event),
    },
  );
  await assert.rejects(client.listProducts(), CommasTransientError);
  assert.ok(events.some((event) => event.phase === "response" && event.status === 200));
  assert.ok(events.some((event) => event.phase === "json_parse_failure"));
  assert.equal(events.some((event) => event.phase === "network_failure"), false);
});

test("discovery diagnostics distinguish fetch failures without exposing request credentials", async () => {
  const events: CommasDiscoveryDiagnosticEvent[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic-api-key", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 1 },
    {
      fetch: async () => { throw new TypeError("network unavailable"); },
      correlationId: () => "corr_synthetic",
      discoveryDiagnostic: (event) => events.push(event),
    },
  );
  await assert.rejects(client.listProducts(), CommasTransientError);
  assert.ok(events.some((event) => event.phase === "network_failure"));
  assert.doesNotMatch(JSON.stringify(events), /synthetic-api-key/);
});

test("transaction detail diagnostics redact the path identifier and record JSON parsing", async () => {
  const events: CommasDiscoveryDiagnosticEvent[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 1 },
    {
      fetch: async () => jsonResponse({ status: "error", message: "Failed to retrieve transaction", request_id: "req-safe" }, 500),
      correlationId: () => "corr_synthetic",
      discoveryDiagnostic: (event) => events.push(event),
    },
  );
  await assert.rejects(client.getTransaction("sensitive-transaction-id"), CommasTransientError);
  const response = events.find((event) => event.phase === "response");
  assert.equal(response?.url, "http://127.0.0.1:8787/public-api/transactions/:transactionId");
  assert.equal(response?.status, 500);
  assert.equal(response?.providerRequestId, "req-safe");
  assert.equal(response?.jsonParsed, true);
  assert.doesNotMatch(JSON.stringify(events), /sensitive-transaction-id/);
});

test("discovery summaries report shape while redacting customer fields", async () => {
  const client = clientWith(async () => jsonResponse({
    data: [{ id: "cust_synthetic", name: "Synthetic Person", email: "person@synthetic.example", total_spent: 10 }],
    pagination: { current_page: 1, total_pages: 1 },
  }));
  const page = await client.listCustomers();
  const summary = summarizeCommasDiscovery("customers", page);
  assert.equal(summary.redactedExampleStructure?.name, "<redacted>");
  assert.equal(summary.redactedExampleStructure?.email, "<redacted>");
  assert.equal(summary.redactedExampleStructure?.id, "<opaque-id>");
  assert.equal(JSON.stringify(summary).includes("Synthetic Person"), false);
});

test("matches product maps by immutable Product ID rather than row order", () => {
  const report = compareCommasProductMap([
    { productId: "prod_main", title: "Main", internalName: "GR", price: "$67.00" },
    { productId: "prod_upsell", title: "Gold", internalName: "GR -> OTO1 DS1", price: "$197.00" },
  ], [
    { id: "prod_upsell", title: "Gold", internal_name: "GR -> OTO1 DS1", price: "197.00" },
    { id: "prod_main", title: "Main", internal_name: "GR", price: "67" },
  ]);
  assert.equal(report[0].apiProductIdMatch, true);
  assert.equal(report[0].proposedRole, "front_end");
  assert.equal(report[1].proposedStep, 1);
  assert.equal(report[1].proposedVariant, "discount-1");
  assert.equal(report[1].confidence, "high");
});

test("bounded traversal proves distinct IDs without exposing them", async () => {
  const client = clientWith(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return jsonResponse(productsPage(page, 2, [{ ...syntheticProduct, id: `prod_${page}` }]));
  });
  const page1 = await client.listProducts({ page: 1, perPage: 2 });
  const page2 = await client.listProducts({ page: 2, perPage: 2 });
  const summary = summarizeTwoPageTraversal("transactions", page1, page2);
  assert.equal(summary.distinctIdCount, 2);
  assert.equal(summary.repeatedIdCount, 0);
  assert.doesNotMatch(JSON.stringify(summary), /prod_1|prod_2/);
});

test("nested transaction discovery reports field names and types without values", () => {
  const transaction = {
    id: 101,
    fan: { id: "fan_1", email: "private@example.invalid" },
    product: { id: "prod_1", title: "Private Product", internal_name: "GR -> OTO1 DS1", price: "197.00" },
    service: { id: "prod_1", title: "Private Product", internal_name: "GR -> OTO1 DS1", price: "197.00" },
    servicePayment: { id: "pay_1", payment_type: "auto_renew", processor: "synthetic" },
    refunds: [{ id: "refund_1", amount: "10.00", created_at: "2026-08-04T00:00:00Z" }],
  };
  const nested = summarizeNestedTransactions([transaction]);
  assert.deepEqual(nested.refundItem.map((field) => field.field), ["amount", "created_at", "id"]);
  assert.doesNotMatch(JSON.stringify(nested), /private@example|Private Product|auto_renew|synthetic/);
  const products = summarizeObservedProducts([transaction]);
  assert.equal(products[0].internalNameClassification, "upsell-1-discount-1-candidate");
  assert.equal(products[0].title, "<present-redacted>");
  assert.deepEqual(products[0].observedPrices, ["197.00"]);
  assert.equal(compareProductAndService([transaction]).conclusion, "identical-in-bounded-sample");
});

test("transaction list/detail comparison exposes only schema differences", () => {
  const list = { id: 1, amount: "10.00", fan: { email: "private@example.invalid" } };
  const detail = { ...list, servicePayment: { payment_type: "card" } };
  const comparison = compareTransactionListAndDetail(list, detail);
  assert.deepEqual(comparison.detailOnlyFields, ["servicePayment"]);
  assert.doesNotMatch(JSON.stringify(comparison), /private@example|10\.00|card/);
});

test("bounded discovery reports detail HTTP 500 while preserving pagination and refund findings", async () => {
  const calls: string[] = [];
  const client = new CommasClient(
    { apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, maxAttempts: 1 },
    {
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(`${url.pathname}?${url.searchParams.toString()}`);
        const page = Number(url.searchParams.get("page") ?? 1);
        if (url.pathname === "/public-api/customers") {
          return jsonResponse({ data: { customers: [{ id: `cust_${page}` }], pagination: { current_page: page, total_pages: 2, total_items: 2, has_more: page < 2 } } });
        }
        if (url.pathname === "/public-api/checkout-sessions/transactions") {
          const refunds = page === 3 ? [{ id: "refund_private", reason: "private reason" }] : [];
          return jsonResponse({ data: { transactions: [{ id: page, product: { id: "prod_1", title: "Private", price: "10.00" }, refunds }], pagination: { current_page: page, total_pages: 3, total_items: 3, has_more: page < 3 } } });
        }
        if (url.pathname.startsWith("/public-api/transactions/")) {
          return jsonResponse({ message: "Failed for private@example.invalid", payload: { phone: "3055550100" } }, 500);
        }
        throw new Error("unexpected request");
      },
      sleep: async () => {},
      correlationId: () => "corr_synthetic",
    },
  );
  const summary = await runBoundedCommasDiscovery(client, { refundPageCap: 3 });
  assert.equal(summary.transaction_detail.status, "unavailable_provider_500");
  assert.equal(summary.customers.distinctIdCount, 2);
  assert.equal(summary.transactions.distinctIdCount, 2);
  assert.equal(summary.refundScan.found, true);
  assert.equal(summary.refundScan.foundOnPage, 3);
  assert.ok(calls.some((call) => call.includes("transactions?page=3")));
  assert.doesNotMatch(JSON.stringify(summary), /private@example|3055550100|private reason|refund_private/);
});

test("bounded discovery still aborts on required list authentication failure", async () => {
  let calls = 0;
  const client = clientWith(async () => {
    calls += 1;
    return jsonResponse({ message: "Invalid API key" }, 401);
  });
  await assert.rejects(runBoundedCommasDiscovery(client), CommasAuthenticationError);
  assert.equal(calls, 1);
});

test("identifier discovery matches case and separators while emitting paths only", () => {
  const surface = discoverCommasIdentifierSurface([{
    id: 1,
    MetaData: {
      "Everflow-Transaction-ID": "private-tid-value",
      UTM_SOURCE: null,
      Custom_Fields: "{\"ClickId\":\"private-click-value\",\"gclid\":null}",
    },
    product: { payment_link: "https://private.invalid/checkout" },
    servicePayment: { checkoutSessionId: "private-session-value" },
  }], { account: "main", pagesScanned: 2, pageCap: 5 });
  assert.equal(surface.account, "main");
  assert.deepEqual(surface.exactMatchedFieldPaths, [
    "transaction.MetaData",
    "transaction.MetaData.Custom_Fields",
    "transaction.MetaData.Custom_Fields.$json.ClickId",
    "transaction.MetaData.Custom_Fields.$json.gclid",
    "transaction.MetaData.Everflow-Transaction-ID",
    "transaction.MetaData.UTM_SOURCE",
    "transaction.product.payment_link",
    "transaction.servicePayment.checkoutSessionId",
  ]);
  assert.ok(surface.presentButEmptyOrNullFieldPaths.includes("transaction.MetaData.UTM_SOURCE"));
  assert.ok(surface.presentButEmptyOrNullFieldPaths.includes("transaction.MetaData.Custom_Fields.$json.gclid"));
  assert.deepEqual(surface.exactMatchedFieldTypes.find((field) => field.path.endsWith("Everflow-Transaction-ID"))?.types, ["string"]);
  assert.equal(surface.externalAttributionIdentifiersObserved, true);
  assert.equal(surface.checkoutReferenceAssessment, "additional_checkout_references_observed");
  assert.doesNotMatch(JSON.stringify(surface), /private-tid|private-click|private-session|private\.invalid/);
});

test("identifier discovery reports absent attribution and webhook-dependent disputes", () => {
  const surface = discoverCommasIdentifierSurface([{ id: 1, fan: {}, refunds: [] }], { account: "small", pagesScanned: 2, pageCap: 2 });
  assert.equal(surface.externalAttributionIdentifiersObserved, false);
  assert.ok(surface.fieldsNotObserved.includes("everflow_transaction_id"));
  assert.equal(surface.disputeSurface.pollingEndpointStatus, "not_documented");
  assert.equal(surface.disputeSurface.conclusion, "webhook_or_provider_support_dependent");
});

test("identifier discovery reports dispute field paths without values", () => {
  const surface = discoverCommasIdentifierSurface([{
    id: 1,
    refunds: [{ processor_dispute: { chargeback_id: "private-chargeback", reversal: null } }],
  }], { account: "main", pagesScanned: 1, pageCap: 5 });
  assert.deepEqual(surface.disputeSurface.matchedFieldPaths, ["transaction.refunds[].processor_dispute", "transaction.refunds[].processor_dispute.reversal"]);
  assert.ok(surface.disputeSurface.candidateFieldPaths.includes("transaction.refunds[].processor_dispute.chargeback_id"));
  assert.doesNotMatch(JSON.stringify(surface), /private-chargeback/);
});

test("account selection is explicit and never defaults when credentials coexist", () => {
  const environment = {
    COMMAS_API_KEY_SMALL_ACCOUNT: "small-secret",
    COMMAS_API_KEY_MAIN_ACCOUNT: "main-secret",
  };
  assert.deepEqual(selectCommasDiscoveryAccount(["--account=main"], environment), { account: "main", apiKey: "main-secret" });
  assert.deepEqual(selectCommasDiscoveryAccount(["--account=small"], environment), { account: "small", apiKey: "small-secret" });
  assert.throws(() => selectCommasDiscoveryAccount([], environment), /explicit --account/);
  assert.throws(() => selectCommasDiscoveryAccount(["--account=unknown"], environment), /Invalid Commas account/);
  assert.throws(() => selectCommasDiscoveryAccount(["--account=main"], { COMMAS_API_KEY_SMALL_ACCOUNT: "small-secret" }), /main account credential is not configured/);
});

test("dispute discovery probes only the two allowlisted read-only collections", async () => {
  const requests: Array<{ url: string; method?: string; key: string | null }> = [];
  const result = await probeCommasDisputeCollections({
    apiKey: "main-secret",
    baseUrl: "http://127.0.0.1:8787",
    fetch: async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method, key: new Headers(init?.headers).get("x-api-key") });
      return url.includes("/disputes?")
        ? jsonResponse({ status: "error", message: "Route unavailable", request_id: "req-disputes" }, 404)
        : jsonResponse({ status: "error", message: "Forbidden private@example.invalid", secret: "do-not-print" }, 403, { "set-cookie": "private=value" });
    },
  });
  assert.equal(result.endpointsTested, 2);
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), ["/public-api/disputes", "/public-api/chargebacks"]);
  assert.ok(requests.every((request) => request.method === "GET" && request.key === "main-secret"));
  assert.deepEqual(result.results.map((entry) => entry.classification), ["not_found", "requires_different_permissions"]);
  assert.ok(result.results.every((entry) => entry.url.endsWith("?page=1&per_page=2")));
  assert.equal(result.results[0].providerRequestIdPresent, true);
  assert.equal(result.results[1].responseHeaders["set-cookie"], "<redacted>");
  assert.doesNotMatch(JSON.stringify(result), /main-secret|private@example|do-not-print|private=value/);
});

test("functional dispute probe reports structure without record values", async () => {
  const result = await probeCommasDisputeCollections({
    apiKey: "synthetic",
    baseUrl: "http://127.0.0.1:8787",
    fetch: async (input) => String(input).includes("/disputes?")
      ? jsonResponse({ data: { disputes: [{ dispute_id: "private-dispute", amount: 99 }], pagination: { current_page: 1, has_more: false } } })
      : jsonResponse({ message: "Missing" }, 404),
  });
  assert.equal(result.results[0].classification, "undocumented_but_functional");
  assert.deepEqual(result.results[0].paginationKeys, ["current_page", "has_more"]);
  assert.ok(result.results[0].bodyStructure.some((field) => field.path === "data.disputes[].dispute_id" && field.type === "string"));
  assert.doesNotMatch(JSON.stringify(result), /private-dispute|99/);
});

test("sanitized dispute fixture removes PII/secrets while preserving relationships and enums", () => {
  const fixture = sanitizeCommasFixture({ data: { disputes: [{ dispute_id: "D-1", transaction_id: "T-1", status: "OPEN", reason_code: "FRAUD", amount: "12.00", customer_email: "person@example.invalid", api_token: "secret-token" }, { dispute_id: "D-2", transaction_id: "T-1", status: "WON" }] } }) as any;
  assert.match(fixture.data.disputes[0].dispute_id, /^id_[0-9a-f]+$/);
  assert.notEqual(fixture.data.disputes[0].dispute_id, fixture.data.disputes[1].dispute_id);
  assert.equal(fixture.data.disputes[0].transaction_id, fixture.data.disputes[1].transaction_id);
  assert.equal(fixture.data.disputes[0].status, "OPEN");
  assert.equal(fixture.data.disputes[0].reason_code, "FRAUD");
  assert.match(fixture.data.disputes[0].customer_email, /^email_[0-9a-f]+$/);
  assert.match(fixture.data.disputes[0].api_token, /^redacted_[0-9a-f]+$/);
  assert.doesNotMatch(JSON.stringify(fixture), /person@example|secret-token/);
});

test("dispute endpoint failures are isolated and each candidate stays page-one/per-page-two", async () => {
  const requests: string[] = [];
  const result = await probeCommasDisputeCollections({ apiKey: "synthetic", baseUrl: "http://127.0.0.1:8787", fetch: async (input) => {
    requests.push(String(input));
    if (String(input).includes("/disputes?")) throw new Error("network unavailable");
    return jsonResponse({ data: { chargebacks: [] } }, 200, { "x-ratelimit-remaining": "9988" });
  } });
  assert.equal(requests.length, 2);
  assert.deepEqual(result.results.map((entry) => entry.status), [0, 200]);
  for (const request of requests) {
    const url = new URL(request);
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("per_page"), "2");
  }
});

test("manual contract runner is read-only, explicit, and never enters scheduler code", () => {
  const source = readFileSync(new URL("../../ui/scripts/run-commas-dispute-contract-discovery.ts", import.meta.url), "utf8");
  assert.match(source, /--confirm-commas-dispute-contract-discovery/);
  assert.match(source, /providerRequestsMaximum: 2/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|DELETE|PUT)/);
  assert.doesNotMatch(source, /commerce_sync_checkpoints|commerce_sync_runs.*(?:POST|insert)|commerce_evidence_records/);
  assert.doesNotMatch(source, /runCommerceCron|queue\.send|TRACEKIT_COMMERCE_SCHEDULER/);
});

test("connection verification performs one bounded Customer read and returns no provider values", async () => {
  const requests: string[] = [];
  const result = await verifyCommasReadOnlyConnection(
    { apiKey: "synthetic-verification-secret", baseUrl: "http://127.0.0.1:8787", allowCustomBaseUrl: true, environment: "custom" },
    { fetch: async (input) => {
      requests.push(String(input));
      return jsonResponse({ data: { customers: [{ id: "private-customer", email: "private@example.invalid" }], pagination: { current_page: 1, per_page: "1", total_pages: 1, total_items: 1, has_more: false } } }, 200, { "x-ratelimit-limit": "10000", "x-request-id": "request-a" });
    } },
  );
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0]).pathname, "/public-api/customers");
  assert.equal(new URL(requests[0]).searchParams.get("per_page"), "1");
  assert.deepEqual(result.capabilities, ["customers.read", "transactions.read"]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-verification-secret|private-customer|private@example/);
});
